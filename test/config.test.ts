import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, resolveDataDir } from "../lib/config.js";

test("DEFAULTS 含全部字段且值合理", () => {
  assert.deepEqual(Object.keys(DEFAULTS).sort(), [
    "dimensions",
    "embedding_base_url",
    "embedding_model",
    "recall_top_k",
    "rerank_base_url",
    "rerank_model",
    "result_limit",
  ]);
  assert.equal(DEFAULTS.dimensions, 1024);
  assert.equal(DEFAULTS.recall_top_k, 30);
  assert.equal(DEFAULTS.result_limit, 10);
  assert.ok(DEFAULTS.embedding_model.includes("Qwen"));
});

test("resolveDataDir 落在 dsh-vector-search 子目录", () => {
  assert.ok(resolveDataDir().endsWith("dsh-vector-search"));
});
