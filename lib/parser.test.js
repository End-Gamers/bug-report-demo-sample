/**
 * 실행: node lib/parser.test.js  (Node 18+ 필요, package.json에 "type":"module" 추가)
 */
import { test } from 'node:test';
import assert   from 'node:assert/strict';
import { parseJenniferLog } from './parser.js';

// ── 픽스처 ────────────────────────────────────────────────────────────────────

const ERROR_WITH_STACK = `\
2024-03-15 09:32:11.847 [ERROR] com.example.service.OrderService - Failed to process order: Connection timeout
\tat com.example.repository.OrderRepository.save(OrderRepository.java:142)
\tat com.example.service.OrderService.processOrder(OrderService.java:87)
Caused by: java.net.SocketTimeoutException: Connection timed out
\tat java.net.Socket.connect(Socket.java:611)`;

const WARN_LINE =
  '2024-03-15 09:33:00.001 [WARN] com.example.config.DataSourceConfig - Connection pool running low: 2/20';

const INFO_LINE =
  '2024-03-15 09:32:12.015 [INFO] com.example.service.CacheService - Cache hit ratio: 0.87';

const NO_MILLIS =
  '2024-03-15 09:00:00 [ERROR] com.example.A - short timestamp';

const NO_CLASS =
  '2024-03-15 09:00:00.000 [ERROR] NullPointerException: index out of bounds';

// ── 테스트 케이스 ─────────────────────────────────────────────────────────────

test('빈 문자열 — 모두 빈 배열 반환', () => {
  const r = parseJenniferLog('');
  assert.equal(r.errors.length,          0);
  assert.equal(r.warnings.length,        0);
  assert.equal(r.summary.errorCount,     0);
  assert.equal(r.summary.warnCount,      0);
});

test('공백·빈 줄만 있을 때 — 빈 결과', () => {
  const r = parseJenniferLog('\n\n   \n\t\n');
  assert.equal(r.errors.length,  0);
  assert.equal(r.warnings.length, 0);
});

test('INFO 줄만 있으면 errors/warnings 모두 비어있음', () => {
  const r = parseJenniferLog(INFO_LINE);
  assert.equal(r.errors.length,  0);
  assert.equal(r.warnings.length, 0);
});

test('단일 ERROR 줄 — 필드 파싱 검증', () => {
  const line = '2024-03-15 09:32:11.847 [ERROR] com.example.service.OrderService - Failed to process order';
  const r    = parseJenniferLog(line);

  assert.equal(r.errors.length,              1);
  assert.equal(r.errors[0].level,            'ERROR');
  assert.equal(r.errors[0].timestamp,        '2024-03-15 09:32:11.847');
  assert.equal(r.errors[0].class,            'com.example.service.OrderService');
  assert.equal(r.errors[0].message,          'Failed to process order');
  assert.equal(r.errors[0].stacktrace,       null);
});

test('ERROR + 스택 트레이스 — 스택 수집 및 내용 검증', () => {
  const r = parseJenniferLog(ERROR_WITH_STACK);

  assert.equal(r.errors.length, 1);
  const st = r.errors[0].stacktrace;
  assert.notEqual(st,  null);
  assert.ok(st.includes('OrderRepository'));
  assert.ok(st.includes('Caused by'));
  assert.ok(st.includes('Socket.connect'));
});

test('단일 WARN 줄 — 필드 파싱 검증', () => {
  const r = parseJenniferLog(WARN_LINE);

  assert.equal(r.warnings.length,       1);
  assert.equal(r.warnings[0].level,     'WARN');
  assert.equal(r.warnings[0].class,     'com.example.config.DataSourceConfig');
  assert.ok(r.warnings[0].message.includes('Connection pool'));
});

test('ERROR + WARN + INFO 혼합 — 각 카운트 정확', () => {
  const log = [ERROR_WITH_STACK, WARN_LINE, INFO_LINE].join('\n');
  const r   = parseJenniferLog(log);

  assert.equal(r.errors.length,       1);
  assert.equal(r.warnings.length,     1);
  assert.equal(r.summary.errorCount,  1);
  assert.equal(r.summary.warnCount,   1);
});

test('여러 ERROR 항목 — 순서 보존', () => {
  const log = [
    '2024-03-15 09:00:00.000 [ERROR] com.example.A - Error A',
    '2024-03-15 09:00:01.000 [ERROR] com.example.B - Error B',
    '2024-03-15 09:00:02.000 [ERROR] com.example.C - Error C',
  ].join('\n');
  const r = parseJenniferLog(log);

  assert.equal(r.errors.length,       3);
  assert.equal(r.errors[0].class,     'com.example.A');
  assert.equal(r.errors[1].class,     'com.example.B');
  assert.equal(r.errors[2].class,     'com.example.C');
});

