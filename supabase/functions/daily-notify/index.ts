// 家族カレンダーの「毎日20時の通知」を送る Supabase Edge Function。
// Supabase の pg_cron が毎日 20:00(日本時間)に呼ぶ。Render のサーバーが寝ていても届く。
//
// 判定ロジックは server.py の run_cron_notify と同じ:
//  ① 翌日の予定のうち「通知ON」かつ「まだ前日通知していない」ものに前日通知
//     (追加した人がいればその人だけ、いなければ全員。送ったら reminded_daybefore=true)
//  ② その日が日曜なら、明日から7日分の予定まとめを全員に送る
//  当日通知は送らない。
//
// 呼び方(ヘッダ x-notify-token に NOTIFY_TOKEN が必要):
//   ふつう            … 本番の送信
//   ?dry=1            … お試し。誰に何を送るかだけ返す(送信も記録もしない)
//   ?test=亜耶        … その人にだけテスト通知を1通送る(予定には触らない)
//   ?now=2026-10-18T11:00:00Z … 日時を差し替えて動きを確かめる(確認用)

import * as webpush from "jsr:@negrel/webpush@0.5.0";

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const DB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NOTIFY_TOKEN = Deno.env.get("NOTIFY_TOKEN") ?? "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:family@example.com";

const DAY = 24 * 60 * 60 * 1000;
const DOWS = ["日", "月", "火", "水", "木", "金", "土"];
// 前日の夜の通知なので、半日届かなければもう意味がない(スマホがオフラインの間は保留される)
const PUSH_TTL_SECONDS = 12 * 60 * 60;

type Sub = { id: string; endpoint: string; p256dh: string; auth: string; user_name: string };
type Ev = Record<string, unknown> & { id: string; date?: string; title?: string; startTime?: string | null };
type Stats = { sent: number; failed: number; removed: number; wouldSend: number };

// ---------- 小道具 ----------

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 日本時間の年月日・曜日。ms は UTC のミリ秒。
function jst(ms: number) {
  const d = new Date(ms + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    ymd: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    dow: d.getUTCDay(), // 0=日曜
    stamp: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
      `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
  };
}

// Supabase のテーブルを読み書きする(server.py の sb_request と同じ役割)
async function db(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { apikey: DB_KEY, "Content-Type": "application/json" };
  // 旧形式の鍵(JWT)は Authorization にも載せる。新形式(sb_secret_...)は apikey だけでよい
  if (DB_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${DB_KEY}`;
  if (method !== "GET") headers.Prefer = "return=minimal";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`データベース ${method} ${path.split("?")[0]} が失敗 (${res.status}): ${await res.text()}`);
  }
  return method === "GET" ? await res.json() : null;
}

// ---------- VAPID 鍵 ----------
// Render で使っていた鍵(base64url)をそのまま使う。鍵を作り直すと
// 家族のスマホの通知登録がすべて無効になるので、形式だけ変換して読み込む。

function privateKeyBytes(raw: string): Uint8Array {
  // PEM(-----BEGIN ...-----)で入っていても読めるようにしておく
  const body = raw.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bytes = b64urlToBytes(body);
  if (bytes.length === 32) return bytes; // ふつうはこれ(web-push 形式)
  // DER(SEC1 / PKCS#8)なら、最初の「長さ32のOCTET STRING」が秘密鍵本体
  for (let i = 0; i + 34 <= bytes.length; i++) {
    if (bytes[i] === 0x04 && bytes[i + 1] === 0x20) return bytes.slice(i + 2, i + 34);
  }
  throw new Error("VAPID_PRIVATE_KEY の形式が読めません(Render の値をそのまま貼れているか確認してください)");
}

async function makeAppServer() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY がシークレットに登録されていません");
  }
  const pub = b64urlToBytes(VAPID_PUBLIC_KEY);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error("VAPID_PUBLIC_KEY の形式が想定外です(87文字前後の英数字のはず)");
  }
  const x = bytesToB64url(pub.slice(1, 33));
  const y = bytesToB64url(pub.slice(33, 65));
  const d = bytesToB64url(privateKeyBytes(VAPID_PRIVATE_KEY));
  const vapidKeys = await webpush.importVapidKeys({
    publicKey: { kty: "EC", crv: "P-256", x, y },
    privateKey: { kty: "EC", crv: "P-256", x, y, d },
  });

  // 公開鍵と秘密鍵が本当にペアかを確かめる(取り違えると通知が全部届かなくなるため)
  const probe = new TextEncoder().encode("vapid-pair-check");
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vapidKeys.privateKey, probe);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, vapidKeys.publicKey, sig, probe);
  if (!ok) throw new Error("VAPID の公開鍵と秘密鍵がペアになっていません(貼り間違いの可能性)");

  return await webpush.ApplicationServer.new({ contactInformation: VAPID_SUBJECT, vapidKeys });
}

// ---------- 送信 ----------

