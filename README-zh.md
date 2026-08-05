# JobPilot

JobPilot 是一个 AI 职业工作流平台：上传简历，LLM 自动填充字段，浏览和评分来自 6 个 ATS 平台的职位，人工审核定制申请材料，进行模拟面试，在 Kanban 面板上跟踪进度，并接收每周摘要邮件。Stripe 和 Email 默认以 **mock** 模式运行。

## 已实现的功能

- 魔法链接登录（Supabase）
- 上传简历 → **AI 自动填充**（简介、技能、经验、教育背景、推荐偏好）+ 重新解析
- ATS 数据获取：Greenhouse、Lever、Ashby、Workable、Recruitee、Personio（`/api/cron/poll-ats`）
- **流式评分** — 实时进度条显示评分进度（SSE）
- **自动评分** — 进入 Matches 页面时自动触发评分
- **职位浏览** — 搜索所有已拉取的职位，支持关键词/地点/远程筛选（`/browse`）
- **模拟面试** — AI 根据职位生成面试题目，评估回答（STAR 评分），生成面试报告（`/interview/[id]`）
- **申请跟进提醒** — 检测超过 21 天未更新的申请，AI 草拟跟进邮件
- 定制材料 + 重新生成 + 审核 UI；Kanban 进度跟踪（含陈旧标记）
- 流水线统计栏（职位总数、已评分数、申请数、上次拉取时间）
- 配额 / Mock Stripe 门户；每周摘要（Mock Email）
- 品牌：SVG favicon + Logo（导航 / 登录 / 首页）
- **shadcn/ui** 组件库（Button、Card、Badge、Progress、Skeleton、Dialog、Tabs、DropdownMenu）

## 文档索引

| 文档 | 用途 |
|---|---|
| [`docs/03-jobpilot-workflow.md`](docs/03-jobpilot-workflow.md) | **从这里开始** — 运行时工作流 + 时序图 |
| [`docs/06-jobpilot-improvement-plan.md`](docs/06-jobpilot-improvement-plan.md) | **改进计划** — 架构决策 + Phase 1/2 变更记录 |
| [`docs/01-jobpilot-product-spec.md`](docs/01-jobpilot-product-spec.md) | 原始产品规格 / 技术规格 |
| [`docs/02-jobpilot-mvp-plan.md`](docs/02-jobpilot-mvp-plan.md) | 原始 MVP 排期 / MoSCoW |
| [`docs/superpowers/specs/2026-07-11-jobpilot-design.md`](docs/superpowers/specs/2026-07-11-jobpilot-design.md) | 设计决策头脑风暴 |
| [`docs/superpowers/plans/2026-07-11-jobpilot-mvp.md`](docs/superpowers/plans/2026-07-11-jobpilot-mvp.md) | 实施任务计划 |
| [`docs/cascading-github-pipeline-playbook.md`](docs/cascading-github-pipeline-playbook.md) | 催生 JobPilot 的调研笔记 |

## 初始化设置

**要求：** Node.js 20+（推荐）。

1. 复制环境变量模板并填写：

```bash
cp .env.example .env.local
```

| 变量 | 来源 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 同上（legacy anon JWT 与当前客户端兼容） |
| `SUPABASE_SERVICE_ROLE_KEY` | 同上（仅限服务端；永不暴露给浏览器） |
| `OPENAI_COMPATIBLE_BASE_URL` | 例如 `https://api.deepseek.com` |
| `OPENAI_COMPATIBLE_API_KEY` | 服务商 API Key |
| `OPENAI_COMPATIBLE_MODEL` | 推荐返回 `content` 的聊天模型（例如 `deepseek-chat`） |
| `CRON_SECRET` | 随机长字符串；Cron 路由必需 |
| `BILLING_MODE` | `mock`（默认）或 `live` |
| `EMAIL_MODE` | `mock`（默认）或 `live` |
| `STRIPE_*` / `RESEND_*` | 仅在对应模式为 `live` 时需要 |

2. 安装依赖并应用数据库 Schema：

```bash
npm install
npx supabase db push
```

3. 初始化 ATS 公司数据（推荐）：

```bash
npx supabase db query --linked --file supabase/seed_companies.sql
```

