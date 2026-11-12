import { join } from "node:path";
import z from "@deepseek-ai/schemastery";
import { DEFAULTS, resolveDataDir, type VectorSearchConfig } from "./config.js";
import { Storage } from "./storage.js";
import { EmbeddingClient } from "./embedding.js";
import { VectorSearchService } from "./service.js";
import { registerTools, API_KEY_REF } from "./register.js";
import type { DshContext } from "./types.js";

// schemastery Config：字段进设置界面，由 config-editor 持久化。
export const Config = z.object({
  embedding_base_url: z.string().default(DEFAULTS.embedding_base_url),
  rerank_base_url: z.string().default(DEFAULTS.rerank_base_url),
  embedding_model: z.string().default(DEFAULTS.embedding_model),
  rerank_model: z.string().default(DEFAULTS.rerank_model),
  dimensions: z.number().default(DEFAULTS.dimensions),
  recall_top_k: z.number().default(DEFAULTS.recall_top_k),
  result_limit: z.number().default(DEFAULTS.result_limit),
});

// 入口：把各模块接起来。config 是 schemastery 解析后的普通对象。
export function apply(ctx: DshContext, config: VectorSearchConfig): void {
  const dbPath = join(resolveDataDir(), "store.db");

  const storage = new Storage(dbPath);
  const embedding = new EmbeddingClient(config, async () => {
    // API key 存 credentials 的 ref（siliconflow_api_key），由 vs_configure 工具设置。
    const resolved = await ctx.credentials.resolve(API_KEY_REF);
    if (resolved && typeof resolved.value === "string" && resolved.value.trim().length > 0) {
      return resolved.value;
    }
    throw new Error("未配置 SiliconFlow API key：请在 $DSH_HOME/.credentials.yaml 里配置 siliconflow_api_key");
  });
  const service = new VectorSearchService(storage, embedding, config);

  registerTools(ctx, service);
}

export const inject = ["tools", "credentials"];