test('스택 트레이스가 다음 ERROR 시작 전까지만 수집됨', () => {
  const log = `\
2024-03-15 09:00:00.000 [ERROR] com.A - Error A
\tat stack.One(One.java:1)
2024-03-15 09:00:01.000 [ERROR] com.B - Error B
\tat stack.Two(Two.java:2)`;
  const r = parseJenniferLog(log);

  assert.equal(r.errors.length, 2);
  assert.ok( r.errors[0].stacktrace.includes('One'));
  assert.ok(!r.errors[0].stacktrace.includes('Two'));
  assert.ok( r.errors[1].stacktrace.includes('Two'));
  assert.ok(!r.errors[1].stacktrace.includes('One'));
});

test('밀리초 없는 타임스탬프 파싱', () => {
  const r = parseJenniferLog(NO_MILLIS);

  assert.equal(r.errors.length,         1);
  assert.equal(r.errors[0].timestamp,   '2024-03-15 09:00:00');
});

test('" - " 없는 줄 — class 빈 문자열, message에 전체 내용', () => {
  const r = parseJenniferLog(NO_CLASS);

  assert.equal(r.errors.length,    1);
  assert.equal(r.errors[0].class,  '');
  assert.ok(r.errors[0].message.includes('NullPointerException'));
});

// ── Format B: Node.js / code-server [HH:MM:SS] ───────────────────────────────

test('[HH:MM:SS] 포맷 — 에러 키워드 있으면 ERROR', () => {
  const line = "[05:45:24] [File Watcher (node.js)] Failed to watch /system/bin for changes using fs.watch() (Error: EACCES: permission denied, watch '/system/bin')";
  const r = parseJenniferLog(line);

  assert.equal(r.errors.length,  1);
  assert.equal(r.errors[0].level, 'ERROR');
  assert.equal(r.errors[0].timestamp, '05:45:24');
  assert.equal(r.errors[0].class, 'File Watcher (node.js)');
  assert.ok(r.errors[0].message.includes('Failed to watch'));
});

test('[HH:MM:SS] 포맷 — 에러 키워드 없으면 무시', () => {
  const line = '[05:44:04] Extension host agent started.';
  const r = parseJenniferLog(line);

  assert.equal(r.errors.length,   0);
  assert.equal(r.warnings.length, 0);
});

test('[HH:MM:SS] 포맷 — 여러 컴포넌트 브래킷을 › 로 연결', () => {
  const line = '[05:44:04] [127.0.0.1][abc123][ManagementConnection] Unknown reconnection token.';
  const r = parseJenniferLog(line);
  // "Unknown"은 키워드 없음 → 무시
  assert.equal(r.errors.length,   0);
  assert.equal(r.warnings.length, 0);
});

// ── Format C: Node.js process warning (node:PID) ─────────────────────────────

test('(node:PID) 포맷 — DeprecationWarning → WARN', () => {
  const line = "(node:13738) [DEP0060] DeprecationWarning: The `util._extend` API is deprecated. Please use Object.assign() instead.";
  const r = parseJenniferLog(line);

  assert.equal(r.warnings.length,      1);
  assert.equal(r.warnings[0].level,    'WARN');
  assert.equal(r.warnings[0].class,    'DEP0060');
  assert.ok(r.warnings[0].message.includes('util._extend'));
});

test('(node:PID) 포맷 — 레벨 키워드 없으면 무시', () => {
  const line = '(node:9999) Some informational message.';
  const r = parseJenniferLog(line);

  assert.equal(r.errors.length,   0);
  assert.equal(r.warnings.length, 0);
});

// ── 혼합 포맷 ─────────────────────────────────────────────────────────────────

test('Jennifer APM + Node.js 포맷 혼합 파싱', () => {
  const log = [
    '2024-03-15 09:32:11.847 [ERROR] com.example.Service - DB connection failed',
    "[05:45:24] [File Watcher] Failed to watch /tmp (Error: EACCES: permission denied)",
    "(node:1234) [DEP0001] DeprecationWarning: something deprecated",
    '[05:44:04] Extension host agent started.',  // 키워드 없음 → 무시
  ].join('\n');

  const r = parseJenniferLog(log);
  assert.equal(r.errors.length,   2);
  assert.equal(r.warnings.length, 1);
});

test('summary 카운트가 배열 길이와 일치', () => {
  const log = [
    '2024-03-15 09:00:00.000 [ERROR] com.A - E1',
    '2024-03-15 09:00:01.000 [ERROR] com.B - E2',
    '2024-03-15 09:00:02.000 [WARN]  com.C - W1',
  ].join('\n');
  const r = parseJenniferLog(log);

  assert.equal(r.summary.errorCount, r.errors.length);
  assert.equal(r.summary.warnCount,  r.warnings.length);
});
