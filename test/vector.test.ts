import { test } from "node:test";
import assert from "node:assert/strict";
import { bytesToF32, f32ToBytes, l2normalize, dot } from "../lib/vector.js";

function approx(a: number, b: number, eps = 1e-6): void {
  assert.ok(Math.abs(a - b) < eps, `${a} 应约等于 ${b}`);
}

test("f32ToBytes / bytesToF32 往返一致", () => {
  const src = new Float32Array([1.5, -2.25, 0, 3.75]);
  const out = bytesToF32(f32ToBytes(src));
  assert.equal(out.length, src.length);
  for (let i = 0; i < src.length; i++) assert.equal(out[i], src[i]);
});

test("l2normalize 使范数为 1", () => {
  const n = l2normalize(new Float32Array([3, 4]));
  approx(n[0], 0.6);
  approx(n[1], 0.8);
});

test("l2normalize 对零向量抛错", () => {
  assert.throws(() => l2normalize(new Float32Array([0, 0, 0])), /范数为 0/);
});

test("l2normalize 对 NaN 抛错", () => {
  assert.throws(() => l2normalize(new Float32Array([NaN, 1])), /NaN/);
});

test("l2normalize 对 Infinity 抛错", () => {
  assert.throws(() => l2normalize(new Float32Array([Infinity, 1])), /Infinity/);
});

test("dot 计算正确", () => {
  assert.equal(dot(new Float32Array([1, 0]), new Float32Array([0, 1])), 0);
  assert.equal(dot(new Float32Array([1, 0]), new Float32Array([1, 0])), 1);
  assert.equal(dot(new Float32Array([1, 2, 3]), new Float32Array([4, 5, 6])), 32);
});

test("dot 维度不一致抛错", () => {
  assert.throws(() => dot(new Float32Array([1]), new Float32Array([1, 2])), /维度不一致/);
});
