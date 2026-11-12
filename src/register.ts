import type { DshContext, TextContentBlock } from "./types.js";
import { formatSearchResults, type VectorSearchService } from "./service.js";

// SiliconFlow API key 在 credentials 里的 ref 名（credentials 存的是简单 key=value）。
export const API_KEY_REF = "siliconflow_api_key";

export function registerTools(ctx: DshContext, service: VectorSearchService): void {
  const text = (s: string): TextContentBlock[] => [{ type: "text", text: s }];
  const ack = {
    type: "object",
    properties: { app: { type: "string" }, source: { type: "string" } },
    required: ["app", "source"],
  };

  ctx.tools.register({
    name: "vs_add",
    description:
      "在 app 下新建一条 source（记录），带多个 entry（入口/检索描述，如门牌号、电话、微信）和可选 payload（附加数据）。source 已存在则报错。每条 entry 生成向量后一次性写入；任一 embedding 失败则整次拒绝、不写入。",
    parameters: {
      type: "object",
      properties: {
        app: { type: "string", description: "应用命名空间（区分不同业务的数据，如 materials / wrongbook）" },
        source: { type: "string", description: "记录的唯一标识（app 内唯一）" },
        entries: { type: "array", items: { type: "string" }, description: "入口描述列表，至少一条" },
        payload: { description: "可选附加数据（JSON），不参与检索" },
      },
      required: ["app", "source", "entries"],
    },
    output: {
      schema: ack,
      render: (_a, v) => text(`已创建 source: ${(v as { source: string; app: string }).source}（app: ${(v as { app: string }).app}）`),
    },
    async execute(args) {
      return service.add(args.app, args.source, args.entries, args.payload);
    },
  });

  ctx.tools.register({
    name: "vs_update",
    description:
      "全量替换 app 下某 source 的 entries 与 payload。source 不存在则报错。payload 缺省 = 清空，给值 = 覆盖。",
    parameters: {
      type: "object",
      properties: {
        app: { type: "string", description: "应用命名空间" },
        source: { type: "string", description: "记录的唯一标识" },
        entries: { type: "array", items: { type: "string" }, description: "新的入口描述列表" },
        payload: { description: "可选；缺省清空，给值覆盖" },
      },
      required: ["app", "source", "entries"],
    },
    output: {
      schema: ack,
      render: (_a, v) => text(`已更新 source: ${(v as { source: string; app: string }).source}（app: ${(v as { app: string }).app}）`),
    },
    async execute(args) {
      return service.update(args.app, args.source, args.entries, args.payload);
    },
  });

  ctx.tools.register({
    name: "vs_remove",
    description: "删除 app 下某 source（级联删除其 entries 与 payload）。不存在则幂等成功。",
    parameters: {
      type: "object",
      properties: {
        app: { type: "string", description: "应用命名空间" },
        source: { type: "string", description: "记录的唯一标识" },
      },
      required: ["app", "source"],
    },
    output: {
      schema: ack,
      render: (_a, v) => text(`已删除 source: ${(v as { source: string; app: string }).source}（app: ${(v as { app: string }).app}）`),
    },
    async execute(args) {
      return service.remove(args.app, args.source);
    },
  });

  ctx.tools.register({
    name: "vs_search",
    description:
      "在 app 内按 query 语义检索，返回相关 source（去重后按 rerank 分数降序）。空 query 返回空结果；库为空报错。",
    parameters: {
      type: "object",
      properties: {
        app: { type: "string", description: "应用命名空间" },
        query: { type: "string", description: "自然语言查询" },
        limit: { type: "integer", description: "返回条数（默认 10）" },
        top_k: { type: "integer", description: "向量召回条数（默认 30）" },
      },
      required: ["app", "query"],
    },
    output: {
      schema: {
        type: "object",
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source: { type: "string" },
                entry: { type: "string" },
                payload: { type: "object" },
                rerank_score: { type: "number" },
              },
              required: ["source", "entry", "rerank_score"],
            },
          },
        },
        required: ["results"],
      },
      render: (_a, v) => text(formatSearchResults((v as { results: Parameters<typeof formatSearchResults>[0] }).results)),
    },
    async execute(args) {
      return service.search(args.app, args.query, args.limit, args.top_k);
    },
  });
}