async function pushTo(
  server: webpush.ApplicationServer,
  subs: Sub[],
  title: string,
  body: string,
  stats: Stats,
  gone: Set<string>,
  dry: boolean,
) {
  const targets = subs.filter((s) => !gone.has(s.id));
  if (dry) {
    stats.wouldSend += targets.length;
    return;
  }
  const text = JSON.stringify({ title, body }); // sw.js が title / body を読む
  for (const s of targets) {
    try {
      await server
        .subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(text, { ttl: PUSH_TTL_SECONDS });
      stats.sent++;
    } catch (e) {
      const status = (e as { response?: Response })?.response?.status;
      if (status === 404 || status === 410) {
        // 端末側で通知登録が消えている → 以後送らないよう削除(server.py と同じ後始末)
        gone.add(s.id);
        await db("DELETE", `push_subscriptions?id=eq.${encodeURIComponent(s.id)}`);
        stats.removed++;
      } else {
        // 一時的な失敗は登録を消さない(家族の登録をうっかり失わないため)
        stats.failed++;
        console.error(`push 失敗 (${s.user_name}):`, status ?? e);
      }
    }
  }
}

// ---------- 本体 ----------

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = req.headers.get("x-notify-token") ?? url.searchParams.get("token") ?? "";
  if (!NOTIFY_TOKEN || token !== NOTIFY_TOKEN) return json({ error: "forbidden" }, 403);

  try {
    if (!SUPABASE_URL || !DB_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が取得できません");

    const dry = url.searchParams.get("dry") === "1";
    const testUser = url.searchParams.get("test");
    const nowParam = url.searchParams.get("now");
    const nowMs = nowParam ? Date.parse(nowParam) : Date.now();
    if (Number.isNaN(nowMs)) return json({ error: "now の日時が読めません" }, 400);

    const server = await makeAppServer();
    const subs: Sub[] = await db("GET", "push_subscriptions?select=id,endpoint,p256dh,auth,user_name");
    const gone = new Set<string>();
    const stats: Stats = { sent: 0, failed: 0, removed: 0, wouldSend: 0 };

    // --- テスト通知(その人にだけ1通。予定には触らない) ---
    if (testUser) {
      const mine = subs.filter((s) => s.user_name === testUser);
      await pushTo(server, mine, "🔔 テスト通知", "Supabase から通知が届いています！", stats, gone, dry);
      return json({ ok: true, test: testUser, subscriptions: mine.length, push: stats });
    }

    const today = jst(nowMs);
    const tomorrow = jst(nowMs + DAY).ymd;

    // --- ① 翌日の予定の前日通知 ---
    const pending: Ev[] = await db(
      "GET",
      `events?select=*&notify_enabled=eq.true&date=eq.${tomorrow}`,
    );
    const dayBefore: string[] = [];
    for (const ev of pending) {
      if (ev.date !== tomorrow) continue;
      if (ev.reminded_daybefore) continue; // 二重送信防止
      const eventTitle = (ev.title as string) || "予定";
      const t = ev.startTime;
      const when = t ? `明日 ${t} ` : "明日 ";
      const addedBy = (ev.addedBy as string) || "";
      // 追加した人がいればその人だけ、いなければ全員(server.py の _notify_target と同じ)
      const targets = addedBy ? subs.filter((s) => s.user_name === addedBy) : subs;
      await pushTo(server, targets, `🔔 ${when}${eventTitle}`, `明日「${eventTitle}」の予定があります`, stats, gone, dry);
      if (!dry) await db("PATCH", `events?id=eq.${encodeURIComponent(ev.id)}`, { reminded_daybefore: true });
      dayBefore.push(`${eventTitle} → ${addedBy || "全員"}`);
    }

    // --- ② 日曜なら、明日から7日分のまとめを全員に ---
    let weeklySummarySent = false;
    let weeklyBody: string | null = null;
    if (today.dow === 0) {
      const until = jst(nowMs + 7 * DAY).ymd;
      const evs: Ev[] = await db("GET", `events?select=*&date=gte.${tomorrow}&date=lte.${until}&order=date`);
      const lines: string[] = [];
      for (let i = 1; i <= 7; i++) {
        const d = jst(nowMs + i * DAY);
        const dayEvs = evs
          .filter((e) => e.date === d.ymd)
          .sort((a, b) => ((a.startTime as string) || "99").localeCompare((b.startTime as string) || "99"));
        for (const e of dayEvs) {
          const t = e.startTime;
          lines.push(`${d.month}/${d.day}(${DOWS[d.dow]}) ${t ? t + " " : ""}${(e.title as string) || ""}`);
        }
      }
      weeklyBody = lines.length
        ? lines.slice(0, 12).join("\n") + (lines.length > 12 ? `\nほか${lines.length - 12}件` : "")
        : "今週は登録された予定がありません🍵";
      await pushTo(server, subs, "📋 今週の予定", weeklyBody, stats, gone, dry);
      weeklySummarySent = !dry;
    }

    const result = {
      ok: true,
      dry,
      ranAt: today.stamp,
      tomorrow,
      dayBeforeSent: dayBefore.length,
      dayBefore,
      weeklySummarySent,
      ...(dry && weeklyBody !== null ? { weeklyBody } : {}),
      push: stats,
    };
    console.log("daily-notify:", JSON.stringify(result));
    return json(result);
  } catch (e) {
    console.error("daily-notify error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
