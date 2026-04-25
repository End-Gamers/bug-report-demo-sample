import { parseJenniferLog } from './parser.js?v=6';
import { analyzeLog }       from './api.js?v=7';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const apikeyForm     = document.getElementById('apikey-form');
const providerSelect = document.getElementById('provider-select');
const apikeyStatus   = document.getElementById('apikey-status');

const logForm      = document.getElementById('log-form');
const logInput     = document.getElementById('log-input');
const logMeta      = document.getElementById('log-meta');

const resultLoading = document.getElementById('result-loading');
const resultError   = document.getElementById('result-error');
const resultCard    = document.getElementById('result-card');
const exportMdBtn   = document.getElementById('export-md-btn');

const STORAGE_PROVIDER           = 'jennifer_provider';
const STORAGE_GROQ_KEY           = 'jennifer_groq_key';
const STORAGE_ANTHROPIC_KEY      = 'jennifer_anthropic_key';
const STORAGE_BEDROCK_API_KEY    = 'jennifer_bedrock_api_key';
const STORAGE_BEDROCK_KEY_REGION = 'jennifer_bedrock_key_region';
const STORAGE_BEDROCK_KEY_MODEL  = 'jennifer_bedrock_key_model';
const STORAGE_BEDROCK_REGION     = 'jennifer_bedrock_region';
const STORAGE_BEDROCK_KEY_ID     = 'jennifer_bedrock_key_id';
const STORAGE_BEDROCK_SECRET     = 'jennifer_bedrock_secret';
const STORAGE_BEDROCK_MODEL      = 'jennifer_bedrock_model';

// 현재 렌더링된 리포트 (Markdown 내보내기용)
let activeReport    = null;
let activeParsedLog = null;

// ── 초기화 ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const savedProvider = sessionStorage.getItem(STORAGE_PROVIDER);
  if (savedProvider) {
    providerSelect.value = savedProvider;
    apikeyStatus.textContent = '자격 증명이 저장되어 있습니다.';
  }
  updateCredsUI(providerSelect.value);
  setupDragAndDrop();
});

providerSelect.addEventListener('change', () => updateCredsUI(providerSelect.value));

function updateCredsUI(provider) {
  document.getElementById('creds-groq').hidden        = provider !== 'groq';
  document.getElementById('creds-anthropic').hidden   = provider !== 'anthropic';
  document.getElementById('creds-bedrock-key').hidden = provider !== 'bedrock-key';
  document.getElementById('creds-bedrock').hidden     = provider !== 'bedrock';
}

// ── API 키 저장 ───────────────────────────────────────────────────────────────

apikeyForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const provider = providerSelect.value;
  sessionStorage.setItem(STORAGE_PROVIDER, provider);

  if (provider === 'groq') {
    const key = document.getElementById('groq-apikey').value.trim();
    if (!key) return;
    sessionStorage.setItem(STORAGE_GROQ_KEY, key);
    document.getElementById('groq-apikey').value = '';
  } else if (provider === 'anthropic') {
    const key = document.getElementById('anthropic-apikey').value.trim();
    if (!key) return;
    sessionStorage.setItem(STORAGE_ANTHROPIC_KEY, key);
    document.getElementById('anthropic-apikey').value = '';
  } else if (provider === 'bedrock-key') {
    const key = document.getElementById('bedrock-apikey').value.trim();
    if (!key) return;
    sessionStorage.setItem(STORAGE_BEDROCK_API_KEY, key);
    sessionStorage.setItem(STORAGE_BEDROCK_KEY_REGION, document.getElementById('bedrock-key-region').value.trim() || 'us-east-1');
    sessionStorage.setItem(STORAGE_BEDROCK_KEY_MODEL, document.getElementById('bedrock-key-model').value.trim());
    document.getElementById('bedrock-apikey').value = '';
  } else if (provider === 'bedrock') {
    const keyId  = document.getElementById('bedrock-key-id').value.trim();
    const secret = document.getElementById('bedrock-secret').value.trim();
    if (!keyId || !secret) return;
    sessionStorage.setItem(STORAGE_BEDROCK_REGION, document.getElementById('bedrock-region').value.trim() || 'us-east-1');
    sessionStorage.setItem(STORAGE_BEDROCK_KEY_ID, keyId);
    sessionStorage.setItem(STORAGE_BEDROCK_SECRET, secret);
    sessionStorage.setItem(STORAGE_BEDROCK_MODEL, document.getElementById('bedrock-model').value.trim());
    document.getElementById('bedrock-key-id').value = '';
    document.getElementById('bedrock-secret').value = '';
  }

  apikeyStatus.textContent = '자격 증명이 저장되었습니다.';
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

  const provider = sessionStorage.getItem(STORAGE_PROVIDER) ?? 'groq';
  let credentials;

  if (provider === 'groq') {
    credentials = { apiKey: sessionStorage.getItem(STORAGE_GROQ_KEY) };
    if (!credentials.apiKey) { showError('Groq API 키를 먼저 저장해 주세요.'); return; }
  } else if (provider === 'anthropic') {
    credentials = { apiKey: sessionStorage.getItem(STORAGE_ANTHROPIC_KEY) };
    if (!credentials.apiKey) { showError('Anthropic API 키를 먼저 저장해 주세요.'); return; }
  } else if (provider === 'bedrock-key') {
    credentials = {
      apiKey:  sessionStorage.getItem(STORAGE_BEDROCK_API_KEY),
      region:  sessionStorage.getItem(STORAGE_BEDROCK_KEY_REGION) || 'us-east-1',
      model:   sessionStorage.getItem(STORAGE_BEDROCK_KEY_MODEL) || undefined,
    };
    if (!credentials.apiKey) { showError('Bedrock API 키를 먼저 저장해 주세요.'); return; }
  } else if (provider === 'bedrock') {
    credentials = {
      region:          sessionStorage.getItem(STORAGE_BEDROCK_REGION) || 'us-east-1',
      accessKeyId:     sessionStorage.getItem(STORAGE_BEDROCK_KEY_ID),
      secretAccessKey: sessionStorage.getItem(STORAGE_BEDROCK_SECRET),
      model:           sessionStorage.getItem(STORAGE_BEDROCK_MODEL) || undefined,
    };
    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      showError('AWS Bedrock 자격 증명을 먼저 저장해 주세요.');
      return;
    }
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
  const result = await analyzeLog(parsedLog, provider, credentials);

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
