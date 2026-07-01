#!/usr/bin/env python3
"""
家族スケジュール共有サーバー (Supabase版)
使い方: python3 server.py
"""

import json
import os
import uuid
import threading
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, quote as urlquote
import urllib.parse

PORT = int(os.environ.get('PORT', 3000))
SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY', '')
VAPID_PUBLIC_KEY  = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')
VAPID_SUBJECT     = os.environ.get('VAPID_SUBJECT', 'mailto:family@example.com')

DEFAULT_MEMBERS = ["貴之", "亜耶", "凌", "慶", "家族全員"]

lock = threading.Lock()
sse_clients = []


def sb_request(method, path, data=None, params=''):
    """Supabase REST APIへのリクエスト"""
    url = f"{SUPABASE_URL}/rest/v1/{path}{params}"
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }
    body = json.dumps(data, ensure_ascii=False).encode('utf-8') if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            text = resp.read().decode('utf-8')
            return json.loads(text) if text.strip() else []
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        print(f"Supabase error {e.code}: {error_body}")
        return []


def load_events():
    return sb_request('GET', 'events', params='?order=date')


def send_push_to_user(user_name, title, body):
    """特定ユーザーにプッシュ通知を送信"""
    if not VAPID_PRIVATE_KEY:
        return
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        return
    subs = sb_request('GET', 'push_subscriptions',
                      params=f'?user_name=eq.{urllib.parse.quote(user_name, safe="")}')
    if not subs:
        return
    payload = json.dumps({'title': title, 'body': body}, ensure_ascii=False)
    dead = []
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    'endpoint': sub['endpoint'],
                    'keys': {'p256dh': sub['p256dh'], 'auth': sub['auth']}
                },
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={'sub': VAPID_SUBJECT}
            )
        except Exception as e:
            print(f"Push error: {e}")
            dead.append(sub['id'])
    for sid in dead:
        sb_request('DELETE', 'push_subscriptions', params=f'?id=eq.{sid}')


def _notify_target(added_by, title, body):
    """addedByがいればその人だけ、いなければ全員に通知"""
    if added_by:
        threading.Thread(target=send_push_to_user,
                         args=(added_by, title, body), daemon=True).start()
    else:
        threading.Thread(target=send_push_all,
                         args=(title, body), daemon=True).start()


def check_and_send_notifications():
    """通知が必要なイベントをチェックして送信（日本時間基準）"""
    # Renderのサーバー時刻はUTCなので+9時間して日本時間にする
    now = datetime.utcnow() + timedelta(hours=9)
    try:
        pending = sb_request('GET', 'events',
                             params='?notify_enabled=eq.true')
    except Exception as e:
        print(f"Notification check error: {e}")
        return
    for event in pending:
        date_str = event.get('date', '')
        if not date_str:
            continue
        time_str = event.get('startTime') or '08:00'
        try:
            event_dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
        except Exception:
            continue
        added_by = event.get('addedBy', '')
        event_title = event.get('title', '予定')

        # ① 前日の夜20時にリマインド
        if not event.get('reminded_daybefore'):
            remind_dt = datetime.strptime(date_str, "%Y-%m-%d") - timedelta(days=1)
            remind_dt = remind_dt.replace(hour=20, minute=0)
            if -60 <= (remind_dt - now).total_seconds() <= 60:
                t = event.get('startTime')
                when = f'明日 {t} ' if t else '明日 '
                _notify_target(added_by, f'🔔 {when}{event_title}',
                               f'明日「{event_title}」の予定があります')
                sb_request('PATCH', 'events', {'reminded_daybefore': True},
                           params=f'?id=eq.{event["id"]}')

        # ② 当日の予定時間に通知
        if not event.get('notified'):
            if -60 <= (event_dt - now).total_seconds() <= 60:
                _notify_target(added_by, f'⏰ {event_title}',
                               f'{time_str} の予定の時間です')
                sb_request('PATCH', 'events', {'notified': True},
                           params=f'?id=eq.{event["id"]}')


def notification_scheduler():
    """バックグラウンドで1分ごとに通知チェック"""
    import time as time_module
    while True:
        try:
            check_and_send_notifications()
        except Exception as e:
            print(f"Scheduler error: {e}")
        time_module.sleep(60)


def send_push_except(exclude_user, title, body):
    """指定ユーザー以外の全購読者にプッシュ通知を送信"""
    if not VAPID_PRIVATE_KEY:
        return
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        return
    all_subs = sb_request('GET', 'push_subscriptions')
    if not all_subs:
        return
    subs = [s for s in all_subs if s.get('user_name') != exclude_user]
    if not subs:
        return
    payload = json.dumps({'title': title, 'body': body}, ensure_ascii=False)
    dead = []
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    'endpoint': sub['endpoint'],
                    'keys': {'p256dh': sub['p256dh'], 'auth': sub['auth']}
                },
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={'sub': VAPID_SUBJECT}
            )
        except Exception as e:
            print(f"Push error: {e}")
            dead.append(sub['id'])
    for sid in dead:
        sb_request('DELETE', 'push_subscriptions', params=f'?id=eq.{sid}')


