/**
 * @typedef {'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'} Severity
 */

/**
 * @typedef {Object} BugReport
 * @property {Severity}  severity    - 에러 심각도
 * @property {string}    summary     - 1–2문장 요약
 * @property {string}    rootCause   - 근본 원인 설명
 * @property {string[]}  solutions   - 해결책 목록 (우선순위 순)
 * @property {string}    timestamp   - 로그에서 추출한 최초 발생 시각
 * @property {string}    rawResponse - Claude 원본 응답 (파싱 실패 시 폴백용)
 */

/**
 * @typedef {Object} AnalyzeResult
 * @property {'ok'}    status - 성공
 * @property {BugReport} data
 */

/**
 * @typedef {Object} AnalyzeError
 * @property {'error'}  status
 * @property {'api_error' | 'parse_error' | 'token_limit'} code
 * @property {string}   message - 사용자에게 표시할 오류 설명
 */

/**
 * 파싱된 로그를 Claude API로 전송해 버그 리포트를 생성한다.
 *
 * 동작:
 *   - 모델: claude-sonnet-4-6
 *   - 스트리밍: 미사용 (단일 JSON 응답)
 *   - 응답 형식: JSON — BugReport 스키마를 시스템 프롬프트로 강제
 *   - 파싱 실패 시 rawResponse를 포함한 AnalyzeError 반환
 *
 * @param {import('./parser.js').ParsedLog} parsedLog
 * @param {string} apiKey - Anthropic API 키 (sessionStorage에서 전달)
 * @returns {Promise<AnalyzeResult | AnalyzeError>}
 *
 * @example
 * const result = await analyzeLog(parsed, apiKey);
 * if (result.status === 'ok') renderReport(result.data);
 * else showError(result.message);
 */
export async function analyzeLog(parsedLog, apiKey) {
  // TODO: 구현
}
