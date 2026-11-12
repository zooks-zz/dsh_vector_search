// 向量运算：float32 小端字节序、L2 归一化、点积（归一化后等价于余弦）。纯函数。

export function bytesToF32(bytes: Uint8Array): Float32Array {
  const b = new Uint8Array(bytes);
  const n = b.length / 4;
  const out = new Float32Array(n);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 0; i < n; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

export function f32ToBytes(f32: Float32Array): Uint8Array {
  const bytes = new Uint8Array(f32.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < f32.length; i++) view.setFloat32(i * 4, f32[i], true);
  return bytes;
}

// L2 归一化；范数为 0 或含 NaN/Infinity 时抛错（防御非法 embedding）。
export function l2normalize(f32: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < f32.length; i++) {
    const v = f32[i];
    if (!Number.isFinite(v)) throw new Error("向量含 NaN 或 Infinity");
    sum += v * v;
  }
  const norm = Math.sqrt(sum);
  if (norm === 0) throw new Error("向量范数为 0，无法归一化");
  const out = new Float32Array(f32.length);
  for (let i = 0; i < f32.length; i++) out[i] = f32[i] / norm;
  return out;
}

// 点积。两向量已 L2 归一化时，点积 = 余弦相似度。
export function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error("向量维度不一致");
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
