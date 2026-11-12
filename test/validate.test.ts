import { test } from "node:test";
import assert from "node:assert/strict";
import { assertApp, assertSource, normalizeEntries, normalizeMinScore } from "../lib/validate.js";

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

test("normalizeMinScore 数字 clamp 到 [0,1]", () => {
  assert.equal(normalizeMinScore(0.5, 0.5), 0.5);
  assert.equal(normalizeMinScore(1.5, 0.5), 1);
  assert.equal(normalizeMinScore(-1, 0.5), 0);
  assert.equal(normalizeMinScore(0, 0.5), 0);
  assert.equal(normalizeMinScore(1, 0.5), 1);
});

test("normalizeMinScore 非数字 / NaN / undefined 回退 fallback", () => {
  assert.equal(normalizeMinScore(undefined, 0.5), 0.5);
  assert.equal(normalizeMinScore(NaN, 0.5), 0.5);
  assert.equal(normalizeMinScore(Infinity, 0.5), 0.5);
  assert.equal(normalizeMinScore("oops", 0.5), 0.5);
  assert.equal(normalizeMinScore(null, 0.7), 0.7);
});
