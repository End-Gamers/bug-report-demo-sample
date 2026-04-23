#!/usr/bin/env node
// 정적 파일 서빙 + /log 엔드포인트 (브라우저 에러 수집)
import http from 'node:http';
import fs   from 'node:fs';
import path from 'node:path';

const PORT    = 5059;
const ROOT    = import.meta.dirname;
const LOGFILE = '/tmp/browser-errors.log';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.log':  'text/plain',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  // ── POST /log : 브라우저 에러 수신 ──────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/log') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const line = `[${new Date().toISOString()}] ${body}\n`;
      fs.appendFileSync(LOGFILE, line);
      process.stdout.write(line);
      res.writeHead(204);
      res.end();
    });
    return;
  }

  // ── OPTIONS preflight ────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.writeHead(204);
    res.end();
    return;
  }

  // ── 정적 파일 서빙 ───────────────────────────────────────────────────────────
  let urlPath = req.url.split('?')[0]; // 쿼리스트링 제거
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);
  const ext      = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(data);
    console.log(`${req.method} ${req.url}`);
  });
});

server.listen(PORT, () => {
  console.log(`서버 시작: http://localhost:${PORT}`);
  console.log(`에러 로그: ${LOGFILE}`);
});
