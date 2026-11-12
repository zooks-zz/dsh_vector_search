# dsh-vector-search 设计规格（PRD）

## 1. 定位

dsh-vector-search 是一个 **DSH 宿主插件**，提供**通用语义检索存储**这一基础设施能力：

> 给「一堆记录」加一个「按模糊意图语义找回」的能力。

它不绑定任何业务类型，只负责三件事：**持久化、向量生成、语义检索**。素材库、错题本等业务是**另外的插件**，它们依赖本插件工作（通过 Service 调用）。

核心职责一句话：**搜索**。除此之外不做任何业务。

## 2. 术语

| 术语 | 含义 |
|---|---|
| `app` | 应用命名空间（字符串，必填）。区分不同消费插件的数据，互不串扰。由消费插件持有并固定传入。 |
| `source` | 一条记录的**唯一标识**（app 内唯一），是**你想找的那个目标**——像一个人或一栋房子。典型：素材库的 md 路径、错题本的题目 id。opaque，插件不关心它是什么。 |
| `entry` | **入口**——一条能触达 source 的检索描述。一个 source 可有多个 entry（一个素材多个情境、一道题多个归类），就像一个人有门牌号、电话、微信等多个联系方式，任意一个都能找到 ta。每个 entry 独立生成向量。 |
| `vector` | entry 的 embedding 向量（float32、1024 维、L2 归一化后存为 BLOB）。 |
| `payload` | source 级附加数据（opaque JSON，可选，不参与向量生成）。典型：指向原系统记录的引用 / 链接。 |

关系：`app` 1—N `source`，`source` 1—N `entry`，`source` 0—1 `payload`。`(app, source, entry)` 组合唯一。

## 3. 数据模型

本地 SQLite（`node:sqlite`），两张表：

```sql
CREATE TABLE source_entries (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,  -- 内部行定位，对外不可见
  app     TEXT NOT NULL,
  source  TEXT NOT NULL,
  entry   TEXT NOT NULL,
  vector  BLOB NOT NULL,                       -- float32 小端，dim*4 字节，L2 归一化
  UNIQUE(app, source, entry)
);
CREATE INDEX idx_entries_app ON source_entries(app);

CREATE TABLE source_payloads (
  app     TEXT NOT NULL,
  source  TEXT NOT NULL,
  payload TEXT NOT NULL,                        -- JSON 字符串（写入时校验合法）
  PRIMARY KEY (app, source)
);
```

- **向量**：BLOB，float32 小端，长度 = `dimensions` × 4；写入时 L2 归一化；维度与 `dimensions` 不符即拒绝。
- **payload**：TEXT（JSON 字符串），写入时校验合法 JSON；opaque，内容与大小由调用方决定，插件不解读。
- **删除 source** = 同一事务内 `DELETE` 两表对应行（级联）。
- 无 `apps` 表、无 `sources` 表、无 `tags` 表。

## 4. 存储与向量计算

- **持久层**：`node:sqlite`（Node 内置，无原生依赖）。全局共享一个 DB 文件，默认 `$DSH_HOME/dsh-vector-search/store.db`（跨 profile、跨项目），可由 `db_path` 配置覆盖。
- **向量召回**：**纯 JS 余弦相似度**。实现为内存索引（启动载入、写后刷新）或按需读取，二者对外等价。**不使用** SQLite 向量扩展（vec0）、不做 ANN——本地知识库量级（万级 1024 维）在数十毫秒内。
- **写并发**：单连接 + 写队列，一个写操作完整结束再开始下一个；「embed → 写库」在同一逻辑单元内原子完成。

## 5. 接口

### 5.1 Service（default export，供其他插件进程内调用）

```
add(app, source, entries, payload?)    → { app, source }
update(app, source, entries, payload?) → { app, source }
remove(app, source)                    → { app, source }
search(app, query, limit?, top_k?)     → SearchResult[]
```

### 5.2 Agent 工具（Service 的薄封装）

前缀 `vs_`（提案，可改）：

| 工具 | 参数 | 说明 |
|---|---|---|
| `vs_add` | `app, source, entries[], payload?` | 新建 source |
| `vs_update` | `app, source, entries[], payload?` | 全量替换 source 的 entries + payload |
| `vs_remove` | `app, source` | 删除 source（级联两表） |
| `vs_search` | `app, query, limit?, top_k?` | 语义检索 |

### 5.3 写接口语义

