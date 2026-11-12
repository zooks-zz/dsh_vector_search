# 决策记录

本文件是 dsh-vector-search 设计的**权威决策记录**。每条标状态：✅ 已定 / ❌ 否决 / ⏳ 推迟（附理由或触发条件）。

---

## ✅ 已定

- **数据模型**：`app`（命名空间）1—N `source` 1—N `entry`，`source` 0—1 `payload`；`(app, source, entry)` 唯一。
- **表结构**：两张（`source_entries`、`source_payloads`），无 `apps` / `sources` / `tags` 表。
- **存储**：`node:sqlite`（Node 内置，无原生依赖）；向量存 BLOB(float32)、写入时 L2 归一化。
- **DB 位置**：全局共享 `$DSH_HOME/dsh-vector-search/store.db`（跨 profile、跨项目），`db_path` 可覆盖。
- **向量召回**：纯 JS 余弦相似度，不做 ANN、不用 SQLite 向量扩展。
- **接口**：`add / update / remove / search` 四操作，全部显式带 `app`（不自动识别调用方身份）。
- **语义**：`add` 重复 source → 报错；`update` 全量替换、payload 缺省 = 清空；`remove` 级联删两表、不存在则幂等成功。
- **检索**：embed → 余弦 Top-k → rerank → 按 source 去重留最高分 → 递补到 limit。
- **结果**：`{source, entry, payload, rerank_score}`，score ∈ [0,1]，只返回 rerank 分数。
- **失败即报错**：外部服务挂 → 整体报错并指明环节；空语料报错；空 query 返回空列表。
- **API key**：存 `credentials` 服务。
- **外部服务**：embedding / rerank 地址独立配置（互不依赖，可单独迁移）。
- **维度**：`dimensions` 配置（默认 1024），写入时校验向量长度。
- **暴露方式**：Service（default export）+ `vs_*` 工具薄封装。
- **app 唯一性**：命名约定（分发时用包名前缀），不做注册表。

## ❌ 否决（附理由）

| 项 | 理由 |
|---|---|
| SQLite 向量扩展（vec0 / "Vec1"） | 原生扩展加载不可靠；纯 JS 余弦足够 |
| batch 批量嵌入 | 规模小、成本可忽略（约 ¥0.03 / 万条） |
| 并发嵌入 | 同上；写库串行即可 |
| embedding 缓存 | 成本可忽略；省时间只在罕见全量重建时 |
| tag 机制（v1） | 后续版本再加 |
| ANN / 向量索引 | 万级量级 brute-force 足够 |
| rerank 失败静默降级 | 结果已不可靠，直接报错让用户感知 |
| min_score 阈值 | 需实际运行数据再定 |
| 结果里返回 vector_score | 调试信息，对用户无价值 |
| `stats` 工具 | 非核心职责 |
| `list`（sources / apps） | 非核心职责 |
| 空 source / 独立「建 app」操作 | 无意义 |
| `get(source)` 只读 | 非核心职责；add 已对重复报错 |
| app 注册表 / apps 表 | 缺调用方身份无法真正防冲突；唯一命名已够 |
| 自动识别调用方身份 | fiber 在异步中不可靠、隐式难调试、agent 直调无解 |
| payload 放正文 / 全文 | 附加能力不替代原系统，插件不管 payload 内容 |
| 独立对外 HTTP 服务 | 消费者全是 DSH 内插件，进程内 Service 更简单 |

## ⏳ 推迟（附触发条件）

| 项 | 触发条件 |
|---|---|
| tag 机制（`source_tags` / `entry_tags` 表） | 需要按标签过滤 / 分区时 |
| batch / 并发嵌入 | 首轮建库达数万条、顺序耗时不可接受时 |
| embedding 缓存 | 高频全量重嵌且成本 / 时间变得不可忽略时 |
| ANN（sqlite-vec vec0） | 语料达十万级以上、brute-force 召回变慢时 |
| min_score 阈值 | 实际运行积累召回质量数据后 |
| 结果返回 vector_score（调试） | 需要排查召回质量时 |
| app 注册表 / 碰撞检测 | 插件被广泛分发、命名碰撞真实发生时 |
| 结果分组展示「全部命中 entry」 | 消费方明确需要看到多情境命中时 |
| 更换 embedding 模型 / 全量重嵌迁移 | 切换模型时（必然触发全量重嵌） |
| 独立对外 HTTP 服务 | 出现非 DSH 的消费者时 |
