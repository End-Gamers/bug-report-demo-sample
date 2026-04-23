/**
 * @typedef {Object} ParsedLog
 * @property {LogEntry[]} entries   - ERROR/WARN 단위로 분리된 로그 항목 목록
 * @property {string}     raw       - 원본 로그 전체 텍스트
 * @property {number}     lineCount - 원본 총 줄 수
 */

/**
 * @typedef {Object} LogEntry
 * @property {'ERROR' | 'WARN'}  level      - 로그 레벨
 * @property {string}            timestamp  - 원본 타임스탬프 문자열 (예: "2024-03-15 09:32:11.847")
 * @property {string}            logger     - 로거 이름 (예: "com.example.OrderService")
 * @property {string}            message    - 에러 메시지 본문
 * @property {string | null}     stackTrace - 해당 항목에 딸린 스택 트레이스, 없으면 null
 */

/**
 * 제니퍼 APM 로그 텍스트를 파싱해 ERROR/WARN 항목과 스택 트레이스를 분리한다.
 *
 * 처리 순서:
 *   1. 줄 단위로 분할
 *   2. ERROR/WARN 로그 라인을 기준으로 항목 경계 탐지
 *   3. 항목 뒤에 이어지는 들여쓰기 줄(\tat / Caused by:)을 스택 트레이스로 수집
 *   4. 나머지 INFO/DEBUG 줄은 무시
 *
 * @param {string} text - 붙여넣은 원본 로그 텍스트
 * @returns {ParsedLog}
 *
 * @example
 * const result = parseJenniferLog(rawText);
 * result.entries.forEach(e => console.log(e.level, e.message));
 */
export function parseJenniferLog(text) {
  // TODO: 구현
}
