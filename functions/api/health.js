export function onRequestGet(context) {
  const { env } = context;
  return new Response(
    JSON.stringify(
      {
        ok: true,
        hasOpenAIKey: Boolean(env.OPENAI_API_KEY),
        model: env.OPENAI_MODEL || null,
        dailyLimit: env.PORTFOLIO_DAILY_LIMIT || null,
        globalDailyLimit: env.PORTFOLIO_GLOBAL_DAILY_LIMIT || null,
        contextNodes: env.PORTFOLIO_AI_CONTEXT_NODES || null,
        maxOutputTokens: env.PORTFOLIO_AI_MAX_OUTPUT_TOKENS || null,
        hasRateLimitKv: Boolean(env.PORTFOLIO_RATE_LIMITS)
      },
      null,
      2
    ),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
