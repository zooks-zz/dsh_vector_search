import type { VectorSearchConfig } from "./config.js";

const DEFAULT_TIMEOUT_MS = 30000;

// 最小「响应」形状：真实 fetch 的 Response 与测试 mock 都满足它。
interface JsonResponse {
  ok: boolean;
  status?: number;
  json(): Promise<unknown>;
}

type FetchImpl = (url: string, init: RequestInit) => Promise<JsonResponse>;

// 访问外部 embedding / rerank 服务（SiliconFlow，OpenAI 兼容）。fetch 与 key 获取均可注入，便于单测 mock。
export class EmbeddingClient {
  constructor(
    private cfg: VectorSearchConfig,
    private getApiKey: () => Promise<string>,
    private fetchImpl: FetchImpl = fetch,
    private timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  private async postJson(url: string, key: string, body: unknown): Promise<unknown> {
    const resp = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!resp.ok) throw new Error(`外部服务不可用：HTTP ${resp.status} ${url}`);
    return resp.json();
  }

  // 返回原始向量（Float32Array），校验维度与 NaN；L2 归一化由业务层做。
  async embed(text: string): Promise<Float32Array> {
    const key = await this.getApiKey();
    const json = (await this.postJson(`${this.cfg.embedding_base_url}/embeddings`, key, {
      model: this.cfg.embedding_model,
      input: [text],
      dimensions: this.cfg.dimensions,
    })) as { data?: Array<{ embedding?: unknown }> };
    const vec = json?.data?.[0]?.embedding;
    if (!Array.isArray(vec)) throw new Error("embedding 服务不可用：响应缺少 embedding");
    if (vec.length !== this.cfg.dimensions) {
      throw new Error(`embedding 返回维度不符（期望 ${this.cfg.dimensions}，实际 ${vec.length}）`);
    }
    if (vec.some((v) => typeof v !== "number" || !Number.isFinite(v))) throw new Error("embedding 含 NaN");
    return new Float32Array(vec as number[]);
  }

  // 返回与 documents 等长的分数数组（relevance_score，按 reranker 返回的 index 回填）。
  async rerank(query: string, documents: string[]): Promise<number[]> {
    const key = await this.getApiKey();
    const json = (await this.postJson(`${this.cfg.rerank_base_url}/rerank`, key, {
      model: this.cfg.rerank_model,
      query,
      documents,
      top_n: documents.length,
    })) as { results?: Array<{ index?: unknown; relevance_score?: unknown }> };
    const scores = new Array<number>(documents.length).fill(0);
    for (const r of json?.results ?? []) {
      if (typeof r.index === "number" && typeof r.relevance_score === "number") {
        scores[r.index] = r.relevance_score;
      }
    }
    return scores;
  }
}
