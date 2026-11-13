import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
let client: Anthropic | null = null;
export const hasClaude = () => !!process.env.ANTHROPIC_API_KEY;

function c() {
  if (!client) client = new Anthropic();
  return client;
}

/** Ask Claude for JSON matching a schema. Returns null on refusal or failure. */
export async function askJSON<T>(system: string, user: string, schema: object, opts: { web?: boolean } = {}): Promise<T | null> {
  if (!hasClaude()) return null;
  try {
    const params: any = {
      model: MODEL,
      max_tokens: 16000,
      system,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: user }],
    };
    if (opts.web) {
      params.tools = [
        { type: "web_search_20260209", name: "web_search", max_uses: 3 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 },
      ];
    }
    const res: any = await c().beta.messages.create(params);
    if (res.stop_reason === "refusal") return null;
    const text = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    const m = text.match(/\{[\s\S]*\}$/);
    return JSON.parse(m ? m[0] : text) as T;
  } catch (e) {
    console.error("Claude call failed:", (e as Error).message);
    return null;
  }
}
