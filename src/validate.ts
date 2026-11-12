// 输入校验：app / source / entry。纯函数，抛中文错误信息。

export const LIMITS = Object.freeze({ app: 64, source: 512, entry: 512 });

export function assertApp(app: unknown): string {
  if (typeof app !== "string" || app.trim().length === 0) throw new Error("参数非法：app 不能为空");
  if (app.length > LIMITS.app) throw new Error(`参数非法：app 长度不能超过 ${LIMITS.app}`);
  return app.trim();
}

export function assertSource(source: unknown): string {
  if (typeof source !== "string" || source.trim().length === 0) throw new Error("参数非法：source 不能为空");
  if (source.length > LIMITS.source) throw new Error(`参数非法：source 长度不能超过 ${LIMITS.source}`);
  return source.trim();
}

export function normalizeEntries(entries: unknown): string[] {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("参数非法：entries 必须是非空数组");
  const list: string[] = [];
  for (const e of entries) {
    if (typeof e !== "string") throw new Error("参数非法：entry 必须是字符串");
    const t = e.trim();
    if (t.length === 0) throw new Error("参数非法：entry 不能为空");
    if (t.length > LIMITS.entry) throw new Error(`参数非法：entry 长度不能超过 ${LIMITS.entry}`);
    list.push(t);
  }
  return list;
}
