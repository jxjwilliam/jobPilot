# JobPilot — 改进计划

**日期:** 2026-08-01
**状态:** Phase 1 ✅ 完成 | Phase 2 ✅ 完成 (1 项待迁移)
**参考:** JadeAI (LingyiChen-AI/JadeAI) — shadcn/ui 组件模式、Vercel AI SDK 流式架构、Zustand 状态管理
**关联:** `01-jobpilot-product-spec.md`, `02-jobpilot-mvp-plan.md`, `03-jobpilot-workflow.md`
**决策:** ❌ Mastra — 不引入。✅ shadcn/ui — 前端组件库。✅ Web Streams API — 无新依赖的流式传输。

## 实施总结

### Phase 1 ✅ 完成 (2026-08-01)
- **1.1 流式 LLM** — SSE 评分进度 + 进度条 UI
- **1.2 空状态** — PipelineStats + EmptyState 组件，上下文引导
- **1.3 自动评分** — 进入 Matches 时，如果尚未评分则自动触发
- **1.4 ATS 来源** — Greenhouse + Lever + Ashby + Workable + Recruitee + Personio（6 个来源，12 个新测试）

### Phase 2 ✅ 完成 (2026-08-01)
- **2.3 职位浏览** — `/browse` 页面，包含搜索/过滤/分页功能
- **2.4 陈旧申请跟进** — 21 天以上的陈旧检测 + AI 邮件草稿
- **2.2 模拟面试** — 面试问题生成 + AI 评估 + STAR 评分 + 报告
- **2.1 多简历支持** — 迁移已创建（需要 `npx supabase db push`）

### 部署前
需要 Supabase CLI 来推送迁移：
```bash
npx supabase db push  # 应用 interview_sessions + resumes 表
```

---

## 0. 前置判断：Mastra 是否需要？

在深入计划之前，先诚实回答这个关键问题。

### 当前 JobPilot 的 LLM 使用模式

| 功能 | 模式 | 复杂度 | Mastra 能改善吗？ |
|---|---|---|---|
| 简历解析 | prompt → JSON | 单次调用 | ❌ 大材小用 |
| 职位评分 | prompt → JSON | 单次调用 | ❌ 大材小用 |
| 简历定制 | prompt → JSON | 单次调用 | ❌ 大材小用 |
| 每周摘要 | 数据聚合，无 LLM | 纯逻辑 | ❌ 不相关 |
| ATS 拉取 | HTTP fetch | 纯逻辑 | ❌ 不相关 |
| **模拟面试**（未构建） | 多轮对话 + 状态 + 工具调用 | **智能体原生** | ✅ **真正的匹配** |

### 结论

**现阶段不要引入 Mastra。** JobPilot 90% 的 LLM 使用是简单的 prompt → JSON 调用，这种模式工作正常，加 Mastra 只会增加复杂度和依赖体积，没有实质收益。

唯一需要 Mastra（或类似智能体框架）的场景是**模拟面试**——多轮对话、状态管理、工具调用（生成问题 → 转录回答 → 评分反馈 → 制定训练计划）。但即使这个功能，用 Vercel AI SDK 的 `generateText` + `streamText` + `tool()` 也能覆盖，不一定需要 Mastra。

**建议：** 保留 Mastra 在视野中，作为「Phase 2 面试模块」的技术候选之一。在此之前，所有改进聚焦于**让现有东西更好用，而非更复杂**。

---

## 1. 现状诊断：当前 JobPilot 的实际痛点

通过对代码的审查，以下是影响用户体验的真实问题（按严重程度排序）：

### 🔴 严重：用户感知问题

| # | 问题 | 证据 | 用户影响 |
|---|---|---|---|
| 1 | **无流式输出** | `score.ts:197` — 使用 `chat.completions.create()`，非流式；规范明确要求 "streamed to UI" | 用户等待 5-20 秒，看空白屏幕，不知道系统是否在工作 |
| 2 | **空状态困惑** | `docs/03` 第 273 行专门解释了 "为什么 Matches 可能看起来是空的" | 新用户完成入职后发现 Matches 页面空白，以为产品坏了 |
| 3 | **手动触发评分** | 用户需要点击 "Score matches now"，然后等待，没有任何进度提示 | 像在操作一个批处理脚本，而不是现代 SaaS |
| 4 | **仅 2 个 ATS 来源** | 规范列出了 6 个（Ashby、Workable、Recruitee、Personio 未实现） | 职位覆盖面窄，遗漏大量机会 |

