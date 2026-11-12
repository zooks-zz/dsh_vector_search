# dsh-vector-search

DSH 宿主插件：**通用语义检索存储**。

给「一堆记录」加一个「按模糊意图语义找回」的能力——「我大概记得要找什么、但记不住确切表述」，就能把它找回来。

它不绑定任何业务，只负责三件事：**持久化、向量生成、语义检索**。素材库、错题本等业务是另外的插件，依赖本插件工作。

## 外部依赖

本插件依赖以下外部服务/能力，缺一不可：

| 依赖 | 用途 | 不满足的后果 |
|---|---|---|
| **SiliconFlow embedding 服务**（`Qwen/Qwen3-Embedding-0.6B`） | 给 entry 和查询文本生成 1024 维向量 | 无法写入/检索（`vs_set`/`vs_search` 报错） |
| **SiliconFlow reranker 服务**（`Qwen/Qwen3-Reranker-0.6B`） | 对向量召回结果精排 | 无法检索（`vs_search` 报错） |
| **DSH credentials 存储**（`$DSH_HOME/.credentials.yaml`） | 安全存放 SiliconFlow API key | 无 key 无法调用上面两个服务 |
| **Node.js ≥ 22.6**（内置 `node:sqlite` + TS 类型剥离） | 持久化（SQLite）+ 跑 TS 测试 | 插件无法运行 / 测试跑不了 |

> npm 依赖：`schemastery` 用于声明配置 schema；`cosmokit`、`@standard-schema/spec` 是它的传递依赖（因 pnpm 隔离布局在 Windows 的解析限制，需显式声明）；`typescript`、`@types/node` 是编译期依赖。

## 构建与测试

```bash
pnpm install   # 装依赖
pnpm build     # tsc 编译 src/ → lib/
pnpm test      # node --test 跑 test/ 下的 TS 用例（42 个）
```

> `lib/` 是编译产物，已 gitignore；clone 后需先 `pnpm build`，插件才能加载。

## 配置

### ① API key（唯一不在插件配置里的项）

存 DSH 的 **credentials**，手动编辑 `$DSH_HOME/.credentials.yaml`：

```yaml
version: 1
refs:
  siliconflow_api_key: sk-xxxx
```

### ② 其余配置字段（走插件配置）

以下字段在 DSH 的**插件配置**里改（Plugin Manager 找到「向量检索」→ 编辑配置；或直接改 profile 的 `cordis.patch.yml`）：

| 字段 | 默认 | 说明 |
|---|---|---|
| `embedding_base_url` | `https://api.siliconflow.cn/v1` | embedding 服务地址 |
| `rerank_base_url` | `https://api.siliconflow.cn/v1` | reranker 服务地址 |
| `embedding_model` | `Qwen/Qwen3-Embedding-0.6B` | 向量模型 |
| `rerank_model` | `Qwen/Qwen3-Reranker-0.6B` | 精排模型 |
| `dimensions` | `1024` | 向量维度 |
| `recall_top_k` | `30` | 向量召回条数 |
| `result_limit` | `10` | 精排后返回条数 |
| `min_score` | `0.5` | rerank 分数阈值，低于该值的命中被过滤（可被 `search(min_score)` 覆盖，取值截断到 [0,1]） |

DB 位置固定 `$DSH_HOME/dsh-vector-search/store.db`，不开放配置。

`cordis.patch.yml` 覆盖示例（改返回条数和维度）：

```yaml
- insert:
    - id: dsh-vector-search
      name: '@local/dsh-vector-search'
      config:
        result_limit: 20
        dimensions: 512
```

## 快速开始（粘贴到会话执行）

配好 key 后，把下面的话**整段复制粘贴到会话**，agent 会执行对应工具：

**① 存一条素材：**

```
用 vs_set 工具，参数：app="materials"、source="素材001"、entries=["深夜赶稿的场景","加班压力下的坚持"]、payload={"title":"关于加班的小说素材"}
```

**② 语义检索：**

```
用 vs_search 工具，参数：app="materials"、query="想找深夜加班的场景"
```

**③ 预期返回**：`source=素材001`、命中的 `entry`、展开的 `payload`、`rerank_score`（0~1 之间）。

## 使用（4 个工具）

| 工具 | 说明 |
|---|---|
| `vs_set(app, source, entries[], payload?)` | 写入 source（upsert：不存在新建、存在全量替换；payload 缺省清空） |
| `vs_get(app, source)` | 读取 source 完整记录（entries + payload）；不存在返回 null |
| `vs_delete(app, source)` | 删除 source（级联；不存在幂等成功） |
| `vs_search(app, query, limit?, min_score?, top_k?)` | 语义检索（低于 min_score 的命中被过滤，去重后按 rerank 分降序） |

## 目录结构

```
src/     TS 源码（config / vector / validate / storage / embedding / service / register / types + index）
lib/     tsc 编译产物（.js + .d.ts，插件入口；gitignored）
test/    TS 单测（42 用例，mock 外部依赖）
docs/    PRD + 决策记录
locale/  中英文标题描述
```

## 文档

- [PRD / 设计规格](docs/PRD.md)
- [决策记录](docs/decisions.md)
