import { parseJenniferLog } from './lib/parser.js?v=6';
import { analyzeLog }       from './lib/api.js?v=6';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const apikeyForm   = document.getElementById('apikey-form');
const apikeyInput  = document.getElementById('apikey-input');
const apikeyStatus = document.getElementById('apikey-status');

const logForm      = document.getElementById('log-form');
const logInput     = document.getElementById('log-input');
const logMeta      = document.getElementById('log-meta');

const resultLoading = document.getElementById('result-loading');
const resultError   = document.getElementById('result-error');
const resultCard    = document.getElementById('result-card');
const exportMdBtn   = document.getElementById('export-md-btn');

const STORAGE_KEY = 'jennifer_apikey';

// 현재 렌더링된 리포트 (Markdown 내보내기용)
let activeReport    = null;
let activeParsedLog = null;

// ── 초기화 ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem(STORAGE_KEY)) {
    apikeyStatus.textContent = 'API 키가 저장되어 있습니다.';
  }
  setupDragAndDrop();
});

// ── API 키 저장 ───────────────────────────────────────────────────────────────

apikeyForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const key = apikeyInput.value.trim();
  if (!key) return;

  sessionStorage.setItem(STORAGE_KEY, key);
  apikeyInput.value    = '';
  apikeyStatus.textContent = 'API 키가 저장되었습니다.';
});

// ── 로그 메타 표시 ────────────────────────────────────────────────────────────

logInput.addEventListener('input', updateLogMeta);

function updateLogMeta() {
  const text = logInput.value;
  if (!text) { logMeta.textContent = ''; return; }
  const lines  = text.split('\n').length;
  const tokens = Math.round(text.length / 4);
  logMeta.textContent = `${lines.toLocaleString()}줄 · 약 ${tokens.toLocaleString()} 토큰`;
}

// ── 분석 실행 ─────────────────────────────────────────────────────────────────

logForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const apiKey = sessionStorage.getItem(STORAGE_KEY);
  if (!apiKey) {
    showError('API 키를 먼저 저장해 주세요.');
    return;
  }

  const text = logInput.value.trim();
  if (!text) return;

  setUiState('loading');

  // 파싱
  const parsedLog = parseJenniferLog(text);
  if (parsedLog.summary.errorCount === 0 && parsedLog.summary.warnCount === 0) {
    showError('ERROR 또는 WARN 항목을 찾지 못했습니다. 로그 형식을 확인해 주세요.');
    return;
  }

  // Claude 호출
  const result = await analyzeLog(parsedLog, apiKey);

  if (result.status === 'error') {
    showError(friendlyError(result));
    return;
  }

  activeParsedLog = parsedLog;
  renderReport(result.data, parsedLog);
  setUiState('result');
});

// ── 결과 렌더링 ───────────────────────────────────────────────────────────────

function renderReport(report, parsedLog) {
  activeReport = report;

  // 심각도 배지
  const sevEl        = document.getElementById('result-severity');
  const normalized   = normalizeSeverity(report.severity);
  sevEl.textContent  = report.severity ?? '-';
  sevEl.dataset.level = normalized;

  // 발생 시각
  const firstEntry   = parsedLog.errors[0] ?? parsedLog.warnings[0];
  document.getElementById('result-timestamp').textContent = firstEntry?.timestamp ?? '-';

  // 텍스트 필드
  document.getElementById('result-summary').textContent   = report.summary    ?? '';
  document.getElementById('result-root-cause').textContent = report.rootCause  ?? '';
  document.getElementById('result-impact').textContent    = report.impact      ?? '';
  document.getElementById('result-fix-time').textContent  = report.estimatedFixTime ?? '-';

  // 해결책 목록
  const list = document.getElementById('result-solution-list');
  list.innerHTML = '';
  for (const step of (report.solutions ?? [])) {
    const li = document.createElement('li');
    li.textContent = step;
    list.appendChild(li);
  }

  // 스택 트레이스
  const codeEl = document.querySelector('#result-stacktrace code');
  codeEl.textContent = firstEntry?.stacktrace ?? '스택 트레이스 없음';
}

// ── UI 상태 전환 ──────────────────────────────────────────────────────────────

function setUiState(state) {
  resultLoading.hidden = state !== 'loading';
  resultError.hidden   = state !== 'error';
  resultCard.hidden    = state !== 'result';
}

function showError(message) {
  resultError.textContent = message;
  setUiState('error');
}

// ── 에러 메시지 친화화 ────────────────────────────────────────────────────────

function friendlyError(result) {
  switch (result.code) {
    case 'api_key_invalid': return '🔑 API 키가 유효하지 않습니다. 다시 입력해 주세요.';
    case 'network_error':   return '🌐 네트워크에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.';
    case 'token_limit':     return '📄 로그가 너무 깁니다. ERROR 구간만 잘라서 붙여넣어 보세요.';
    case 'parse_error':     return '⚠️ 응답을 파싱하지 못했습니다. 다시 시도해 주세요.';
    default:                return result.message ?? '알 수 없는 오류가 발생했습니다.';
  }
}

// ── 심각도 정규화 ─────────────────────────────────────────────────────────────

function normalizeSeverity(raw) {
  const map = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
  return map[(raw ?? '').toLowerCase()] ?? 'LOW';
}

// ── Markdown 내보내기 ─────────────────────────────────────────────────────────

exportMdBtn.addEventListener('click', () => {
  if (!activeReport) return;

  const r          = activeReport;
  const firstEntry = activeParsedLog?.errors[0] ?? activeParsedLog?.warnings[0];
  const timestamp  = firstEntry?.timestamp ?? '-';
  const solutions  = (r.solutions ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n');
  const stack      = firstEntry?.stacktrace
    ? `\n## 스택 트레이스\n\`\`\`\n${firstEntry.stacktrace}\n\`\`\``
    : '';

  const md = `# 버그 리포트

| 항목 | 내용 |
|---|---|
| 심각도 | ${r.severity ?? '-'} |
| 발생 시각 | ${timestamp} |
| 예상 수정 시간 | ${r.estimatedFixTime ?? '-'} |

## 요약
${r.summary ?? ''}

## 근본 원인
${r.rootCause ?? ''}

## 영향 범위
${r.impact ?? ''}

## 해결책
${solutions}
${stack}
---
*Jennifer APM 버그 리포트 생성기*
`;

  const blob = new Blob([md], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `bug-report-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
});

// ── 드래그 앤 드롭 ────────────────────────────────────────────────────────────

function setupDragAndDrop() {
  logInput.addEventListener('dragover', (e) => {
    e.preventDefault();
    logInput.classList.add('drag-over');
  });

  logInput.addEventListener('dragleave', () => {
    logInput.classList.remove('drag-over');
  });

  logInput.addEventListener('drop', (e) => {
    e.preventDefault();
    logInput.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (ext !== '.log' && ext !== '.txt') {
      showError(`.log 또는 .txt 파일만 지원합니다. (받은 파일: ${file.name})`);
      return;
    }

    const reader = new FileReader();
    reader.onload  = (ev) => { logInput.value = ev.target.result; updateLogMeta(); };
    reader.onerror = ()   => showError('파일을 읽는 중 오류가 발생했습니다.');
    reader.readAsText(file, 'UTF-8');
  });
}
