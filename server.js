const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { events: [], members: ['パパ', 'ママ', '子供', '家族全員'] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function broadcast(message) {
  const json = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(json);
  });
}

// イベント一覧取得
app.get('/api/events', (req, res) => {
  const data = loadData();
  res.json(data.events);
});

// イベント追加
app.post('/api/events', (req, res) => {
  const data = loadData();
  const event = {
    id: uuidv4(),
    ...req.body,
    createdAt: new Date().toISOString()
  };
  data.events.push(event);
  saveData(data);
  broadcast({ type: 'add', event });
  res.status(201).json(event);
});

// イベント更新
app.put('/api/events/:id', (req, res) => {
  const data = loadData();
  const idx = data.events.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data.events[idx] = { ...data.events[idx], ...req.body };
  saveData(data);
  broadcast({ type: 'update', event: data.events[idx] });
  res.json(data.events[idx]);
});

// イベント削除
app.delete('/api/events/:id', (req, res) => {
  const data = loadData();
  const idx = data.events.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data.events.splice(idx, 1);
  saveData(data);
  broadcast({ type: 'delete', id: req.params.id });
  res.json({ ok: true });
});

// メンバー一覧取得
app.get('/api/members', (req, res) => {
  const data = loadData();
  res.json(data.members);
});

wss.on('connection', (ws) => {
  console.log('クライアント接続');
  ws.on('close', () => console.log('クライアント切断'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n家族スケジュールアプリ起動中`);
  console.log(`ローカル: http://localhost:${PORT}`);
  console.log(`ネットワーク内の他の端末からもアクセス可能です\n`);
});
