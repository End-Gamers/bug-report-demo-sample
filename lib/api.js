// ── Provider 설정 ─────────────────────────────────────────────────────────────

const GROQ_ENDPOINT       = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL          = 'llama-3.3-70b-versatile';

const ANTHROPIC_ENDPOINT  = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL     = 'claude-sonnet-4-6';
const ANTHROPIC_VERSION   = '2023-06-01';

const BEDROCK_MODEL = 'us.anthropic.claude-sonnet-4-6';
// Converse API: /models/{id}/converse (InvokeModel /model/{id}/invoke 은 inference profile 미지원)

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
 *
 * @typedef {{ apiKey: string }}                                                           GroqCredentials
 * @typedef {{ apiKey: string }}                                                           AnthropicCredentials
 * @typedef {{ accessKeyId: string, secretAccessKey: string, region?: string, sessionToken?: string }} BedrockCredentials
 */

/**
 * @param {import('./parser.js').ParsedLog} parsedLog
 * @param {'groq'|'anthropic'|'bedrock'} provider
 * @param {GroqCredentials|AnthropicCredentials|BedrockCredentials} credentials
 * @returns {Promise<AnalyzeResult | AnalyzeError>}
 */
export async function analyzeLog(parsedLog, provider, credentials) {
  switch (provider) {
    case 'groq':        return groqAnalyze(parsedLog, credentials.apiKey);
    case 'anthropic':   return anthropicAnalyze(parsedLog, credentials.apiKey);
    case 'bedrock-key': return bedrockApiKeyAnalyze(parsedLog, credentials);
    case 'bedrock':     return bedrockAnalyze(parsedLog, credentials);
    default:            return err('api_error', `지원하지 않는 프로바이더: ${provider}`);
  }
}

// ── Groq ─────────────────────────────────────────────────────────────────────

async function groqAnalyze(parsedLog, apiKey) {
  if (!apiKey?.trim())
    return err('api_key_invalid', 'API 키가 입력되지 않았습니다.');

  let response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type':  'application/json',
        'authorization': `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model:           GROQ_MODEL,
        max_tokens:      4096,
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

  const body    = await safeJson(response);
  const rawText = body?.choices?.[0]?.message?.content ?? '';
  return parseOrError(rawText);
}

// ── Anthropic ────────────────────────────────────────────────────────────────

async function anthropicAnalyze(parsedLog, apiKey) {
  if (!apiKey?.trim())
    return err('api_key_invalid', 'Anthropic API 키를 입력해 주세요.');

  let response;
  try {
    response = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type':      'application/json',
        'x-api-key':         apiKey.trim(),
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model:      ANTHROPIC_MODEL,
        max_tokens: 1024,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: buildPrompt(parsedLog) }],
      }),
    });
  } catch (e) {
    return err('network_error', `네트워크 오류: ${e.message}`);
  }

  if (!response.ok) {
    const body   = await safeJson(response);
    const status = response.status;
    const apiMsg = body?.error?.message ?? '';

    if (status === 401)
      return err('api_key_invalid', 'API 키가 유효하지 않습니다. Anthropic 콘솔에서 확인해 주세요.');
    if (status === 429)
      return err('api_error', `요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요. (${apiMsg})`);
    if (status === 400)
      return err('api_error', `400 Bad Request — ${apiMsg}`);
    return err('api_error', `API 오류 (HTTP ${status}) — ${apiMsg}`);
  }

  const body    = await safeJson(response);
  const rawText = body?.content?.[0]?.text ?? '';
  return parseOrError(rawText);
}

// ── Bedrock 공통: CORS 우회를 위해 로컬 프록시(/api/bedrock)를 경유 ────────────

async function bedrockFetch(endpoint, headers, body) {
  return fetch('/api/bedrock', {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ endpoint, headers, body }),
  });
}

// ── AWS Bedrock (API Key — Bearer 토큰) ───────────────────────────────────────

async function bedrockApiKeyAnalyze(parsedLog, credentials) {
  const { apiKey, region = 'us-east-1', model = BEDROCK_MODEL } = credentials ?? {};
  if (!apiKey?.trim())
    return err('api_key_invalid', 'Bedrock API 키를 입력해 주세요.');

  const endpoint    = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model)}/converse`;
  const requestBody = JSON.stringify({
    system:          [{ text: SYSTEM_PROMPT }],
    messages:        [{ role: 'user', content: [{ text: buildPrompt(parsedLog) }] }],
    inferenceConfig: { maxTokens: 4096 },
  });

  let response;
  try {
    response = await bedrockFetch(endpoint, {
      'content-type':  'application/json',
      'authorization': `Bearer ${apiKey.trim()}`,
    }, requestBody);
  } catch (e) {
    return err('network_error', `네트워크 오류: ${e.message}`);
  }

  if (!response.ok) {
    const body   = await safeJson(response);
    const status = response.status;
    const apiMsg = body?.message ?? body?.error?.message ?? '';

    if (status === 401 || status === 403)
      return err('api_key_invalid', 'Bedrock API 키가 유효하지 않거나 만료되었습니다.');
    if (status === 429)
      return err('api_error', `요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요. (${apiMsg})`);
    if (status === 400)
      return err('api_error', `400 Bad Request — ${apiMsg}`);
    return err('api_error', `API 오류 (HTTP ${status}) — ${apiMsg}`);
  }

  const body    = await safeJson(response);
  const rawText = body?.output?.message?.content?.[0]?.text ?? '';
  return parseOrError(rawText);
}

