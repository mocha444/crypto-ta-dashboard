/**
 * Groq API helper — the ONLY place that reads GROQ_API_KEY.
 *
 * Available models on the free tier (confirmed via live API call):
 *   groq/compound-mini  — fast, cheap/free, max 8192 output tokens, json_mode
 *   groq/compound      — same family, slightly larger
 *   openai/gpt-oss-20b — reasoning model, 65K max, $0.075/1M in
 *   openai/gpt-oss-120b— reasoning model, 65K max, $0.15/1M in
 *   qwen/qwen3.8-27b   — reasoning model, 16K max, expensive
 *
 * For this app (short TA summaries) we use groq/compound-mini because:
 *   - max_output_tokens=8192 >> what we need (a few hundred words)
 *   - json_mode for structured output (if we want it later)
 *   - fast & cheap (or free) on the free tier
 */

const GROQ_BASE = "https://api.groq.com/openai/v1";

// groq/compound — larger reasoning budget, more daily tokens than compound-mini
const DEFAULT_MODEL = "groq/compound";

export interface GroqRequest {
  model?: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
}

export interface GroqResponse {
  text: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Chat completion via Groq's OpenAI-compatible endpoint.
 *
 * Recommended settings for this TA app:
 *   - maxTokens: 512  (we only need 3-5 sentences; small = fast + cheap)
 *   - temperature: 0.3-0.5 (lower = more deterministic/factual, higher = more creative)
 *   - topP: omit or 1.0  (use temperature alone for simple tasks)
 *   - No reasoning params (only for chain-of-thought tasks)
 */
export async function groqChat(req: GroqRequest): Promise<GroqResponse> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");

  const model = req.model ?? DEFAULT_MODEL;

  // Groq-specific: use 'max_tokens' not 'max_completion_tokens' in the body
  // Groq supports stop up to 4 strings
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    max_tokens: req.maxTokens ?? 512,
    temperature: req.temperature ?? 0.4, // 0.4 = balanced factual/readable
  };

  // Only include optional params if they're set
  if (req.topP !== undefined) body.top_p = req.topP;
  if (req.stop) body.stop = req.stop;

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq ${res.status} (${model}): ${text}`);
  }

  const json = await res.json();
  const choice = json?.choices?.[0];

  if (!choice?.message?.content) {
    throw new Error(
      `Groq returned empty content (finish_reason=${choice?.finish_reason ?? "unknown"})`,
    );
  }

  const usage = json?.usage;
  return {
    text: choice.message.content,
    model: json.model ?? model,
    usage: usage
      ? {
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        }
      : undefined,
  };
}