def send_push_all(title, body):
    """全購読者にプッシュ通知を送信"""
    if not VAPID_PRIVATE_KEY:
        return
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        return
    subs = sb_request('GET', 'push_subscriptions')
    if not subs:
        return
    payload = json.dumps({'title': title, 'body': body}, ensure_ascii=False)
    dead = []
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    'endpoint': sub['endpoint'],
                    'keys': {'p256dh': sub['p256dh'], 'auth': sub['auth']}
                },
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={'sub': VAPID_SUBJECT}
            )
        except Exception as e:
            print(f"Push error: {e}")
            dead.append(sub['id'])
    for sid in dead:
        sb_request('DELETE', 'push_subscriptions', params=f'?id=eq.{sid}')


def broadcast(message):
    """SSEで全クライアントに変更を通知"""
    dead = []
    payload = f"data: {json.dumps(message, ensure_ascii=False)}\n\n"
    for client in sse_clients:
        try:
            client.wfile.write(payload.encode('utf-8'))
            client.wfile.flush()
        except Exception:
            dead.append(client)
    for d in dead:
        if d in sse_clients:
            sse_clients.remove(d)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def send_cors(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(length).decode('utf-8')) if length else {}

    def serve_static(self, path):
        public_dir = os.path.join(os.path.dirname(__file__), 'public')
        if path == '/':
            path = '/index.html'
        file_path = os.path.join(public_dir, path.lstrip('/'))
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            msg = b'Not Found'
            self.send_response(404)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Content-Length', str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
            return
        ext = os.path.splitext(file_path)[1]
        types = {'.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript'}
        with open(file_path, 'rb') as f:
            body = f.read()
        self.send_response(200)
        self.send_header('Content-Type', types.get(ext, 'application/octet-stream') + '; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        # HTML は常に最新を取得、CSS/JS は1時間キャッシュ
        if ext == '.html':
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        else:
            self.send_header('Cache-Control', 'public, max-age=3600')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_cors()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # SSE エンドポイント（リアルタイム更新）
        if path == '/api/events/stream':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            sse_clients.append(self)
            try:
                while True:
                    self.connection.recv(1)
            except Exception:
                pass
            finally:
                if self in sse_clients:
                    sse_clients.remove(self)
            return

        if path == '/api/push/test':
            threading.Thread(target=send_push_all,
                args=('🔔 テスト通知', '通知の設定がうまくいっています！'), daemon=True).start()
            self.send_json({'ok': True})
        elif path == '/api/config':
            self.send_json({'vapidPublicKey': VAPID_PUBLIC_KEY})
        elif path == '/api/events':
            events = load_events()
            self.send_json(events)
        elif path == '/api/members':
            self.send_json(DEFAULT_MEMBERS)
        else:
            self.serve_static(path)

    def parse_multipart_file(self):
        """cgiモジュールを使わずにmultipartを解析"""
        content_type = self.headers.get('Content-Type', '')
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        # boundaryを取得
        boundary = None
        for part in content_type.split(';'):
            part = part.strip()
            if part.startswith('boundary='):
                boundary = part[9:].strip('"')
                break
        if not boundary:
            return None, None, None
        sep = ('--' + boundary).encode()
        parts = body.split(sep)
        for part in parts[1:]:
            if part.startswith(b'--'):
                continue
            if b'\r\n\r\n' not in part:
                continue
            headers_raw, file_data = part.split(b'\r\n\r\n', 1)
            if file_data.endswith(b'\r\n'):
                file_data = file_data[:-2]
            headers_str = headers_raw.decode('utf-8', errors='replace')
            filename = None
            mime = 'image/jpeg'
            for line in headers_str.split('\r\n'):
                if 'Content-Disposition' in line and 'filename' in line:
                    for item in line.split(';'):
                        item = item.strip()
                        if item.startswith('filename='):
                            filename = item[9:].strip('"')
                elif 'Content-Type' in line and ':' in line:
                    mime = line.split(':', 1)[1].strip()
            if filename is not None:
                return filename, mime, file_data
        return None, None, None

    def handle_upload(self):
        content_type = self.headers.get('Content-Type', '')
        if 'multipart/form-data' not in content_type:
            self.send_json({'error': 'multipart required'}, 400)
            return
        filename, mime, file_data = self.parse_multipart_file()
        if file_data is None:
            self.send_json({'error': 'No file'}, 400)
            return
        ext = 'jpg'
        if filename and '.' in filename:
            ext = filename.rsplit('.', 1)[-1].lower()
        filename = f"{uuid.uuid4().hex}.{ext}"
        # Supabase Storageにアップロード
        storage_url = f"{SUPABASE_URL}/storage/v1/object/event-images/{filename}"
        headers = {
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Content-Type': mime,
            'Cache-Control': '3600',
            'x-upsert': 'false',
        }
        req = urllib.request.Request(storage_url, data=file_data, headers=headers, method='POST')
        try:
            with urllib.request.urlopen(req) as resp:
                resp.read()
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8')
            print(f"Storage error {e.code}: {body}")
            self.send_json({'error': f'Upload failed: {body}'}, 500)
            return
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/event-images/{filename}"
        self.send_json({'url': public_url})

    def do_POST(self):
        if self.path == '/api/upload':
            self.handle_upload()
            return
        if self.path == '/api/push/subscribe':
            body = self.read_body()
            sub = {
                'id': str(uuid.uuid4()),
                'endpoint': body.get('endpoint', ''),
                'p256dh':   body.get('p256dh', ''),
                'auth':     body.get('auth', ''),
                'user_name': body.get('userName', ''),
                'createdAt': datetime.now().isoformat()
            }
            # 同じendpointが既にあれば更新
            existing = sb_request('GET', 'push_subscriptions',
                                  params=f'?endpoint=eq.{urllib.parse.quote(sub["endpoint"], safe="")}')
            if existing:
                sb_request('PATCH', 'push_subscriptions', sub,
                           params=f'?id=eq.{existing[0]["id"]}')
            else:
                sb_request('POST', 'push_subscriptions', sub)
            self.send_json({'ok': True})
            return
        if self.path != '/api/events':
            self.send_json({'error': 'Not found'}, 404)
            return
        body = self.read_body()
        event = {
            'id': str(uuid.uuid4()),
            **body,
            'createdAt': datetime.now().isoformat()
        }
        result = sb_request('POST', 'events', event)
        saved = result[0] if isinstance(result, list) and result else event
        self.send_json(saved, 201)
        broadcast({'type': 'add', 'event': saved})
        # Push通知（追加した本人以外に送る）
        added_by = saved.get('addedBy', '')
        title = saved.get('title', '新しい予定')
        # 通知本文に「何日の予定か」を入れる（例: 6/21(土) 9:30 タイトル）
        date_str = saved.get('date', '')
        when = ''
        if date_str:
            try:
                dt = datetime.strptime(date_str, "%Y-%m-%d")
                dow = ['月', '火', '水', '木', '金', '土', '日'][dt.weekday()]
                when = f'{dt.month}/{dt.day}({dow})'
                end_str = saved.get('endDate')
                if end_str and end_str != date_str:
                    try:
                        ed = datetime.strptime(end_str, "%Y-%m-%d")
                        edow = ['月', '火', '水', '木', '金', '土', '日'][ed.weekday()]
                        when += f'〜{ed.month}/{ed.day}({edow})'
                    except Exception:
                        pass
                st = saved.get('startTime')
                if st:
                    when += f' {st}'
            except Exception:
                pass
        notif_body = f'{when} {title}'.strip() if when else title
        threading.Thread(target=send_push_except,
            args=(added_by, f'📅 {added_by}が予定を追加', notif_body), daemon=True).start()

    def do_PUT(self):
        parts = self.path.split('/')
        if len(parts) < 4 or parts[2] != 'events':
            self.send_json({'error': 'Not found'}, 404)
            return
        event_id = parts[3]
        body = self.read_body()
        result = sb_request('PATCH', 'events', body, params=f'?id=eq.{event_id}')
        if not result:
            self.send_json({'error': 'Not found'}, 404)
            return
        event = result[0] if isinstance(result, list) else result
        self.send_json(event)
        broadcast({'type': 'update', 'event': event})

    def do_DELETE(self):
        parts = self.path.split('/')
        if len(parts) < 4 or parts[2] != 'events':
            self.send_json({'error': 'Not found'}, 404)
            return
        event_id = parts[3]
        sb_request('DELETE', 'events', params=f'?id=eq.{event_id}')
        self.send_json({'ok': True})
        broadcast({'type': 'delete', 'id': event_id})


if __name__ == '__main__':
    # 通知スケジューラーをバックグラウンドで起動
    threading.Thread(target=notification_scheduler, daemon=True).start()
    server = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    import socket
    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except Exception:
        local_ip = '??'
    print(f"\n🏠 家族スケジュールアプリ 起動中")
    print(f"  ローカル      : http://localhost:{PORT}")
    print(f"  同じWifi内から: http://{local_ip}:{PORT}")
    print(f"\nCtrl+C で終了\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nサーバーを終了しました")