// ── AWS Bedrock (IAM Signature V4) ────────────────────────────────────────────

async function bedrockAnalyze(parsedLog, credentials) {
  const { accessKeyId, secretAccessKey, region = 'us-east-1', sessionToken, model = BEDROCK_MODEL } = credentials ?? {};

  if (!accessKeyId?.trim() || !secretAccessKey?.trim())
    return err('api_key_invalid', 'AWS Access Key ID와 Secret Access Key를 입력해 주세요.');

  const endpoint    = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model)}/converse`;
  const requestBody = JSON.stringify({
    system:          [{ text: SYSTEM_PROMPT }],
    messages:        [{ role: 'user', content: [{ text: buildPrompt(parsedLog) }] }],
    inferenceConfig: { maxTokens: 4096 },
  });

  let response;
  try {
    const headers = await sigV4Headers({
      method:          'POST',
      endpoint,
      region,
      accessKeyId:     accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
      sessionToken:    sessionToken?.trim() || undefined,
      body:            requestBody,
    });
    response = await bedrockFetch(endpoint, headers, requestBody);
  } catch (e) {
    return err('network_error', `네트워크 오류: ${e.message}`);
  }

  if (!response.ok) {
    const body   = await safeJson(response);
    const status = response.status;
    const apiMsg = body?.message ?? body?.error?.message ?? '';

    if (status === 401 || status === 403)
      return err('api_key_invalid', 'AWS 자격 증명이 유효하지 않거나 Bedrock 호출 권한이 없습니다.');
    if (status === 429)
      return err('api_error', `요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요. (${apiMsg})`);
    if (status === 400)
      return err('api_error', `400 Bad Request — ${apiMsg}`);
    return err('api_error', `API 오류 (HTTP ${status}) — ${apiMsg}`);
  }

  const body    = await safeJson(response);
  const rawText = body?.output?.message?.content?.[0]?.text ?? '';
  return parseOrError(rawText);
}

// ── AWS Signature V4 ──────────────────────────────────────────────────────────

async function sigV4Headers({ method, endpoint, region, accessKeyId, secretAccessKey, sessionToken, body }) {
  const url       = new URL(endpoint);
  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // YYYYMMDDTHHmmssZ
  const datestamp = amzDate.slice(0, 8);

  const bodyHash = await sha256Hex(body);

  const hdrs = {
    'content-type':          'application/json',
    'host':                  url.hostname,
    'x-amz-content-sha256':  bodyHash,
    'x-amz-date':            amzDate,
  };
  if (sessionToken) hdrs['x-amz-security-token'] = sessionToken;

  const sortedKeys    = Object.keys(hdrs).sort();
  const canonicalHdrs = sortedKeys.map(k => `${k}:${hdrs[k]}\n`).join('');
  const signedHdrs    = sortedKeys.join(';');

  const canonicalReq = [method, url.pathname, '', canonicalHdrs, signedHdrs, bodyHash].join('\n');
  const scope        = `${datestamp}/${region}/bedrock/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalReq)].join('\n');

  const signingKey = await deriveSigningKey(secretAccessKey, datestamp, region);
  const signature  = toHex(await hmac(signingKey, stringToSign));

  hdrs['authorization'] =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHdrs}, Signature=${signature}`;

  delete hdrs['host']; // fetch가 자동 설정; 명시적 host 헤더를 거부하는 환경 대응

  return hdrs;
}

async function deriveSigningKey(secret, datestamp, region) {
  const kDate    = await hmac(enc(`AWS4${secret}`), datestamp);
  const kRegion  = await hmac(kDate, region);
  const kService = await hmac(kRegion, 'bedrock');
  return hmac(kService, 'aws4_request');
}

async function hmac(key, data) {
  const k  = key instanceof Uint8Array ? key : enc(key);
  const ck = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', ck, enc(data)));
}

async function sha256Hex(data) {
  const buf = await crypto.subtle.digest('SHA-256', enc(data));
  return toHex(new Uint8Array(buf));
}

function toHex(bytes) { return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''); }
function enc(str)      { return new TextEncoder().encode(str); }

// ── 공통 헬퍼 ─────────────────────────────────────────────────────────────────

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

function parseOrError(rawText) {
  if (!rawText) return err('parse_error', '서버 응답을 읽는 중 오류가 발생했습니다.');
  const report = tryParseReport(rawText);
  if (!report) return { status: 'error', code: 'parse_error', message: '응답을 JSON으로 파싱하지 못했습니다.', rawResponse: rawText };
  return { status: 'ok', data: report };
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
