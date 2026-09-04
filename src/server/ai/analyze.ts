import "server-only";
import { validateAnalysis, type PinnedInput } from "@/lib/analysis";
import { AppError } from "../errors";
import { createAIProvider, type AIProvider } from "./provider";
import { responseSchema, scopeMessages, SCOPE_PROMPT_VERSION } from "./scope-prompt";

export function analysisLimits() {
  const context = Number(process.env.AI_CONTEXT_TOKENS ?? 32768);
  const output = Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 6000);
  if (!Number.isInteger(context) || context < 8192 || context > 262144 || !Number.isInteger(output) || output < 256 || output > 8192 || output >= context) throw new AppError("AI_NOT_CONFIGURED", "Configure valid AI context/output limits for the chosen endpoint and model.", 503);
  return { context, output };
}
export function checkContext(messages: { content: string }[], limits = analysisLimits()) {
  // Conservative UTF-8 byte allowance, with room for message framing and reserved output.
  // No document, clause, request or repair text is silently truncated to fit.
  if (messages.reduce((sum, m) => sum + Buffer.byteLength(m.content, "utf8"), 0) + limits.output + 1024 > limits.context) throw new AppError("CONTEXT_TOO_LARGE", "The complete scope and request exceed the configured model budget. Ask the operator to verify a larger supported context limit.", 422);
}
export async function generateAnalysis(input: PinnedInput, signal: AbortSignal, provider: AIProvider = createAIProvider()) {
  const limits = analysisLimits();
  const messages: Parameters<AIProvider["generate"]>[0]["messages"] = scopeMessages(input);
  for (let attempt = 0; attempt < 2; attempt++) {
    checkContext(messages, limits);
    signal.throwIfAborted();
    const result = await provider.generate({ messages, maxOutputTokens: limits.output, responseSchema, signal });
    try {
      const analysis = validateAnalysis(JSON.parse(result.text), input.sources);
      return { analysis, provider: result.provider, model: result.model, promptVersion: SCOPE_PROMPT_VERSION, repaired: attempt === 1 };
    } catch {
      if (attempt === 1) throw new AppError("AI_OUTPUT_INVALID", "The AI response could not be validated after one repair attempt. No estimate was saved. Please retry.", 502, true);
      messages.push({ role: "assistant", content: result.text }, { role: "user", content: "Your response failed JSON, schema, hour-range or citation validation. Return the complete corrected JSON, using only the exact supplied source IDs and quotes. Check every matched clause has evidence, covered work has zero hours and inclusion relation, and uncertain work includes a question. Do not add fields or omit requested tasks." });
    }
  }
  throw new AppError("AI_OUTPUT_INVALID", "No valid analysis was returned.", 502);
}
