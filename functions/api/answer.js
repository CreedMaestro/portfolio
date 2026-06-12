const memoryLimits = new Map();

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

export async function onRequestGet() {
  return json({ error: "Method not allowed." }, 405);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await readJson(request);
    const question = String(body.question || "").trim();

    if (question.length < 2) {
      return json({ error: "질문을 2글자 이상 입력하세요." }, 400);
    }

    if (question.length > 500) {
      return json({ error: "질문은 500자 이하로 입력하세요." }, 400);
    }

    if (!env.OPENAI_API_KEY) {
      return json({ error: "OPENAI_API_KEY가 Cloudflare 환경변수에 설정되지 않았습니다." }, 503);
    }

    const ip = getClientIp(request);
    const limit = await checkRateLimit(env, ip);
    if (!limit.allowed) {
      const error =
        limit.reason === "global"
          ? `오늘의 전체 Agent Daon 답변 한도 ${limit.globalLimit}회를 모두 사용했습니다.`
          : `오늘의 Agent Daon 답변 한도 ${limit.limit}회를 모두 사용했습니다.`;
      return json({ error, rateLimit: limit }, 429);
    }

    const publicIndex = await loadPublicIndex(env, request);
    const contextItems = findRelevantItems(question, publicIndex.items || [], numberEnv(env.PORTFOLIO_AI_CONTEXT_NODES, 5));
    const answer = await createOpenAIAnswer(env, question, contextItems);
    const consumed = await consumeRateLimit(env, ip);

    return json({
      answer,
      model: env.OPENAI_MODEL || "gpt-5.4-mini",
      sources: contextItems.map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary
      })),
      rateLimit: consumed
    });
  } catch (error) {
    return json({ error: error.message || "Agent Daon 답변 생성에 실패했습니다." }, error.status || 500);
  }
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 16_384) {
    const error = new Error("요청 본문이 너무 큽니다.");
    error.status = 413;
    throw error;
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const error = new Error("JSON 요청 형식이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }
}

async function loadPublicIndex(env, request) {
  const assetUrl = new URL("/data/public-index.json", request.url);
  const response = env.ASSETS
    ? await env.ASSETS.fetch(assetUrl.toString())
    : await fetch(assetUrl.toString());

  if (!response.ok) {
    const error = new Error("공개 포트폴리오 인덱스를 불러오지 못했습니다.");
    error.status = 500;
    throw error;
  }

  return response.json();
}

function termsFromQuestion(question) {
  return question
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

function findRelevantItems(question, items, maxItems) {
  const terms = termsFromQuestion(question);
  const scored = items.map((item) => {
    const haystack = item.searchText || [item.title, item.summary, item.body, ...(item.tags || [])].join(" ").toLowerCase();
    const title = String(item.title || "").toLowerCase();
    const score = terms.reduce((sum, term) => {
      if (title.includes(term)) return sum + 5;
      if (haystack.includes(term)) return sum + 1;
      return sum;
    }, 0);
    return { item, score };
  });

  const matches = scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || String(a.item.title).localeCompare(String(b.item.title)))
    .map((entry) => entry.item);

  return (matches.length ? matches : items).slice(0, maxItems);
}

function buildPrompt(question, contextItems) {
  const context = contextItems
    .map((item, index) => {
      return [
        `[${index + 1}] ${item.title}`,
        `유형: ${item.type}`,
        `도메인: ${(item.domains || []).join(", ")}`,
        `요약: ${item.summary}`,
        `본문: ${item.body}`
      ].join("\n");
    })
    .join("\n\n");

  return [
    "당신은 공개 포트폴리오용 Second Brain 안내자 Agent Daon입니다.",
    "아래 공개 노드 내용만 근거로 답변하세요.",
    "개인정보, 비공개 업무자료, 실제 고객/거래처 정보, 내부 경로, 원본 문서가 있다고 추정하지 마세요.",
    "한국어로 3~5문장 정도로 답하고, 마지막 줄에 근거 노드 제목을 짧게 나열하세요.",
    "",
    `질문: ${question}`,
    "",
    "공개 노드:",
    context
  ].join("\n");
}

async function createOpenAIAnswer(env, question, contextItems) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.4-mini",
      input: buildPrompt(question, contextItems),
      max_output_tokens: numberEnv(env.PORTFOLIO_AI_MAX_OUTPUT_TOKENS, 420)
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || "OpenAI API 요청에 실패했습니다.");
    error.status = response.status;
    throw error;
  }

  return extractOutputText(payload);
}

function extractOutputText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text.trim();

  const chunks = [];
  for (const output of payload.output || []) {
    for (const content of output.content || []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function checkRateLimit(env, ip) {
  const state = await readLimitState(env, ip);
  const limit = numberEnv(env.PORTFOLIO_DAILY_LIMIT, 30);
  const globalLimit = numberEnv(env.PORTFOLIO_GLOBAL_DAILY_LIMIT, 300);

  if (state.total >= globalLimit) {
    return limitPayload(false, "global", state.ipCount, state.total, limit, globalLimit, state.mode);
  }

  if (state.ipCount >= limit) {
    return limitPayload(false, "ip", state.ipCount, state.total, limit, globalLimit, state.mode);
  }

  return limitPayload(true, null, state.ipCount, state.total, limit, globalLimit, state.mode);
}

async function consumeRateLimit(env, ip) {
  const state = await readLimitState(env, ip);
  const limit = numberEnv(env.PORTFOLIO_DAILY_LIMIT, 30);
  const globalLimit = numberEnv(env.PORTFOLIO_GLOBAL_DAILY_LIMIT, 300);
  const nextIpCount = state.ipCount + 1;
  const nextTotal = state.total + 1;

  await writeLimitState(env, state.day, state.ipKey, nextIpCount, nextTotal);
  return limitPayload(true, null, nextIpCount, nextTotal, limit, globalLimit, state.mode);
}

async function readLimitState(env, ip) {
  const day = dayKey();
  const ipKey = `portfolio-ai:${day}:ip:${await sha256(ip)}`;
  const totalKey = `portfolio-ai:${day}:total`;
  const store = env.PORTFOLIO_RATE_LIMITS;

  if (store) {
    const [ipCount, total] = await Promise.all([
      store.get(ipKey, "json"),
      store.get(totalKey, "json")
    ]);
    return {
      day,
      ipKey,
      totalKey,
      mode: "kv",
      ipCount: Number(ipCount || 0),
      total: Number(total || 0)
    };
  }

  const ipCount = Number(memoryLimits.get(ipKey) || 0);
  const total = Number(memoryLimits.get(totalKey) || 0);
  return { day, ipKey, totalKey, mode: "memory", ipCount, total };
}

async function writeLimitState(env, day, ipKey, ipCount, total) {
  const totalKey = `portfolio-ai:${day}:total`;
  const store = env.PORTFOLIO_RATE_LIMITS;
  if (store) {
    await Promise.all([
      store.put(ipKey, JSON.stringify(ipCount), { expirationTtl: 172800 }),
      store.put(totalKey, JSON.stringify(total), { expirationTtl: 172800 })
    ]);
    return;
  }

  memoryLimits.set(ipKey, ipCount);
  memoryLimits.set(totalKey, total);
}

function limitPayload(allowed, reason, ipCount, total, limit, globalLimit, mode) {
  return {
    allowed,
    reason,
    remaining: Math.max(0, limit - ipCount),
    globalRemaining: Math.max(0, globalLimit - total),
    limit,
    globalLimit,
    mode,
    reset: dayKey()
  };
}

function dayKey() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(new Date());
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function numberEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}
