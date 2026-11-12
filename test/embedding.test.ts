import { test } from "node:test";
import assert from "node:assert/strict";
import { EmbeddingClient } from "../lib/embedding.js";
import type { VectorSearchConfig } from "../lib/config.js";

const cfg: VectorSearchConfig = {
  embedding_base_url: "https://example.com/v1",
  rerank_base_url: "https://example.com/v1",
  embedding_model: "m-embed",
  rerank_model: "m-rerank",
  dimensions: 3,
  recall_top_k: 30,
  result_limit: 10,
};

type MockBody = { ok: boolean; status?: number; json(): Promise<unknown> };

function mockFetch(handler: (url: string, init: RequestInit) => MockBody) {
  return async (url: string, init: RequestInit) => handler(url, init);
}

function json(body: unknown): MockBody {
  return { ok: true, json: async () => body };
}

test("embed 解析并校验维度", async () => {
  const client = new EmbeddingClient(cfg, async () => "key", mockFetch(async (url, init) => {
    assert.equal(url, "https://example.com/v1/embeddings");
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer key");
    const body = JSON.parse(init.body as string) as { model: string; dimensions: number };
    assert.equal(body.model, "m-embed");
    assert.equal(body.dimensions, 3);
    return json({ data: [{ embedding: [1, 2, 3] }] });
  }));
  const vec = await client.embed("你好");
  assert.ok(vec instanceof Float32Array);
  assert.equal(vec.length, 3);
  assert.equal(vec[1], 2);
});

test("embed 维度不符抛错", async () => {
  const client = new EmbeddingClient(cfg, async () => "key", mockFetch(async () =>
    json({ data: [{ embedding: [1, 2] }] })
  ));
  await assert.rejects(() => client.embed("x"), /维度不符/);
});

test("embed 含 NaN 抛错", async () => {
  const client = new EmbeddingClient(cfg, async () => "key", mockFetch(async () =>
    json({ data: [{ embedding: [1, NaN, 3] }] })
  ));
  await assert.rejects(() => client.embed("x"), /NaN/);
});

test("embed 响应缺少 embedding 抛错", async () => {
  const client = new EmbeddingClient(cfg, async () => "key", mockFetch(async () => json({ data: [{}] })));
  await assert.rejects(() => client.embed("x"), /缺少 embedding/);
});

test("rerank 按 index 回填分数", async () => {
  const client = new EmbeddingClient(cfg, async () => "key", mockFetch(async (url) => {
    assert.equal(url, "https://example.com/v1/rerank");
    return json({ results: [{ index: 1, relevance_score: 0.9 }, { index: 0, relevance_score: 0.5 }] });
  }));
  const scores = await client.rerank("q", ["a", "b"]);
  assert.deepEqual(scores, [0.5, 0.9]);
});

test("rerank 缺字段按 0 处理", async () => {
  const client = new EmbeddingClient(cfg, async () => "key", mockFetch(async () =>
    json({ results: [{ index: 0, relevance_score: "oops" }] })
  ));
  assert.deepEqual(await client.rerank("q", ["a"]), [0]);
});

test("HTTP 非 2xx 抛错", async () => {
  const client = new EmbeddingClient(cfg, async () => "key", mockFetch(async () =>
    ({ ok: false, status: 500, json: async () => ({}) })
  ));
  await assert.rejects(() => client.embed("x"), /HTTP 500/);
});
