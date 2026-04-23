/**
 * @typedef {Object} LogEntry
 * @property {string}         timestamp
 * @property {'ERROR'|'WARN'} level
 * @property {string}         class      - 로거 클래스 또는 컴포넌트명
 * @property {string}         message
 * @property {string|null}    stacktrace
 */

/**
 * @typedef {Object} ParsedLog
 * @property {LogEntry[]} errors
 * @property {LogEntry[]} warnings
 * @property {{errorCount: number, warnCount: number}} summary
 */

/**
 * 지원 포맷:
 *   A) Jennifer APM / Log4j
 *      2024-03-15 09:32:11.847 [ERROR] com.example.Service - message
 *
 *   B) Node.js / code-server 타임스탬프
 *      [HH:MM:SS] [component] message
 *
 *   C) Node.js 프로세스 경고
 *      (node:PID) [CODE] DeprecationWarning: message
 *
 * @param {string} text
 * @returns {ParsedLog}
 */
export function parseJenniferLog(text) {
  const errors   = [];
  const warnings = [];
  let current    = null;

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    const entry = tryParseEntry(line);
    if (entry) {
      if (current) flush(current, errors, warnings);
      current = entry;
    } else if (current && isStackLine(line)) {
      current.stacktrace = current.stacktrace
        ? current.stacktrace + '\n' + line
        : line;
    }
  }

  if (current) flush(current, errors, warnings);

  return {
    errors,
    warnings,
    summary: { errorCount: errors.length, warnCount: warnings.length },
  };
}

// ── 포맷 감지 진입점 ──────────────────────────────────────────────────────────

function tryParseEntry(line) {
  // Format A: "YYYY-MM-DD ..." 시작
  if (hasDatePrefix(line))    return tryParseJenniferFormat(line);

  // Format B: "[HH:MM:SS]..." 시작
  if (hasTimePrefix(line))    return tryParseNodeBracketFormat(line);

  // Format C: "(node:PID) ..." 시작
  if (line.startsWith('(node:')) return tryParseNodeProcessWarning(line);

  return null;
}

// ── Format A: Jennifer APM / Log4j ───────────────────────────────────────────

function tryParseJenniferFormat(line) {
  const bOpen = line.indexOf('[');
  if (bOpen === -1 || bOpen > 30) return null;
  const bClose = line.indexOf(']', bOpen);
  if (bClose === -1) return null;

  const level = line.slice(bOpen + 1, bClose);
  if (level !== 'ERROR' && level !== 'WARN') return null;

  const timestamp = line.slice(0, bOpen).trim();
  const rest      = line.slice(bClose + 1).trim();
  const dashIdx   = rest.indexOf(' - ');

  let logClass, message;
  if (dashIdx !== -1) {
    logClass = rest.slice(0, dashIdx).trim();
    message  = rest.slice(dashIdx + 3).trim();
  } else {
    logClass = '';
    message  = rest;
  }

  return { timestamp, level, class: logClass, message, stacktrace: null };
}

// ── Format B: Node.js / code-server [HH:MM:SS] ───────────────────────────────

function tryParseNodeBracketFormat(line) {
  // "[HH:MM:SS] [comp1][comp2] message" 형태
  const timestamp = line.slice(1, 9); // "HH:MM:SS"
  let rest        = line.slice(10).trim(); // ']' 이후

  // 연속된 "[...]" 그룹을 컴포넌트로 수집
  const components = [];
  while (rest.startsWith('[')) {
    const end = rest.indexOf(']');
    if (end === -1) break;
    components.push(rest.slice(1, end));
    rest = rest.slice(end + 1).trim();
  }

  const message = rest;
  const level   = detectLevel(message);
  if (!level) return null;

  return {
    timestamp,
    level,
    class:      components.join(' › '),
    message,
    stacktrace: null,
  };
}

// ── Format C: Node.js process warning ────────────────────────────────────────

function tryParseNodeProcessWarning(line) {
  // "(node:13738) [DEP0060] DeprecationWarning: ..."
  const parenClose = line.indexOf(')');
  if (parenClose === -1) return null;

  let rest = line.slice(parenClose + 1).trim();

  // 코드 "[DEP0060]" 추출
  let code = '';
  if (rest.startsWith('[')) {
    const end = rest.indexOf(']');
    if (end !== -1) {
      code = rest.slice(1, end);
      rest = rest.slice(end + 1).trim();
    }
  }

  const level = detectLevel(rest) ?? detectLevel(line);
  if (!level) return null;

  return {
    timestamp:  '',
    level,
    class:      code,
    message:    rest,
    stacktrace: null,
  };
}

// ── 레벨 키워드 감지 (Format B·C 전용) ───────────────────────────────────────

const ERROR_KEYWORDS = [
  'Failed', 'Error:', 'ERR_', 'EACCES', 'ENOENT', 'EPERM',
  'ECONNREFUSED', 'ETIMEDOUT', 'Fatal', 'FATAL', 'fatal',
  'permission denied', 'not found', 'Cannot find',
];

const WARN_KEYWORDS = [
  'Warning', 'DeprecationWarning', 'deprecated', 'Deprecated', 'WARN',
];

function detectLevel(text) {
  for (const kw of ERROR_KEYWORDS) { if (text.includes(kw)) return 'ERROR'; }
  for (const kw of WARN_KEYWORDS)  { if (text.includes(kw)) return 'WARN'; }
  return null;
}

// ── 공통 헬퍼 ─────────────────────────────────────────────────────────────────

/** "YYYY-MM-DD " 시작 여부 — 문자 코드로 판별 */
function hasDatePrefix(line) {
  if (line.length < 11) return false;
  if (line[4] !== '-' || line[7] !== '-' || line[10] !== ' ') return false;
  for (const i of [0, 1, 2, 3, 5, 6, 8, 9]) {
    const c = line.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

/** "[HH:MM:SS]" 시작 여부 */
function hasTimePrefix(line) {
  if (line.length < 10) return false;
  if (line[0] !== '[' || line[9] !== ']') return false;
  if (line[3] !== ':' || line[6] !== ':') return false;
  for (const i of [1, 2, 4, 5, 7, 8]) {
    const c = line.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

/** 스택 트레이스 줄 여부 */
function isStackLine(line) {
  if (line[0] === '\t') return true;
  const t = line.trimStart();
  return t.startsWith('at ') || t.startsWith('Caused by:') || t.startsWith('...');
}

function flush(entry, errors, warnings) {
  if (entry.level === 'ERROR')      errors.push(entry);
  else if (entry.level === 'WARN') warnings.push(entry);
}
