import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../lib/storage.js";
import { VectorSearchService, type Embedder } from "../lib/service.js";

// 确定性 mock embedding：文本 → 3 维向量（简单 hash），rerank 按文档顺序给递减分。
function makeEmbedding(): Embedder {
  return {
    async embed(text) {
      let h = 0;
      for (const c of String(text)) h = (h * 31 + c.codePointAt(0)!) % 997;
      return new Float32Array([(h % 7) / 7, ((h >> 3) % 7) / 7, ((h >> 6) % 7) / 7 + 0.001]);
    },
    async rerank(_query, docs) {
      return docs.map((_, i) => (docs.length - i) / docs.length);
    },
  };
}

function setup(): { svc: VectorSearchService; storage: Storage; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "vsvc-"));
  const storage = new Storage(join(dir, "store.db"));
  const svc = new VectorSearchService(storage, makeEmbedding(), { recall_top_k: 30, result_limit: 10 });
  return { svc, storage, dir };
}

test("set 后能 search 到，payload 带回", async () => {
  const { svc, storage, dir } = setup();
  await svc.set("materials", "m1", ["深夜赶稿"], { title: "素材一" });
  const { results } = await svc.search("materials", "查询词");
  assert.equal(results.length, 1);
  assert.equal(results[0].source, "m1");
  assert.equal(results[0].entry, "深夜赶稿");
  assert.deepEqual(results[0].payload, { title: "素材一" });
  assert.ok(results[0].rerank_score >= 0 && results[0].rerank_score <= 1);
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

test("set 对已存在 source 全量替换（upsert），payload 缺省清空", async () => {
  const { svc, storage, dir } = setup();
  await svc.set("app", "s", ["旧入口"], { keep: true });
  await svc.set("app", "s", ["新入口"]); // 不带 payload → 清空
  const got = svc.get("app", "s");
  assert.deepEqual(got?.entries, ["新入口"]);
  assert.equal(got?.payload, null);
  const { results } = await svc.search("app", "查询词");
  assert.equal(results.length, 1);
  assert.equal(results[0].entry, "新入口");
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

test("set 对不存在的 source 直接新建", async () => {
  const { svc, storage, dir } = setup();
  await svc.set("app", "s", ["x"], { a: 1 });
  const got = svc.get("app", "s");
  assert.deepEqual(got?.entries, ["x"]);
  assert.deepEqual(got?.payload, { a: 1 });
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

test("get 返回完整记录（entries 按写入顺序 + payload）", async () => {
  const { svc, storage, dir } = setup();
  await svc.set("app", "s", ["入口一", "入口二"], { title: "t" });
  const got = svc.get("app", "s");
  assert.deepEqual(got, { app: "app", source: "s", entries: ["入口一", "入口二"], payload: { title: "t" } });
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

test("get 不存在的 source 返回 null", () => {
  const { svc, storage, dir } = setup();
  assert.equal(svc.get("app", "nope"), null);
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

test("delete 幂等", async () => {
  const { svc, storage, dir } = setup();
  await svc.set("app", "s", ["a"]);
  await svc.delete("app", "s");
  await svc.delete("app", "s"); // 再次删不报错
  assert.equal(svc.get("app", "s"), null);
  await assert.rejects(() => svc.search("app", "查询词"), /库为空/);
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

test("search 按 source 去重、只留最高 rerank 分", async () => {
  const { svc, storage, dir } = setup();
  await svc.set("app", "s1", ["深夜赶稿", "加班压力"]); // 同一 source 两个 entry
  const { results } = await svc.search("app", "查询词");
  assert.equal(results.length, 1); // 去重后只剩 s1 一条
  assert.equal(results[0].source, "s1");
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

test("search 结果受 limit 约束", async () => {
  const { svc, storage, dir } = setup();
  for (let i = 0; i < 5; i++) await svc.set("app", `s${i}`, [`入口${i}`]);
  const { results } = await svc.search("app", "查询词", 3);
  assert.equal(results.length, 3);
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

test("空 query 返回空列表", async () => {
  const { svc, storage, dir } = setup();
  await svc.set("app", "s", ["a"]);
  const { results } = await svc.search("app", "   ");
  assert.deepEqual(results, []);
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

test("空库报错", async () => {
  const { svc, storage, dir } = setup();
  await assert.rejects(() => svc.search("app", "查询词"), /库为空/);
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

test("app 之间数据隔离", async () => {
  const { svc, storage, dir } = setup();
  await svc.set("materials", "m1", ["素材入口"]);
  await assert.rejects(() => svc.search("wrongbook", "查询词"), /库为空/); // 另一个 app 是空的
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});
