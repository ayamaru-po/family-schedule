#!/usr/bin/env python3
"""
家族スケジュール共有サーバー (Supabase版)
使い方: python3 server.py
"""

import cgi
import json
import os
import uuid
import threading
import urllib.request
import urllib.error
from datetime import datetime
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

PORT = int(os.environ.get('PORT', 3000))
SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY', '')

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
            self.send_response(404)
            self.end_headers()
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

        if path == '/api/events':
            events = load_events()
            self.send_json(events)
        elif path == '/api/members':
            self.send_json(DEFAULT_MEMBERS)
        else:
            self.serve_static(path)

    def handle_upload(self):
        content_type = self.headers.get('Content-Type', '')
        if 'multipart/form-data' not in content_type:
            self.send_json({'error': 'multipart required'}, 400)
            return
        fs = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                'REQUEST_METHOD': 'POST',
                'CONTENT_TYPE': content_type,
                'CONTENT_LENGTH': self.headers.get('Content-Length', '0'),
            }
        )
        file_item = fs.get('file')
        if not file_item or not hasattr(file_item, 'file'):
            self.send_json({'error': 'No file'}, 400)
            return
        ext = 'jpg'
        if file_item.filename and '.' in file_item.filename:
            ext = file_item.filename.rsplit('.', 1)[-1].lower()
        filename = f"{uuid.uuid4().hex}.{ext}"
        file_data = file_item.file.read()
        mime = file_item.type or 'image/jpeg'
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
