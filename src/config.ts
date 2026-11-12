import { homedir } from "node:os";
import { join } from "node:path";

// 本插件的运行时配置（schemastery 解析后的普通对象）。
export interface VectorSearchConfig {
  embedding_base_url: string;
  rerank_base_url: string;
  embedding_model: string;
  rerank_model: string;
  dimensions: number;
  recall_top_k: number;
  result_limit: number;
}

// 默认配置值：喂给 index.ts 的 schemastery Config schema 作 .default()。
export const DEFAULTS: Readonly<VectorSearchConfig> = Object.freeze({
  embedding_base_url: "https://api.siliconflow.cn/v1",
  rerank_base_url: "https://api.siliconflow.cn/v1",
  embedding_model: "Qwen/Qwen3-Embedding-0.6B",
  rerank_model: "Qwen/Qwen3-Reranker-0.6B",
  dimensions: 1024,
  recall_top_k: 30,
  result_limit: 10,
});

// 运行时数据目录（DB）。跨 profile、跨项目共享。
export function resolveDataDir(): string {
  return join(process.env.DSH_HOME || homedir(), "dsh-vector-search");
}
