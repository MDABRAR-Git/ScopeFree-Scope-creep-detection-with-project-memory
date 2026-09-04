import "server-only";
import { z } from "zod";
import { AppError } from "../errors";

// Provider-independent transactional email boundary. Business logic, database records and UI
// never import a specific provider SDK: they depend only on this interface. Swapping providers
// needs only a new adapter plus registry entry, exactly like the AI provider boundary.
export interface EmailProvider {
  send(input: { to: string; subject: string; html: string; text: string; signal: AbortSignal }): Promise<{ providerMessageId: string | null; provider: string }>;
}

const emailAddress = z.string().trim().max(254).transform(value => value.toLowerCase()).pipe(z.email());
const configSchema = z.object({
  provider: z.enum(["http-json"]),
  apiUrl: z.url(),
  apiKey: z.string().trim().min(1),
  from: emailAddress,
  timeoutMs: z.coerce.number().int().min(1000).max(90000),
});
type EmailConfig = z.infer<typeof configSchema>;

export function createEmailProvider(): EmailProvider {
  const parsed = configSchema.safeParse({
    provider: process.env.EMAIL_PROVIDER ?? "http-json",
    apiUrl: process.env.EMAIL_API_URL,
    apiKey: process.env.EMAIL_API_KEY,
    from: process.env.EMAIL_FROM,
    timeoutMs: process.env.EMAIL_REQUEST_TIMEOUT_MS ?? 15000,
  });
  if (!parsed.success) throw new AppError("EMAIL_NOT_CONFIGURED", "Email delivery is not configured. Ask the operator to set the email provider, endpoint, API key and verified sender.", 503);
  const config = parsed.data;
  const url = new URL(config.apiUrl);
  if (url.username || url.password || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new AppError("EMAIL_NOT_CONFIGURED", "Use an HTTPS email endpoint (HTTP is permitted only for local development).", 503);
  }
  return new HttpJsonEmailProvider(config);
}

// One OpenAI-compatible-style adapter: posts a JSON body { from, to, subject, html, text } with a
// bearer key, matching Resend/Postmark-shaped transactional APIs. A non-compatible provider needs
// only a new adapter class and a registry entry above.
class HttpJsonEmailProvider implements EmailProvider {
  constructor(private config: EmailConfig) {}
  async send(input: Parameters<EmailProvider["send"]>[0]) {
    const controller = new AbortController();
    const signal = AbortSignal.any([input.signal, controller.signal]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    // Enforce the deadline even if the transport never settles on abort.
    const stopped = new Promise<never>((_, reject) => {
      onAbort = () => reject(new AppError("EMAIL_SEND_FAILED", "The email provider did not respond in time. The offer was saved; use Resend to try again.", 502, true));
      signal.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      if (signal.aborted) onAbort();
    });
    try { return await Promise.race([this.post(input, signal), stopped]); }
    finally { if (timer) clearTimeout(timer); if (onAbort) signal.removeEventListener("abort", onAbort); }
  }
  private async post(input: Parameters<EmailProvider["send"]>[0], signal: AbortSignal) {
    try {
      const response = await fetch(this.config.apiUrl, {
        method: "POST", signal, redirect: "error", cache: "no-store",
        headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: this.config.from, to: input.to, subject: input.subject, html: input.html, text: input.text }),
      });
      if (response.status === 429) throw new AppError("EMAIL_SEND_FAILED", "The email provider is rate limiting requests. Retry the send shortly.", 502, true);
      if (!response.ok) throw new AppError("EMAIL_SEND_FAILED", "The email provider rejected the request. The offer was saved; use Resend to try again.", 502, true);
      // Bound and best-effort parse the provider response for a message id. Never persist or expose
      // provider error bodies, credentials, tokens or full proposal URLs.
      let providerMessageId: string | null = null;
      try {
        const body: unknown = await response.json();
        const id = z.object({ id: z.string().min(1).max(200) }).safeParse(body);
        if (id.success) providerMessageId = id.data.id;
      } catch { providerMessageId = null; }
      return { providerMessageId, provider: this.config.provider };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("EMAIL_SEND_FAILED", "The email provider could not be reached. The offer was saved; use Resend to try again.", 502, true);
    }
  }
}
