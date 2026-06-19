import type { BotConfig } from "./types";

export async function callLlmProvider(bot: BotConfig, apiKey: string, userText: string, sessionText: string): Promise<string> {
  if (!apiKey) {
    throw new Error("llm_api_key_missing");
  }

  const messages = [
    { role: "system", content: bot.system_prompt },
    ...(bot.streaming ? [{ role: "system", content: `Conversation history:\n${sessionText}` }] : []),
    { role: "user", content: userText }
  ];

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://telegram-bot-platform.local",
      "X-Title": "Telegram Bot Platform"
    },
    body: JSON.stringify({
      model: bot.model,
      messages,
      temperature: bot.model_params.temperature,
      max_tokens: bot.model_params.max_tokens,
      top_p: bot.model_params.top_p,
      frequency_penalty: bot.model_params.frequency_penalty,
      presence_penalty: bot.model_params.presence_penalty,
      stream: false
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error("llm_provider_error");
  }

  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("llm_empty_response");
  }
  return content.trim();
}
