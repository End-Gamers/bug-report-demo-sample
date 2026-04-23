import { parseJenniferLog } from './lib/parser.js';
import { analyzeLog }       from './lib/api.js';

// ── DOM 참조 ──────────────────────────────────────────────────────────────────

const apikeyForm    = document.getElementById('apikey-form');
const apikeyInput   = document.getElementById('apikey-input');
const apikeyStatus  = document.getElementById('apikey-status');

const logForm       = document.getElementById('log-form');
const logInput      = document.getElementById('log-input');
const logMeta       = document.getElementById('log-meta');

const resultLoading = document.getElementById('result-loading');
const resultError   = document.getElementById('result-error');
const resultCard    = document.getElementById('result-card');

const exportMdBtn   = document.getElementById('export-md-btn');

// ── API 키 관리 ───────────────────────────────────────────────────────────────

/**
 * 폼 제출 시 API 키를 sessionStorage에 임시 저장하고 상태 메시지를 업데이트한다.
 * @param {SubmitEvent} event
 */
function handleApiKeySave(event) {
  event.preventDefault();
  // TODO: apikeyInput.value를 sessionStorage에 저장
  // TODO: apikeyStatus에 저장 완료 메시지 표시
  // TODO: apikeyInput.value 초기화 (화면에서 키 숨기기)
}

// ── 로그 메타 정보 표시 ───────────────────────────────────────────────────────

/**
 * 로그 입력이 변경될 때마다 줄 수와 토큰 추정치를 logMeta에 표시한다.
 */
function handleLogInputChange() {
  // TODO: 줄 수 계산
  // TODO: 토큰 추정 (글자 수 / 4 근사)
  // TODO: logMeta 텍스트 업데이트
}

// ── 분석 실행 ─────────────────────────────────────────────────────────────────

/**
 * 로그 폼 제출 → 파싱 → API 호출 → 결과 렌더링의 메인 흐름을 조율한다.
 * @param {SubmitEvent} event
 */
async function handleLogSubmit(event) {
  event.preventDefault();
  // TODO: sessionStorage에서 API 키 조회, 없으면 사용자에게 안내 후 중단
  // TODO: setUiState('loading') 호출
  // TODO: parseJenniferLog(logInput.value) 호출
  // TODO: analyzeLog(parsedLog, apiKey) 호출
  // TODO: 결과가 'ok'이면 renderReport(result.data), 'error'이면 renderError(result.message)
}

// ── 결과 렌더링 ───────────────────────────────────────────────────────────────

/**
 * BugReport 데이터를 DOM 카드 요소에 반영한다.
 * @param {import('./lib/api.js').BugReport} report
 */
function renderReport(report) {
  // TODO: severity, timestamp, summary, rootCause, solutions, stackTrace 각 요소에 주입
  // TODO: setUiState('result') 호출
}

/**
 * 오류 메시지를 result-error 요소에 표시한다.
 * @param {string} message
 */
function renderError(message) {
  // TODO: resultError.textContent 설정
  // TODO: setUiState('error') 호출
}

// ── UI 상태 전환 ──────────────────────────────────────────────────────────────

/**
 * 로딩·오류·결과 요소의 hidden 속성을 전환해 UI 상태를 관리한다.
 * @param {'idle' | 'loading' | 'error' | 'result'} state
 */
function setUiState(state) {
  // TODO: state에 따라 resultLoading / resultError / resultCard의 hidden 토글
}

// ── Markdown 내보내기 ─────────────────────────────────────────────────────────

/**
 * 현재 렌더링된 리포트를 Markdown 파일로 다운로드한다.
 */
function handleExportMarkdown() {
  // TODO: 카드 내용을 Markdown 문자열로 직렬화
  // TODO: Blob + <a download> 트릭으로 파일 다운로드 트리거
}

// ── 이벤트 리스너 등록 ────────────────────────────────────────────────────────

apikeyForm.addEventListener('submit', handleApiKeySave);
logInput.addEventListener('input', handleLogInputChange);
logForm.addEventListener('submit', handleLogSubmit);
exportMdBtn.addEventListener('click', handleExportMarkdown);