4. 运行应用：

```bash
npm run dev
```

打开 [http://localhost:5200](http://localhost:5200)。使用魔法链接登录。

## 首次运行流程

```bash
# 从 .env.local 加载 CRON_SECRET（shell 不会自动加载）
export CRON_SECRET="$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)"
export BASE=http://localhost:5200

# 1) 获取职位数据
curl -sS -X POST "$BASE/api/cron/poll-ats" \
  -H "Authorization: Bearer $CRON_SECRET"

# 2) 完成入职流程（上传简历 → 审核 AI 自动填充的内容）

# 3) 打开 /matches — 评分自动开始，进度条实时显示！
```

## API 路由

| Method | Path | 用户 | 用途 |
|---|---|---|---|
| POST | `/api/cron/poll-ats` | Cron secret | 拉取 6 个 ATS 来源的职位 |
| POST | `/api/cron/score` | Cron secret | 批量评分所有用户 |
| POST | `/api/cron/digest` | Cron secret | 每周摘要（Mock 或 Resend） |
| POST | `/api/score/run` | 用户（Session） | 流式评分（SSE 实时进度） |
| GET | `/api/postings` | 用户（Session） | 匹配列表（仅已评分） |
| GET | `/api/postings/browse` | 公开 | 浏览所有职位 |
| GET | `/api/stats` | 用户（Session） | 流水线统计（计数、时间） |
| POST | `/api/profile/resume` | 用户 | 上传 + LLM 自动填充 |
| POST | `/api/profile/resume/reparse` | 用户 | 重新解析已存储文件 |
| POST | `/api/applications` | 用户 | 创建申请 |
| POST | `/api/applications/:id/tailor` | 用户 | 生成定制材料（消耗配额） |
| POST | `/api/applications/:id/regenerate` | 用户 | 免费重新生成 |
| POST | `/api/applications/:id/follow-up` | 用户 | 草拟跟进邮件 |
| PATCH | `/api/applications/:id` | 用户 | 更新状态 / 备注 |
| POST | `/api/interview/generate` | 用户 | 根据 JD 生成面试问题 |
| POST | `/api/interview/evaluate` | 用户 | 评估回答 + STAR 反馈 |
| POST | `/api/billing/portal` | 用户 | Stripe/mock 门户 |
| DELETE | `/api/account/delete` | 用户 | 删除账户 + 文件 |

## 页面路由

| 页面 | 路径 | 说明 |
|---|---|---|
| Matches | `/matches` | 已评分职位 + 流式自动评分 + 定制 + 面试 |
| Browse | `/browse` | 搜索全部 6 个 ATS 平台的职位 |
| Applications | `/applications` | Kanban 看板 + 陈旧标记 |
| 申请详情 | `/applications/[id]` | 简历对比、求职信编辑、跟进草稿 |
| 模拟面试 | `/interview/[id]` | AI 生成问题 + 评估 + 报告 |
| Profile | `/profile` | 编辑个人资料、偏好、上传简历 |
| 入职 | `/onboarding` | 首次上传简历 + AI 自动填充 |
| Usage | `/usage` | 配额使用情况 |

## 架构

核心库：`src/lib/{ingestion,scoring,tailoring,applications,billing,notifications,llm,profile,stream}`。

组件：`src/components/{AppNav,EmptyState,PipelineStats,brand,profile,ui}`。

UI 系统：**shadcn/ui**（Button, Card, Badge, Progress, Skeleton, Tabs, Dialog, DropdownMenu）+ Tailwind CSS v3。

数据模型：`jp_users`, `jp_profiles`, `jp_resumes`, `jp_companies`, `jp_postings`, `jp_scores`, `jp_applications`, `jp_interview_sessions`, `jp_usage_counters`。全部启用 RLS。

## 脚本

```bash
npm run dev    # Next.js（Turbopack）
npm test       # Vitest（39 个测试，9 个文件）
npm run build  # 生产构建
```

## 账户删除

**Profile → Danger zone** → `DELETE /api/account/delete` 删除 `jp_resumes` 存储桶 `{user_id}/` 下的对象，并删除认证用户（FK 级联）。