### 🟡 中等：功能缺失

| # | 问题 | 证据 | 用户影响 |
|---|---|---|---|
| 5 | **模拟面试未构建** | 规范 §7.6 和 MVP 计划都列为快速跟进项，已规划但未实现 | 缺失核心差异化功能 |
| 6 | **仅支持单份简历** | 数据模型：一个 profile 只能有一份 `resume_parsed` | 求职者通常需要多份简历用于不同岗位方向 |
| 7 | **无法直接浏览职位** | Matches 仅从 `jp_scores` 表读取；未评分的职位对用户不可见 | 用户无法主动搜索/浏览职位池 |
| 8 | **Mock 计费/邮件模式** | `BILLING_MODE=mock` 是默认值；真实 Stripe/Resend 未接入 | 无法产生收入 |

### 🟢 次要：技术债务

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| 9 | **脆弱的 JSON 解析** | `extractScoreResult`/`extractTailorResult` 手动用正则提取 JSON | 某些 LLM 提供商（如 DeepSeek）偶尔会在 JSON 外包 markdown |
| 10 | **无批量失败恢复** | `scoreUnscoredBatch` 如果中途崩溃，没有断点续传 | 浪费 LLM 调用成本 |
| 11 | **Supabase 厂商锁定** | Auth + DB + Storage 全部依赖 Supabase | 迁移成本高（但这个阶段不是紧急问题） |

---

## 2. 改进路线图

### Phase 1: 打磨现有核心体验（2-3 周，业余时间）

**目标：让已构建的功能真正好用。不引入新技术栈。**

#### 1.1 流式 LLM 响应

当前所有 LLM 调用都是阻塞的 `chat.completions.create()`。改为流式传输：

```typescript
// 当前 (src/lib/scoring/score.ts:197)
const completion = await client.chat.completions.create({
  model: getLlmModel(),
  messages: [...],
  response_format: { type: "json_object" },
});
// → 用户等待 5-15 秒，无反馈

// 改进方案：使用 Vercel AI SDK 的 streamText
// 或直接用 OpenAI SDK 的 stream: true
const stream = await client.chat.completions.create({
  model: getLlmModel(),
  messages: [...],
  stream: true,
});
// → 通过 SSE 推送到前端，用户看到实时进度
```

**为什么不用 Mastra 做这个？** 因为 Vercel AI SDK（或直接 SDK 流式调用）已经完美解决了流式传输问题，且只有很少的代码量。引入 Mastra 只为流式传输，就像用起重机搬一个纸箱。

**实现:**
- 评分 (`/api/score/run`) → 改为 SSE，逐条推送评分结果 ✅
- 定制 (`/api/applications/:id/tailor`) → 改为 SSE，流式推送简历和求职信内容 ✅（2026-08-05：进一步拆分为**两次 LLM 调用**——先定制简历，再基于定制简历撰写求职信，SSE 分步推送 `resume_start → resume_done → cover_start → cover_done → done`；`/regenerate` 同样流式且免费）
- 简历解析 → 保持阻塞（这个场景下流式传输不关键）

#### 1.2 空状态引导

```
Matches 页面当前状态:
┌──────────────────────────────┐
│  Matches                     │
│                              │
│  (空白页面)                  │  ← 用户困惑
│                              │
└──────────────────────────────┘

Matches 页面应改为:
┌──────────────────────────────┐
│  Matches                     │
│                              │
│  🎯 准备发现您的职位匹配     │
│                              │
│  我们已拉取了 1,247 个职位   │  ← 告知状态
│  0 个已评分                  │
│                              │
│  [⭐ 开始评分匹配]           │  ← 清晰的 CTA
│                              │
└──────────────────────────────┘
```

#### 1.3 自动评分 + 进度提示

当前模式：用户手动点击 "Score matches now" → 等待 → 刷新。改为：
- 用户进入 Matches 页面时，如果存在未评分的职位，**自动触发后台评分**
- 显示实时进度："正在评分 3/20..."
- 评分完成后自动刷新列表

