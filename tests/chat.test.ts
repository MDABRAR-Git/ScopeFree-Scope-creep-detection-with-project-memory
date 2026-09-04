import { describe, expect, it } from "vitest";
import { chatInputSchema, citationLabels } from "../src/lib/chat";
import { chatCitationSchema } from "../src/lib/contracts";

describe("chat input contract", () => {
  it("accepts a bounded question and conversational context", () => {
    const parsed = chatInputSchema.parse({ question: "What was decided?", context: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }] });
    expect(parsed.question).toBe("What was decided?");
    expect(parsed.context).toHaveLength(2);
  });
  it("defaults context to empty and trims the question", () => {
    expect(chatInputSchema.parse({ question: "  Why did the price change?  " })).toEqual({ question: "Why did the price change?", context: [] });
  });
  it("rejects empty, too-short, oversized questions, unknown roles and unbounded context", () => {
    expect(chatInputSchema.safeParse({ question: "" }).success).toBe(false);
    expect(chatInputSchema.safeParse({ question: "hi" }).success).toBe(false);
    expect(chatInputSchema.safeParse({ question: "x".repeat(2001) }).success).toBe(false);
    expect(chatInputSchema.safeParse({ question: "ok question", context: [{ role: "system", content: "x" }] }).success).toBe(false);
    expect(chatInputSchema.safeParse({ question: "ok question", context: Array(7).fill({ role: "user", content: "x" }) }).success).toBe(false);
    expect(chatInputSchema.safeParse({ question: "ok question", extra: 1 }).success).toBe(false);
  });
});

describe("citation labels", () => {
  it("cover every citation source type the schema allows", () => {
    for (const sourceType of chatCitationSchema.shape.sourceType.options) expect(citationLabels[sourceType]).toBeTruthy();
  });
});
