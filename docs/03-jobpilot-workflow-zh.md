# JobPilot — 当前实现工作流

**最后更新：** 2026-07-11  
**配套文档：** `docs/superpowers/specs/2026-07-11-jobpilot-design.md`  
**另见：** 根目录 `README.md`（设置）、`docs/01-jobpilot-product-spec.md`（原始规格）

本文档描述当前运行中的应用程序实际做什么：用户流程、后端任务和时序图。当产品规格仍提及延期项目（如面试准备）时，这是*已实现行为*的事实来源。

---

## 1. 高层架构

```mermaid
flowchart LR
  subgraph Client
    UI[Next.js App Router UI]
  end

  subgraph Server["Next.js Route Handlers"]
    Auth[Auth + Profile APIs]
    ScoreAPI[Score / Postings APIs]
    AppAPI[Applications APIs]
    Cron[Cron: poll / score / digest]
  end

  subgraph Data
    SB[(Supabase Auth + Postgres + Storage)]
    LLM[OpenAI-compatible LLM]
    ATS[Greenhouse + Lever public APIs]
  end

  UI --> Auth
  UI --> ScoreAPI
  UI --> AppAPI
  Auth --> SB
  Auth --> LLM
  ScoreAPI --> SB
  ScoreAPI --> LLM
  AppAPI --> SB
  AppAPI --> LLM
  Cron --> ATS
  Cron --> SB
  Cron --> LLM
```

**模块（位于 `src/lib/`）：**

| 模块 | 职责 |
|---|---|
| `ingestion/` | 轮询 Greenhouse/Lever → upsert `jp_postings` |
| `scoring/` | LLM 适配分 → `jp_scores` |
| `tailoring/` | LLM 简历 / 求职信草稿 → `jp_applications` |
| `applications/` | 状态机 |
| `billing/` | 配额 + Mock Stripe |
| `notifications/` | 每周摘要 + Mock Email |
| `profile/` | 简历解析 / 偏好提取 |

---

## 2. 端到端产品工作流

```mermaid
flowchart TD
  A[魔法链接登录] --> B[上传简历]
  B --> C[LLM 提取简历 + 推荐偏好]
  C --> D[用户审核自动填充的字段]
  D --> E[保存偏好]
  E --> F[ATS 轮询器填充 postings 表]
  F --> G[立即评分 / Cron 评分]
  G --> H[匹配列表：分 ≥ 阈值]
  H --> I[定制 → 申请草稿]
  I --> J[生成定制简历 + 求职信]
  J --> K[审核 / 重新生成 / 标记为已投递]
  K --> L[Kanban 跟踪状态更新]
  L --> M[每周摘要 Cron]
```

---

## 3. 时序图

### 3.1 认证（魔法链接）

```mermaid
sequenceDiagram
  actor U as 用户
  participant FE as /login
  participant SB as Supabase Auth
  participant CB as /auth/callback

  U->>FE: 输入邮箱
  FE->>SB: signInWithOtp(email)
  SB-->>U: 魔法链接邮件
  U->>CB: 打开链接 (?code=…)
  CB->>SB: exchangeCodeForSession
  CB->>SB: 加载 profile
  alt 简历不完整
    CB-->>U: 重定向 /onboarding
  else 简历存在
    CB-->>U: 重定向 /matches
  end
```

### 3.2 上传简历 → 自动填充表单

```mermaid
sequenceDiagram
  actor U as 用户
  participant FE as Onboarding/Profile
  participant API as POST /api/profile/resume
  participant Store as Supabase Storage
  participant DB as profiles
  participant LLM as OpenAI-compatible LLM

  U->>FE: 选择 PDF/DOCX
  FE->>API: multipart 文件
  API->>Store: 上传 resumes/{userId}/file
  API->>LLM: 提取 JSON（简历 + 偏好）
  LLM-->>API: 结构化字段
  API->>DB: 更新 resume_parsed + preferences
  API-->>FE: 自动填充的有效载荷
  FE-->>U: 字段已填充（仅供审核）
```

无需重新上传即可重新提取：`POST /api/profile/resume/reparse` 下载存储的文件并运行相同的 LLM 路径。

### 3.3 职位发现（数据获取）

```mermaid
sequenceDiagram
  participant Cron as POST /api/cron/poll-ats
  participant Ing as ingestion/poll
  participant GH as Greenhouse API
  participant LV as Lever API
  participant DB as companies + postings

  Note over Cron: Authorization Bearer CRON_SECRET
  Cron->>Ing: pollCompanies(admin)
  Ing->>DB: 加载活跃公司
  loop 每个公司批次
    alt greenhouse
      Ing->>GH: GET /v1/boards/{slug}/jobs
      GH-->>Ing: jobs JSON
    else lever
      Ing->>LV: GET /v0/postings/{slug}
      LV-->>Ing: postings JSON
    end
    Ing->>DB: upsert postings (ats_source, external_id)
  end
  Ing-->>Cron: { polled, upserted, errors }
```

### 3.4 评分 → 匹配列表

