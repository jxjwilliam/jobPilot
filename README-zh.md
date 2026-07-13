# JobPilot

JobPilot 是一个 AI 职业工作流平台：上传简历，LLM 自动填充字段，根据您的简历对 Greenhouse/Lever 上的职位进行评分，人工审核定制申请材料，在 Kanban 面板上跟踪进度，并接收每周摘要邮件。Stripe 和 Email 默认以 **mock** 模式运行。

## 已实现的功能

- 魔法链接登录（Supabase）
- 上传简历 → **AI 自动填充**（简介、技能、经验、教育背景、推荐偏好）+ 重新解析
- ATS 数据获取：Greenhouse + Lever（`/api/cron/poll-ats`）
- 评分：Cron 批量评分 **或** Matches 页面 **Score matches now**（`/api/score/run`）
- 定制材料 + 重新生成 + 审核 UI；Kanban 进度跟踪
- 配额 / Mock Stripe 门户；每周摘要（Mock Email）
- 品牌：SVG favicon + Logo（导航 / 登录 / 首页）

## 文档索引

| 文档 | 用途 |
|---|---|
| [`docs/03-jobpilot-workflow.md`](docs/03-jobpilot-workflow.md) | **从这里开始** — 运行时工作流 + 时序图 |
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

如果关联项目已有 migration `20260711000000_init`，push 可能报告无需更新。

3. 初始化 ATS 公司数据（推荐）：

```bash
npx supabase db query --linked --file supabase/seed_companies.sql
```

4. 运行应用：

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。使用魔法链接登录。

## 首次运行流程

```bash
# 从 .env.local 加载 CRON_SECRET（shell 不会自动加载）
export CRON_SECRET="$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)"
export BASE=http://localhost:3000

# 1) 获取职位数据
curl -sS -X POST "$BASE/api/cron/poll-ats" \
  -H "Authorization: Bearer $CRON_SECRET"

# 2) 完成入职流程（上传简历 → 审核 AI 自动填充的内容）

# 3) 从 Matches UI 评分（"Score matches now"），或：
curl -sS -X POST "$BASE/api/cron/score" \
  -H "Authorization: Bearer $CRON_SECRET"
```

| 路由 | 作用 |
|---|---|
| `POST /api/cron/poll-ats` | 获取 Greenhouse + Lever 职位数据 |
| `POST /api/cron/score` | 批量评分未评分的 profile × posting 组合 |
| `POST /api/score/run` | 为**当前用户**评分（Session 认证；Matches UI 调用） |
| `POST /api/cron/digest` | 每周摘要（Mock 或 Resend） |
| `POST /api/profile/resume` | 上传简历 + LLM 自动填充 |
| `POST /api/profile/resume/reparse` | 从已存储的文件重新解析 |

**注意：** Matches 仅显示 `scores` 表中与您相关的行。数据获取后可能已有数千条 `postings`，但在评分运行前 Matches 页面会显示为空。

## Mock 账单与邮件

- **`BILLING_MODE=mock`** — 升级门户返回本地 Mock URL；不产生 Stripe 扣款。
- **`EMAIL_MODE=mock`** — 摘要日志输出到服务端控制台（`{ mocked: true }`）。

## 架构

核心库：`src/lib/{ingestion,scoring,tailoring,applications,billing,notifications,llm,profile}`。

品牌资产：`public/favicon.svg`、`public/logo.svg`、`src/components/brand/JobPilotLogo.tsx`。

## 脚本

```bash
npm run dev    # Next.js（Turbopack）
npm test       # Vitest
npm run build  # 生产构建
```

## 账户删除

**Profile → Danger zone** → `DELETE /api/account/delete` 删除 `resumes/{user_id}/` 下的 Storage 对象，并删除认证用户（FK 级联）。

<!-- screenshots -->
## Screenshots

| Home | Login | Matches |
| --- | --- | --- |
| ![Home](screenshots/home.png) | ![Login](screenshots/login.png) | ![Matches](screenshots/matches.png) |

| Applications | Profile | Onboarding |
| --- | --- | --- |
| ![Applications](screenshots/applications.png) | ![Profile](screenshots/profile.png) | ![Onboarding](screenshots/onboarding.png) |

| Usage |
| --- |
| ![Usage](screenshots/usage.png) |

<!-- /screenshots -->
