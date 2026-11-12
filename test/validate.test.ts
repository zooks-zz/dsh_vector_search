import { test } from "node:test";
import assert from "node:assert/strict";
import { assertApp, assertSource, normalizeEntries } from "../lib/validate.js";

test("assertApp 校验并 trim", () => {
  assert.equal(assertApp("  materials  "), "materials");
  assert.throws(() => assertApp(""), /不能为空/);
  assert.throws(() => assertApp("   "), /不能为空/);
  assert.throws(() => assertApp("x".repeat(65)), /长度/);
  assert.throws(() => assertApp(42), /不能为空/);
});

test("assertSource 校验并 trim", () => {
  assert.equal(assertSource(" src "), "src");
  assert.throws(() => assertSource(""), /不能为空/);
  assert.throws(() => assertSource("y".repeat(513)), /长度/);
});

test("normalizeEntries 校验并 trim", () => {
  assert.deepEqual(normalizeEntries([" a ", "b"]), ["a", "b"]);
  assert.throws(() => normalizeEntries([]), /非空数组/);
  assert.throws(() => normalizeEntries("not-array"), /非空数组/);
  assert.throws(() => normalizeEntries(["   "]), /不能为空/);
  assert.throws(() => normalizeEntries([42]), /字符串/);
  assert.throws(() => normalizeEntries(["z".repeat(513)]), /长度/);
});