#### 1.4 扩展 ATS 来源

添加规范中已规划的 4 个额外来源（Ashby、Workable、Recruitee、Personio），参照现有 `greenhouse.ts` / `lever.ts` 模式：

```
src/lib/ingestion/
├── greenhouse.ts     ← 已有
├── lever.ts          ← 已有
├── ashby.ts          ← 新增
├── workable.ts       ← 新增
├── recruitee.ts      ← 新增
└── personio.ts       ← 新增
```

每个源约 40-60 行代码，与现有模式完全相同。这是一个**高价值、低风险**的改进。

#### 1.5 接入真实 Stripe/Resend

- `BILLING_MODE=live` → 真实 Stripe 订阅 + 客户门户
- `EMAIL_MODE=live` → 真实 Resend 每周摘要邮件
- Mock 模式保留，用于开发和测试

---

### Phase 2: 补全关键功能（4-6 周，业余时间）

#### 2.1 多简历支持

数据模型变更：
```sql
-- 当前：一份简历绑定到 profile
ALTER TABLE profiles ADD COLUMN active_resume_id uuid;

-- 新增：简历版本表
CREATE TABLE resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id),
  name text NOT NULL,              -- "Software Engineer", "PM", etc.
  file_url text NOT NULL,
  resume_parsed jsonb NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
```

UI: 在 Profile 页面添加简历切换器，用户可以为不同目标角色创建多份简历。

#### 2.2 模拟面试模块

**这是 Mastra 真正适用的场景。** 但也可以直接用 Vercel AI SDK 实现：

```
面试流程:
┌──────────────────────────────────────────────────┐
│  1. 选择职位 → 生成 8-12 道可能的面试题目        │
│  2. 逐题进行：                                   │
│     a. AI 提问（语音/文字）                      │
│     b. 用户回答（语音→Whisper 转录，或直接打字）  │
│     c. AI 评分 + 即时反馈（STAR 方法、清晰度）    │
│  3. 完整复盘：弱项分析 + 训练计划                │
└──────────────────────────────────────────────────┘
```

**技术选择：Mastra vs Vercel AI SDK**

| 维度 | Mastra | Vercel AI SDK |
|---|---|---|
| 多轮对话状态 | 内置 Memory（对话历史 + 工作记忆 + 语义召回） | 需手动管理消息数组 |
| 工具调用 | 内置 Agent.tools | `tool()` + `maxSteps` |
| 工作流挂起/恢复 | 原生支持 | 需自行实现 |
| 学习成本 | 中高（新概念：Agent、Workflow、Memory） | 低（与现有 OpenAI SDK 模式相似） |
| 依赖体积 | ~20+ 包 | ~5 包 |
| 适合场景 | 复杂多步骤智能体 | 单轮或多轮对话 |

**建议：先用 Vercel AI SDK 实现面试模块。** 如果后续需要精确的状态挂起/恢复（例如：用户中途退出面试，第二天继续），再考虑引入 Mastra 来处理工作流持久化。

#### 2.3 职位浏览与搜索

添加一个独立的 "Browse" 页面，让用户可以：
- 搜索所有已拉取的职位（不仅仅是已评分的）
- 按公司、地点、职位类型筛选
- 手动对感兴趣的职位触发评分 + 定制

这解决了当前 "Matches 页面可能为空" 的核心困惑——用户至少能看到职位数据。

#### 2.4 陈旧的申请跟进

规范 §7.5 已描述：`applied_at` + 21 天无状态变化 → 建议草拟一封跟进邮件。

---

### Phase 3: 架构演进（按需触发，不提前优化）

以下改进**只有在当前架构成为瓶颈时**才考虑：

#### 3.1 Monorepo 拆分

**触发条件：** 当代码量超过 ~200 个源文件，或需要独立部署面试服务时。

```
jobpilot/
├── apps/
│   └── web/          # 当前的 Next.js 应用（保持不变）
├── packages/
│   ├── llm/          # 从 src/lib/llm 提取
│   ├── ingestion/    # 从 src/lib/ingestion 提取
│   └── shared/       # Zod schemas、类型
└── pnpm-workspace.yaml
```

#### 3.2 SST/AWS 部署