- `add`：`(app, source)` 已存在 → 报错。`entries` 非空、每项非空。逐条生成向量，**全部成功后一次性写入**；任一条 embedding 失败 → 整次拒绝、不写入任何数据。`payload` 可选。
- `update`：`(app, source)` 不存在 → 报错。**全量替换**——用新的 `entries` 替换旧的、重嵌全部 entry。`payload` 缺省 = **清空**；给值 = 覆盖。
- `remove`：级联删除两表；`(app, source)` 不存在 → **幂等成功（无操作）**，不报错。

### 5.4 search 流程

1. 校验：`query` 为空 → 返回**空列表**（不报错）；`app` 下无任何 entry（空语料）→ **报错「库为空」**。
2. 生成 query 向量（embedding）。
3. 在 `app` 范围内做余弦相似度，取 Top-`top_k`（默认 30）。
4. 把 Top-`top_k` 条 entry 交给 reranker 精排，得 rerank 分数。
5. 按 rerank_score 降序，**按 source 去重、只留最高分那条 entry**，向下递补凑到 `limit`（默认 10）条，凑不够就返回更少。
6. 返回 `SearchResult[]`。

### 5.5 SearchResult

```ts
interface SearchResult {
  source: string;          // 命中记录的标识
  entry: string;           // 命中的那条 entry（该 source 下 rerank 分最高者）
  payload: object | null;  // source 的 payload（展开；无则 null）
  rerank_score: number;    // [0,1]，越大越相关
}
```

- 只返回 `rerank_score`，不返回向量余弦分数（调试信息，不进结果）。

## 6. 外部服务

- **Embedding**：SiliconFlow `Qwen/Qwen3-Embedding-0.6B`，1024 维。
- **Reranker**：SiliconFlow `Qwen/Qwen3-Reranker-0.6B`。
- 两个服务**地址独立配置**（`embedding_base_url` / `rerank_base_url`），互不依赖，可单独迁移。
- 任一外部服务失败 → **整体报错**（不做静默降级），报错中指明是 embedding 还是 reranker 挂的。

## 7. 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `embedding_base_url` | `https://api.siliconflow.cn/v1` | 独立 |
| `rerank_base_url` | `https://api.siliconflow.cn/v1` | 独立 |
| `embedding_model` | `Qwen/Qwen3-Embedding-0.6B` | |
| `rerank_model` | `Qwen/Qwen3-Reranker-0.6B` | |
| `dimensions` | `1024` | 按接口文档设，写入时校验向量长度 |
| `recall_top_k` | `30` | 可被 `search(top_k)` 覆盖 |
| `result_limit` | `10` | 可被 `search(limit)` 覆盖 |
| `db_path` | `$DSH_HOME/dsh-vector-search/store.db` | 可覆盖 |

- **API key 不在此表**：存 `credentials` 服务（`inject: ['credentials']`）。
- 校验常量（非配置，硬编码）：`app` / `source` / `entry` 长度上限（建议值：app ≤ 64、source ≤ 512、entry ≤ 512，具体实现时定）。

## 8. 错误码

| 错误 | 触发 |
|---|---|
| `参数非法` | app / source / entry 为空或超长；payload 非合法 JSON |
| `source 已存在` | add 时 (app, source) 已存在 |
| `source 不存在` | update 时 (app, source) 不存在 |
| `库为空` | search 时 app 下无任何 entry |
| `未配置 API key` | credentials 中无 key |
| `embedding 服务不可用` | embedding 请求失败 / 超时 |
| `rerank 服务不可用` | rerank 请求失败 / 超时 |

「无结果」不是错误——search 返回空列表。

## 9. 并发与一致性

- SQLite 单连接，写操作串行化（写队列）。
- 每个写操作（add / update / remove）是原子事务。
- embed → 写库在同一逻辑单元内：向量全部生成成功才落库。

## 10. 测试策略

- embedder / reranker 定义为接口，测试用 **mock**，离线确定性单测。
- 真机只做 SiliconFlow 集成冒烟。
- CRUD / 检索（含去重、递补、边界）用确定性用例。

## 11. 非目标（v1 明确不做）

batch 批量嵌入、并发嵌入、embedding 缓存、tag 机制、ANN、min_score 阈值、vector_score 返回、stats、list、空 source、`get(source)` 只读、app 注册表、独立对外 HTTP 服务。详见 [决策记录](decisions.md)。
