/**
 * LLM Provider Adapter（方案 §9.4：先接一个支持结构化输出的可靠模型）。
 * 使用 OpenAI 兼容协议（GLM/DeepSeek/OpenAI 均适用），只允许服务端调用。
 */

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class LlmError extends Error {
  constructor(
    message: string,
    public code: "NOT_CONFIGURED" | "TIMEOUT" | "BAD_RESPONSE" | "UPSTREAM"
  ) {
    super(message);
  }
}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY && process.env.LLM_BASE_URL && process.env.LLM_MODEL);
}

const TIMEOUT_MS = 90_000;

export async function chatComplete(
  messages: LlmMessage[],
  opts?: { temperature?: number; forceJson?: boolean }
): Promise<string> {
  if (!isLlmConfigured()) {
    throw new LlmError("LLM 未配置", "NOT_CONFIGURED");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${process.env.LLM_BASE_URL!.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL,
        temperature: opts?.temperature ?? 0.2,
        messages,
        ...(opts?.forceJson ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new LlmError(`上游模型返回 ${res.status}: ${detail.slice(0, 300)}`, "UPSTREAM");
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new LlmError("上游模型响应缺少内容", "BAD_RESPONSE");
    return content;
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new LlmError("模型调用超时", "TIMEOUT");
    }
    throw new LlmError(err instanceof Error ? err.message : "模型调用失败", "UPSTREAM");
  } finally {
    clearTimeout(timer);
  }
}

/** 从模型输出中稳健地提取 JSON（容忍 ```json 包裹或前后说明文字） */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.search(/[{[]/);
  if (start === -1) throw new LlmError("模型输出中没有 JSON", "BAD_RESPONSE");
  return JSON.parse(candidate.slice(start));
}