**触发条件：** Vercel 成本超过 $100/月，或需要 Lambda 长时运行任务。

当前 Vercel 对 JobPilot 的规模来说足够好。Supabase 也一样。不要提前迁移。

#### 3.3 Better Auth 替换 Supabase Auth

**触发条件：** 需要即时会话撤销，或出于合规原因希望认证数据与应用数据在同一数据库中。

**当前不需要。** Supabase Auth 在 MVP 阶段工作正常。

---

## 3. 技术决策总结

| 决策 | 选择 | 理由 |
|---|---|---|
| Mastra | **暂不引入** | 当前 90% 的 LLM 使用是简单的 prompt→JSON，Mastra 对此是过度工程化；唯一匹配的场景（面试）可以先用 Vercel AI SDK 实现 |
| AI SDK | **引入 Vercel AI SDK** | 提供流式传输 (`streamText`) 和工具调用 (`tool()`)，与现有 OpenAI 模式兼容，依赖体积小 |
| 认证 | **保持 Supabase Auth** | 工作正常，无痛点；不提前迁移 |
| 数据库 | **保持 Supabase Postgres** | 工作正常；Phase 3 按需考虑 Aurora |
| 部署 | **保持 Vercel** | 当前规模下最优解；Phase 3 按需考虑 SST |
| Monorepo | **暂不拆分** | 单一代码库对 solo 开发者来说更高效；当文件数 >200 或需要独立部署时再拆分 |
| 桌面应用 | **不涉及** | JobPilot 专注 Web/Cloud；jlifeng/JobPilot 的桌面模式是不同产品方向 |

---

## 4. 从 jlifeng/JobPilot 借鉴的非技术改进

不引入其技术栈（Tauri、SQLite），但可以借鉴其产品思路：

| 借鉴点 | 如何应用到 JobPilot (Web) |
|---|---|
| **精确编辑而非全文重写** | 当前 `tailor.ts` 输出完整的新简历 JSON。改为输出"补丁"模式：`{changes: [{section: "summary", new_text: "..."}, {section: "experience[0].bullets", add: ["..."]}]}` — 保留原始结构，只标记修改 |
| **技能包系统** | 将 AI 功能模块化：简历优化、求职信、语法检查、JD 分析 → 用户可以选择性使用，而非全部捆绑 |
| **隐私遮罩** | 导出简历时可以选择性地遮盖姓名、电话、邮箱、学校名 → 便于在公共场合分享 |
| **50+ 简历模板** | 当前的定制输出是纯文本。添加 PDF 导出模板（用 `@react-pdf/renderer` 或简单的 HTML→PDF） |

---

## 5. 即时行动项（本周可做）

这些改进**不需要任何架构变更**，可以立即开始：

### 5.1 修复空状态（~2 小时）

- [ ] `src/app/(app)/matches/page.tsx`：当 `jp_scores` 为空时，显示职位总数和"开始评分"引导
- [ ] `src/app/(app)/applications/page.tsx`：当没有申请时，引导用户从 Matches 开始

### 5.2 添加评分进度提示（~4 小时）

- [ ] `src/app/api/score/run/route.ts`：改为 SSE 流式返回，每完成一条推送进度
- [ ] `src/app/(app)/matches/page.tsx`：接收 SSE 事件，显示进度条

### 5.3 添加 Ashby ATS 源（~2 小时）

- [ ] `src/lib/ingestion/ashby.ts`：参照 `greenhouse.ts` 模式，约 40 行
- [ ] `src/lib/ingestion/poll.ts`：在 `fetchForCompany` 中添加 `ashby` 分支

---

## 6. 开放问题

在推进之前，需要您的反馈：

1. **Phase 1 的优先级是否合理？** 即：流式输出 > 空状态 > 自动评分 > ATS 扩展 > 真实 Stripe？

2. **面试模块** 是您希望尽快上线的功能，还是可以等到 Phase 2 后期？

3. **多简历支持** 对目标用户来说重要吗？还是大多数用户只需要一份简历？

4. **计费模式**：Mastra 的引入主要是为了面试模块的多轮对话。如果先用 Vercel AI SDK 实现一个简单的面试原型，之后再评估是否需要 Mastra 来做状态持久化，这个策略可以吗？
