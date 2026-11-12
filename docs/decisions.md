# 决策记录

本文件是 dsh-vector-search 设计的**权威决策记录**。每条标状态：✅ 已定 / ❌ 否决 / ⏳ 推迟（附理由或触发条件）。

## ✅ 已定（设计）

- **数据模型**：`app`（命名空间）1—N `source` 1—N `entry`，`source` 0—1 `payload`；`(app, source, entry)` 唯一。
- **表结构**：两张（`source_entries`、`source_payloads`），无 `apps` / `sources` / `tags` 表。
- **存储**：`node:sqlite`（Node 内置，无原生依赖）；向量存 BLOB(float32)、写入时 L2 归一化。
- **DB 位置**：全局共享 `$DSH_HOME/dsh-vector-search/store.db`（跨 profile、跨项目）。用户已将 `$DSH_HOME` 设为系统变量、指向独立目录。
- **向量召回**：纯 JS 余弦相似度；每次 search 从 SQLite 现读该 app 的向量，**不维护内存缓存**；不用 SQLite 向量扩展、不做 ANN。
- **接口**：`set / get / delete / search` 四操作，全部显式带 `app`（不自动识别调用方身份）。`set` 合并原 add/update 为幂等 upsert；`get` 按 source 精确取回；`delete` 即原 remove。
- **语义**：`set` 不存在→新建、存在→全量替换（payload 缺省 = 清空、给值 = 覆盖）；`get` 不存在→返回 `null`（幂等，不报错）；`delete` 级联删两表、不存在则幂等成功。
- **撤销**：此前否决的 `get(source)` 只读，本次改为采纳（set 合并 add/update 后，精确取回与模糊检索互补，价值成立）。
- **检索**：embed → 余弦 Top-k → rerank → 按 source 去重留最高分 → 递补到 limit（凑不够就返回更少）。
- **结果**：`{source, entry, payload, rerank_score}`，score ∈ [0,1]，只返回 rerank 分数。
- **失败即报错**：外部服务挂 → 整体报错并指明环节；空语料报错；空 query（trim 后）返回空列表。
- **输入校验**：`query` / `entry` 先 trim 再判空（纯空白视作空）。
- **外部服务**：embedding / rerank 地址独立配置（互不依赖，可单独迁移）。
- **维度**：`dimensions` 配置（默认 1024）；embedding 请求显式带 `dimensions`，响应校验维度长度；范数为 0 / 含 NaN → 拒绝。
- **app 唯一性**：命名约定（分发时用包名前缀），不做注册表。

## ✅ 已定（实现）

- **实现语言**：TypeScript（`src/` → tsc 编译到 `lib/`，含 `.d.ts`）。
- **配置走 schemastery（正统）**：`export const Config = z.object({...})`，字段带 `.default()`；由设置界面 + config-editor 管理。字段 7 个：`embedding_base_url` / `rerank_base_url` / `embedding_model` / `rerank_model` / `dimensions` / `recall_top_k` / `result_limit`（**无 db_path、无 api_key**）。
- **API key 走 credentials ref + YAML 手动配置**：存 `credentials` 的 ref `siliconflow_api_key`；读取用 `credentials.resolve(ref)`；配置方式**仅**手动编辑 `$DSH_HOME/.credentials.yaml`。不写 config、不写环境变量、不把 key 当工具参数（避免 key 进会话）。
- **import DSH 自己的包是正当的**：schemastery 是 DSH 框架本体，import 理所应当；靠声明依赖解决 asar 解析（schemastery 的传递依赖 cosmokit / @standard-schema/spec 也需显式声明，因 pnpm 隔离布局 + Windows junction 解析问题）。
- **代码布局**：`src/` 按功能切分——`config.ts` / `vector.ts` / `validate.ts` / `storage.ts` / `embedding.ts` / `service.ts`（业务逻辑 + 结果格式化）/ `register.ts`（工具注册）/ `types.ts`（DSH 边界类型）。入口 `index.ts`（Config + apply + inject）。
- **工具命名**：前缀 `vs_`，四个工具 `vs_set / vs_get / vs_delete / vs_search`。
- **工具 output.schema 约束（宿主实测，见官方 dsh-tools）**：DSH 工具 schema 是受限 JSON Schema 子集——`type` 只能是单个字符串（`object/array/string/number/integer/boolean/null`），**不支持 type 数组**；组合只能 `oneOf`（≥2 分支、恰好命中一支），`oneOf` 节点上不能再写 `type`。可空输出（object | null）用 `oneOf: [{ type: "object", ... }, { type: "null" }]` 声明。
- **单元测试**：`test/` 目录 TS 单测 + Node 内置 `node:test`（Node 24 原生类型剥离，**无需 tsx**）；mock 外部依赖（`Embedder` 接口 + 注入 mock fetch）；命令 `node --test --test-isolation=none`。

