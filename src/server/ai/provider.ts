import "server-only";
import { z } from "zod";
import { AppError } from "../errors";

export interface AIProvider {
  generate(input: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    maxOutputTokens: number;
    responseSchema?: unknown;
    signal: AbortSignal;
  }): Promise<{ text: string; model: string; provider: string }>;
}
const configSchema = z.object({
  provider: z.enum(["featherless", "openai-compatible"]), baseUrl: z.url(),
  model: z.string().trim().min(1), apiKey: z.string().trim().min(1), nativeSchema: z.enum(["true", "false"]),
});
export function createAIProvider(): AIProvider {
  const parsed = configSchema.safeParse({ provider: process.env.AI_PROVIDER ?? "featherless", baseUrl: process.env.AI_BASE_URL ?? "https://api.featherless.ai/v1", model: process.env.AI_MODEL, apiKey: process.env.AI_API_KEY, nativeSchema: process.env.AI_NATIVE_JSON_SCHEMA ?? "false" });
  if (!parsed.success) throw new AppError("AI_NOT_CONFIGURED", "Configure the server AI provider, endpoint, model and API key before running AI features.", 503);
  const config = parsed.data;
  const url = new URL(config.baseUrl);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new AppError("AI_NOT_CONFIGURED", "Use an HTTPS AI endpoint (HTTP is permitted only for local development).", 503);
  return new OpenAICompatibleProvider(config);
}
class OpenAICompatibleProvider implements AIProvider {
  constructor(private config: z.infer<typeof configSchema>) {}
  async generate(input: Parameters<AIProvider["generate"]>[0]) {
    const { config } = this;
    if (!Number.isInteger(input.maxOutputTokens) || input.maxOutputTokens < 1 || input.maxOutputTokens > 8192) throw new AppError("INVALID_INPUT", "The AI output limit is invalid.", 422);
    const signal = AbortSignal.any([input.signal, AbortSignal.timeout(30_000)]);
    try {
      const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST", signal, redirect: "error", cache: "no-store",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.model, messages: input.messages, max_tokens: input.maxOutputTokens,
          ...(input.responseSchema && config.nativeSchema === "true" ? { response_format: { type: "json_schema", json_schema: { name: "response", strict: true, schema: input.responseSchema } } } : {}),
        }),
      });
      if (response.status === 429) throw new AppError("AI_RATE_LIMITED", "The AI provider is rate limiting requests. Please retry later.", 429, true);
      if (!response.ok) throw new AppError("AI_UNAVAILABLE", "The AI provider could not complete the request. Check server configuration or retry later.", 502, true);
      // Bound provider response memory before parsing. Never persist or expose provider error bodies.
      const reader = response.body?.getReader();
      if (!reader) throw new AppError("AI_OUTPUT_INVALID", "The AI provider returned an empty response.", 502);
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > 1_048_576) { await reader.cancel(); throw new AppError("AI_OUTPUT_INVALID", "The AI response exceeded the output limit.", 502); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { throw new AppError("AI_OUTPUT_INVALID", "The AI provider returned an invalid response.", 502); }
      const parsed = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string().min(1) }), finish_reason: z.string().nullable().optional() })).min(1) }).safeParse(body);
      if (!parsed.success || parsed.data.choices[0].finish_reason === "length") throw new AppError("AI_OUTPUT_INVALID", "The AI provider returned an invalid or incomplete response.", 502);
      return { text: parsed.data.choices[0].message.content, model: config.model, provider: config.provider };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (signal.aborted) throw new AppError("AI_TIMEOUT", "The AI request timed out or was cancelled. Please retry.", 504, true);
      throw new AppError("AI_UNAVAILABLE", "The AI provider could not be reached. Please retry.", 502, true);
    }
  }
}
