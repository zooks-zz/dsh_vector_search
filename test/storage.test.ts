import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../lib/storage.js";

function makeStorage(): { storage: Storage; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "vstore-"));
  return { storage: new Storage(join(dir, "store.db")), dir };
}

function approx(a: number, b: number, eps = 1e-6): void {
  assert.ok(Math.abs(a - b) < eps, `${a} 应约等于 ${b}`);
}

test("insertEntry / loadEntries 往返一致", () => {
  const { storage, dir } = makeStorage();
  const v = new Float32Array([0.1, 0.2, 0.3]);
  storage.transaction(() => {
    storage.insertEntry("app", "s1", "入口一", v);
    storage.insertEntry("app", "s1", "入口二", v);
    storage.insertEntry("app", "s2", "入口三", v);
  });
  const rows = storage.loadEntries("app");
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((r) => r.source === "s1").length, 2);
  assert.equal(rows[0].entry, "入口一");
  assert.equal(rows[0].vector.length, 3);
  approx(rows[0].vector[0], 0.1);
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

test("sourceExists 判定", () => {
  const { storage, dir } = makeStorage();
  assert.equal(storage.sourceExists("app", "s1"), false);
  storage.transaction(() => storage.insertEntry("app", "s1", "e", new Float32Array([1])));
  assert.equal(storage.sourceExists("app", "s1"), true);
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

test("payload 增删查", () => {
  const { storage, dir } = makeStorage();
  storage.transaction(() => storage.upsertPayload("app", "s1", { title: "素材一" }));
  assert.deepEqual(storage.getPayload("app", "s1"), { title: "素材一" });
  storage.transaction(() => storage.deletePayload("app", "s1"));
  assert.equal(storage.getPayload("app", "s1"), null);
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

test("transaction 出错回滚", () => {
  const { storage, dir } = makeStorage();
  assert.throws(() =>
    storage.transaction(() => {
      storage.insertEntry("app", "s1", "e", new Float32Array([1]));
      throw new Error("boom");
    })
  );
  assert.equal(storage.sourceExists("app", "s1"), false);
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

test("loadEntries 按 app 隔离", () => {
  const { storage, dir } = makeStorage();
  storage.transaction(() => {
    storage.insertEntry("a", "s", "e", new Float32Array([1]));
    storage.insertEntry("b", "s", "e", new Float32Array([1]));
  });
  assert.equal(storage.loadEntries("a").length, 1);
  assert.equal(storage.loadEntries("b").length, 1);
  assert.equal(storage.loadEntries("c").length, 0);
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});