## ❌ 否决（决定不做，附理由）

| 项 | 理由 |
|---|---|
| SQLite 向量扩展（vec0 / "Vec1"） | 原生扩展加载不可靠；纯 JS 余弦足够 |
| rerank 失败静默降级 | 结果已不可靠，直接报错让用户感知 |
| `stats` 工具 | 非核心职责 |
| `list`（sources / apps） | 非核心职责 |
| 空 source / 独立「建 app」操作 | 无意义 |
| 自动识别调用方身份 | fiber 异步不可靠、隐式难调试、agent 直调无解 |
| payload 放正文 / 全文 | 附加能力不替代原系统，插件不管 payload 内容 |
| API key 写 config / 环境变量 | 应走 credentials ref |
| API key 走 authorization 流（record） | 需客户端 UI 触发，纯 Host 插件断链；ref 更简 |
| **`vs_configure` 工具（key 当工具参数）** | **key 进会话/聊天历史，致命安全漏洞** |
| config.json 作「活配置」 | 被 schemastery Config 取代 |
| 把 cordis / schemastery 当「第三方依赖」回避 | 它们是 DSH 框架本体，import 理所应当 |

## ⏳ 推迟（v1 不做，附触发条件）

| 项 | 触发条件 |
|---|---|
| tag 机制（`source_tags` / `entry_tags` 表） | 需要按标签过滤 / 分区时 |
| batch / 并发嵌入 | 首轮建库达数万条、顺序耗时不可接受时 |
| embedding 缓存（text→vector，跳过重复嵌入） | 高频全量重嵌且成本 / 时间变得不可忽略时 |
| ANN（sqlite-vec vec0） | 语料达十万级以上、brute-force 召回变慢时 |
| min_score 阈值 | 实际运行积累召回质量数据后 |
| 结果返回 vector_score（调试） | 需要排查召回质量时 |
| app 注册表 / 碰撞检测 | 插件被广泛分发、命名碰撞真实发生时 |
| 结果分组展示「全部命中 entry」 | 消费方明确需要看到多情境命中时 |
| 更换 embedding 模型 / 全量重嵌迁移 | 切换模型时（必然触发全量重嵌） |
| 独立对外 HTTP 服务 | 出现非 DSH 的消费者时 |
| Service 暴露（cordis `Service` 类） | 素材库/错题本等插件需要「inject 我们」做插件间调用时 |
| 客户端授权 UI（settings.section 面板） | 需要「点界面配 key」而非手改 YAML 时 |

## 🔧 环境 / 运维备忘

- `node:sqlite` 在目标 Electron 运行时可用（已激活验证）。
- 工作区 `D:\dev\dsh-vector-search` 曾缺 WRITE_OWNER 导致沙箱无法跑 shell；已用诊断脚本补全当前用户完全控制权（备份在 `D:\dev\.acl-recovery\`）。
- 沙箱默认模式对工作区**只读**；跑 shell 写/删文件需 `danger-full-access` 一次性授权。
- 沙箱禁「管道 spawn 子进程」，跑测试须加 `--test-isolation=none`。
- 跑测试：`node --test --test-isolation=none`（Node 24 原生剥离 TS 类型，无需 tsx；tsx 曾试装失败且弄坏 node_modules，已弃用）。
