const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `\
You are an expert backend engineer analyzing application logs.
Respond ONLY with a single valid JSON object — no markdown, no code block, no explanation.

Required schema:
{
  "severity":          "Critical" | "High" | "Medium" | "Low",
  "summary":           "<1-2 sentence overview>",
  "rootCause":         "<detailed root cause>",
  "impact":            "<affected systems or users>",
  "solutions":         ["<step 1>", "<step 2>", ...],
  "estimatedFixTime":  "<e.g. 30분, 2시간, 1일>"
}

Severity guide:
- Critical: service down or data loss
- High: major feature broken, significant user impact
- Medium: degraded performance, workaround exists
- Low: cosmetic or edge-case issue`;

/**
 * @typedef {'Critical'|'High'|'Medium'|'Low'} Severity
 *
 * @typedef {Object} BugReport
 * @property {Severity}  severity
 * @property {string}    summary
 * @property {string}    rootCause
 * @property {string}    impact
 * @property {string[]}  solutions
 * @property {string}    estimatedFixTime
 *
 * @typedef {{ status: 'ok',    data: BugReport }}                                        AnalyzeResult
 * @typedef {{ status: 'error', code: ErrorCode, message: string, rawResponse?: string }} AnalyzeError
 * @typedef {'api_key_invalid'|'api_error'|'network_error'|'parse_error'|'token_limit'}  ErrorCode
 */

/**
 * @param {import('./parser.js').ParsedLog} parsedLog
 * @param {string} apiKey - Groq API 키 (gsk_...)
 * @returns {Promise<AnalyzeResult | AnalyzeError>}
 */
export async function analyzeLog(parsedLog, apiKey) {
  if (!apiKey?.trim()) {
    return err('api_key_invalid', 'API 키가 입력되지 않았습니다.');
  }

  // ── 요청 ─────────────────────────────────────────────────────────────────

  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type':  'application/json',
        'authorization': `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model:           MODEL,
        max_tokens:      1024,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: buildPrompt(parsedLog) },
        ],
      }),
    });
  } catch (e) {
    return err('network_error', `네트워크 오류: ${e.message}`);
  }

  // ── HTTP 오류 분류 ────────────────────────────────────────────────────────

  if (!response.ok) {
    const body   = await safeJson(response);
    const status = response.status;
    const apiMsg = body?.error?.message ?? '';

    if (status === 401)
      return err('api_key_invalid', 'API 키가 유효하지 않습니다. Groq 콘솔에서 확인해 주세요.');
    if (status === 429)
      return err('api_error', `요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요. (${apiMsg})`);
    if (status === 400)
      return err('api_error', `400 Bad Request — ${apiMsg}`);
    return err('api_error', `API 오류 (HTTP ${status}) — ${apiMsg}`);
  }

  // ── 응답 파싱 ─────────────────────────────────────────────────────────────

  const body = await safeJson(response);
  if (!body) return err('parse_error', '서버 응답을 읽는 중 오류가 발생했습니다.');

  const rawText = body.choices?.[0]?.message?.content ?? '';

  const report = tryParseReport(rawText);
  if (!report) {
    return {
      status:      'error',
      code:        'parse_error',
      message:     '응답을 JSON으로 파싱하지 못했습니다.',
      rawResponse: rawText,
    };
  }

  return { status: 'ok', data: report };
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

function buildPrompt(parsedLog) {
  const lines = [
    `ERROR ${parsedLog.summary.errorCount}건, WARN ${parsedLog.summary.warnCount}건이 감지되었습니다.\n`,
  ];

  if (parsedLog.errors.length > 0) {
    lines.push('=== ERROR ===');
    for (const e of parsedLog.errors) {
      lines.push(`[${e.timestamp}] ${e.class} - ${e.message}`);
      if (e.stacktrace) lines.push(e.stacktrace);
    }
  }

  if (parsedLog.warnings.length > 0) {
    lines.push('\n=== WARN ===');
    for (const w of parsedLog.warnings) {
      lines.push(`[${w.timestamp}] ${w.class} - ${w.message}`);
    }
  }

  return lines.join('\n');
}

function tryParseReport(text) {
  try { return JSON.parse(text); } catch { /* fall through */ }

  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

async function safeJson(response) {
  try { return await response.json(); } catch { return null; }
}

function err(code, message) {
  return { status: 'error', code, message };
}