```mermaid
sequenceDiagram
  actor U as 用户
  participant FE as /matches
  participant Run as POST /api/score/run
  participant Score as scoring/scorePair
  participant LLM as LLM
  participant DB as scores + postings
  participant List as GET /api/postings

  U->>FE: 立即评分
  FE->>Run: { limit: 20 }
  Run->>DB: 加载 profile + 未评分活跃 postings
  loop 最多 limit 次
    Run->>Score: scorePair(profile, posting)
    Score->>LLM: fit JSON
    LLM-->>Score: score, rationale, skills, gaps
    Score->>DB: upsert scores
  end
  Run-->>FE: { scored, attempted, errors }
  FE->>List: GET ?min_score=50
  List->>DB: scores ⨝ postings for profile
  List-->>FE: ranked matches
  FE-->>U: 职位卡片 + 定制按钮
```

Cron 替代方案：`POST /api/cron/score`（服务角色 + `CRON_SECRET`）批量处理所有活跃 profile。

### 3.5 定制 → 审核 → 投递

```mermaid
sequenceDiagram
  actor U as 用户
  participant FE as Matches / 申请详情
  participant Apps as POST /api/applications
  participant Tailor as POST .../tailor
  participant Quota as billing/quota
  participant LLM as LLM
  participant DB as applications

  U->>FE: 定制
  FE->>Apps: { posting_id }
  Apps->>DB: 如果是新的则插入 application (discovered)
  Apps-->>FE: application.id
  FE->>FE: 导航到 /applications/{id}
  U->>FE: 生成定制材料
  FE->>Tailor: POST
  Tailor->>Quota: canTailor? 如果是首次定制则 +1
  Tailor->>LLM: tailored_resume + cover_letter
  LLM-->>Tailor: JSON 草稿
  Tailor->>DB: 保存草稿，status=reviewing
  Tailor-->>FE: application
  U->>FE: 编辑 / 重新生成 / 标记已投递
  FE->>DB: PATCH status, cover letter, history
```

### 3.6 Kanban 跟踪

```mermaid
stateDiagram-v2
  [*] --> discovered
  discovered --> reviewing: 开始定制
  discovered --> archived
  reviewing --> applied: 标记已投递
  reviewing --> archived
  applied --> screening
  applied --> rejected
  applied --> archived
  screening --> interview
  screening --> rejected
  screening --> archived
  interview --> offer
  interview --> rejected
  interview --> archived
  offer --> archived
  rejected --> archived
```

无效转换由 `src/lib/applications/status.ts` 中的 `assertTransition` 拒绝。

---

## 4. 数据表（运行时）

| 表 | 写入方 | 读取方 |
|---|---|---|
| `jp_users` | 认证注册触发器 | 账单 / 摘要 |
| `jp_profiles` | 简历上传 / profile PUT | 评分、匹配列表门槛 |
| `jp_companies` | Seed SQL | 轮询器 |
| `jp_postings` | 轮询器 | 评分、匹配 join |
| `jp_scores` | 评分运行 / Cron | 匹配列表 |
| `jp_applications` | 定制流程 + Kanban PATCH | 跟踪器、审核 UI |
| `jp_usage_counters` | 定制增量 | 使用量页面 / 配额 |

---

## 5. 重要 API 映射

| 方法 | 路径 | 调用方 | 用途 |
|---|---|---|---|
| POST | `/api/profile/resume` | 用户 | 上传 + LLM 自动填充 |
| POST | `/api/profile/resume/reparse` | 用户 | 从存储的文件重新提取 |
| GET/PUT | `/api/profile` | 用户 | 读取 / 更新 profile |
| POST | `/api/score/run` | 用户 | 为我的 profile 评分 |
| GET | `/api/postings?min_score=` | 用户 | 匹配列表 |
| POST | `/api/applications` | 用户 | 创建申请草稿 |
| POST | `/api/applications/:id/tailor` | 用户 | 生成草稿（配额） |
| POST | `/api/applications/:id/regenerate` | 用户 | 免费重新生成 |
| PATCH | `/api/applications/:id` | 用户 | 状态 / 备注 / 求职信 |
| POST | `/api/cron/poll-ats` | Cron 密钥 | 获取职位 |
| POST | `/api/cron/score` | Cron 密钥 | 批量评分所有 profile |
| POST | `/api/cron/digest` | Cron 密钥 | 每周邮件 |

---

## 6. 为什么 Matches 可能显示为空

Matches 仅显示 `jp_scores` 表中**您的** profile 超过 `min_score` 的行。

典型的首次运行状态：

1. 轮询器已填充 `jp_postings`（数千个职位）✓  
2. Profile 有 `resume_parsed` ✓  
3. `jp_scores` 仍然为空 ✗ → Matches 显示为空  

**UI 修复：** 打开 Matches → **立即评分**（调用 `/api/score/run`）。重复直到出现足够的高适配职位。如有需要可降低最低分数。

---

## 7. 本地运维速查表

```bash
# 从 env 文件加载 cron 密钥
export CRON_SECRET="$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)"

# 获取 / 刷新职位
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/poll-ats

# 批量评分（所有 profile）— 或使用 Matches UI 按钮仅为您的用户评分
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/score
```

LLM 路径使用的环境变量：`OPENAI_COMPATIBLE_BASE_URL`、`OPENAI_COMPATIBLE_API_KEY`、`OPENAI_COMPATIBLE_MODEL`。
