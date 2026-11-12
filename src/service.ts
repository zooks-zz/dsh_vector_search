import { l2normalize, dot } from "./vector.js";
import { assertApp, assertSource, normalizeEntries, normalizeMinScore } from "./validate.js";
import type { VectorSearchConfig } from "./config.js";
import type { Storage } from "./storage.js";

export interface SearchResult {
  source: string;
  entry: string;
  payload?: unknown;
  rerank_score: number;
}

// 业务层只依赖这个最小接口，单测可用纯对象 mock，不必实例化真实 EmbeddingClient。
export interface Embedder {
  embed(text: string): Promise<Float32Array>;
  rerank(query: string, documents: string[]): Promise<number[]>;
}

// 业务层只需要这两个搜索参数，不关心 embedding 的外部配置。
export type ServiceConfig = Pick<VectorSearchConfig, "recall_top_k" | "result_limit" | "min_score">;

// 业务逻辑：set / get / delete / search 的编排。storage 与 embedding 均注入，便于单测 mock。
export class VectorSearchService {
  private _writeChain: Promise<void> = Promise.resolve();

  constructor(
    private storage: Storage,
    private embedding: Embedder,
    private cfg: ServiceConfig,
  ) {}

  // 写队列：一次只跑一个写操作（embed 在锁内串行，符合「一条写完再下一条」）。
  private lock<T>(fn: () => T | Promise<T>): Promise<T> {
    const prev = this._writeChain;
    const run = prev.then(() => fn());
    this._writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async embedNormalized(text: string): Promise<Float32Array> {
    return l2normalize(await this.embedding.embed(text));
  }

  // set = 幂等 upsert：source 不存在则新建、存在则全量替换（entries + payload）。
  set(app: unknown, source: unknown, entries: unknown, payload: unknown): Promise<{ app: string; source: string }> {
    return this.lock(() => this.setLocked(app, source, entries, payload));
  }

  private async setLocked(
    appRaw: unknown,
    sourceRaw: unknown,
    entries: unknown,
    payload: unknown,
  ): Promise<{ app: string; source: string }> {
    const app = assertApp(appRaw);
    const source = assertSource(sourceRaw);
    const list = normalizeEntries(entries);
    const vectors: Float32Array[] = [];
    for (const entry of list) vectors.push(await this.embedNormalized(entry));
    this.storage.transaction(() => {
      this.storage.deleteEntries(app, source);
      for (let i = 0; i < list.length; i++) this.storage.insertEntry(app, source, list[i], vectors[i]);
      if (payload !== undefined && payload !== null) this.storage.upsertPayload(app, source, payload);
      else this.storage.deletePayload(app, source);
    });
    return { app, source };
  }

  // get = 按 source 精确取回完整记录；不存在返回 null（幂等，不报错）。
  get(appRaw: unknown, sourceRaw: unknown): { app: string; source: string; entries: string[]; payload: unknown } | null {
    const app = assertApp(appRaw);
    const source = assertSource(sourceRaw);
    if (!this.storage.sourceExists(app, source)) return null;
    const entries = this.storage.listSourceEntries(app, source);
    const payload = this.storage.getPayload(app, source);
    return { app, source, entries, payload };
  }

  delete(app: unknown, source: unknown): Promise<{ app: string; source: string }> {
    return this.lock(() => this.deleteLocked(app, source));
  }

  private deleteLocked(appRaw: unknown, sourceRaw: unknown): { app: string; source: string } {
    const app = assertApp(appRaw);
    const source = assertSource(sourceRaw);
    this.storage.transaction(() => {
      this.storage.deleteEntries(app, source);
      this.storage.deletePayload(app, source);
    });
    return { app, source };
  }

  async search(appRaw: unknown, query: unknown, limit?: unknown, minScore?: unknown, topK?: unknown): Promise<{ results: SearchResult[] }> {
    const app = assertApp(appRaw);
    const q = typeof query === "string" ? query.trim() : "";
    if (q.length === 0) return { results: [] };
    const all = this.storage.loadEntries(app);
    if (all.length === 0) throw new Error("库为空");
    const qvec = await this.embedNormalized(q);
    const scored = all
      .map((r) => ({ ...r, score: dot(qvec, r.vector) }))
      .sort((a, b) => b.score - a.score);
    const k = Math.min((typeof topK === "number" ? topK : this.cfg.recall_top_k), scored.length);
    const candidates = scored.slice(0, k);
    const rerankScores = await this.embedding.rerank(q, candidates.map((c) => c.entry));
    const combined = candidates
      .map((c, i) => ({ ...c, rerank: rerankScores[i] }))
      .sort((a, b) => b.rerank - a.rerank);
    const cap = typeof limit === "number" ? limit : this.cfg.result_limit;
    const threshold = normalizeMinScore(minScore, this.cfg.min_score);
    const seen = new Set<string>();
    const results: SearchResult[] = [];
    for (const c of combined) {
      if (seen.has(c.source)) continue;
      if (c.rerank < threshold) break; // combined 已按 rerank 降序，一旦低于阈值即可停止
      seen.add(c.source);
      const item: SearchResult = { source: c.source, entry: c.entry, rerank_score: c.rerank };
      const p = this.storage.getPayload(app, c.source);
      if (p != null) item.payload = p;
      results.push(item);
      if (results.length >= cap) break;
    }
    return { results };
  }
}

// 把搜索结果格式化成模型可见文本（供 register.ts 的 vs_search render 用）。
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return "无结果";
  return results
    .map((r, i) => {
      const lines = [
        `${i + 1}. source: ${r.source}`,
        `   entry: ${r.entry}`,
        `   rerank_score: ${r.rerank_score.toFixed(4)}`,
      ];
      if (r.payload != null) lines.push(`   payload: ${JSON.stringify(r.payload)}`);
      return lines.join("\n");
    })
    .join("\n");
}
