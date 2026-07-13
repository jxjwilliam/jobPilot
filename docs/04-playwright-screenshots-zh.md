# Playwright 截图自动化 — 绕过 Supabase 邮件频率限制

**状态：** 指南  
**适用于：** JobPilot（Supabase 魔法链接认证）  
**最后更新：** 2026-07-13

---

## 目录

1. [问题：邮件频率超限](#1-问题邮件频率超限)
2. [本项目认证方式](#2-本项目认证方式)
3. [解决方案：Admin API 会话注入](#3-解决方案admin-api-会话注入)
4. [一次性认证脚本](#4-一次性认证脚本)
5. [复用会话截图](#5-复用会话截图)
6. [与 Screenshot-UI Skill 集成](#6-与-screenshot-ui-skill-集成)
7. [替代方案：创建密码测试用户](#7-替代方案创建密码测试用户)
8. [完整流水线脚本](#8-完整流水线脚本)
9. [常见问题排查](#9-常见问题排查)

---

## 1. 问题：邮件频率超限

### 原因

Supabase 免费版对 OTP / 魔法链接邮件有**频率限制**：

| 限制项 | 数值 |
|---|---|
| 每小时每邮箱可发送魔法链接数 | ~2–5 次 |
| 冷却时间 | ~1 小时 |
| 返回错误 | `429` / `"email rate limit exceeded"` |

### 触发场景

每次在 `http://localhost:3000/login` 点击 **"Send magic link"**，应用都会调用：

```ts
// src/app/(auth)/login/page.tsx — 第 22 行
await supabase.auth.signInWithOtp({
  email,
  options: { emailRedirectTo: `${origin}/auth/callback` },
});
```

如果你在短时间内连续点击 2–5 次（开发测试时很容易这样），Supabase 就会阻止该邮箱继续发送。

### 为什么会影响 Playwright 自动化

截图脚本需要登录才能访问受保护页面（`/matches`、`/applications`、`/profile` 等）。朴素思路是：

```
Playwright 输入邮箱 → 点击"发送" → ... 但无法在邮件中点击魔法链接 → 卡住。
```

即使你能访问邮箱，每次 Playwright 运行都会消耗一个受限制的发送名额。

---

## 2. 本项目认证方式

```
┌─────────┐          ┌──────────────┐          ┌───────────┐
│ 登录页面  │ signIn  │   Supabase   │  发送邮件  │  用户邮箱  │
│          │ WithOtp │   认证服务    │──────────▶│           │
│          │────────▶│              │           │           │
│          │         │              │  魔法链接   │           │
│          │         │              │           │           │
│          │◀────────│  429 超限时   │  点击链接   │           │
│          │  错误    │  阻止发送     │──────────▶│           │
└─────────┘         └──────────────┘           └───────────┘
                           │
                           │ 重定向到 /auth/callback
                           ▼
                    ┌──────────────┐
                    │  交换 code   │
                    │  获取 session │──▶ 设置 session cookie
                    │              │
                    └──────────────┘
```

**关键文件：**

| 文件 | 作用 |
|---|---|
| `src/lib/supabase/client.ts` | 浏览器端客户端（登录页面使用） |
| `src/lib/supabase/server.ts` | 服务端客户端（从 Next.js 读取 cookie） |
| `src/lib/supabase/admin.ts` | **管理员客户端** — 使用 `SUPABASE_SERVICE_ROLE_KEY`，绕过所有频率限制。这是我们的逃生出口。 |
| `src/app/(auth)/login/page.tsx` | 登录页面 UI — 调用 `signInWithOtp` |
| `src/app/auth/callback/route.ts` | 魔法链接回调 — 交换 code 获取 session |

### 逃生出口

`src/lib/supabase/admin.ts` 使用 **service role key** 创建 Supabase 客户端：

```ts
export function createAdminClient() {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

这个客户端具有**管理员权限**——可以生成魔法链接、创建用户、管理会话，**不需要发送邮件**，也**不会触发频率限制**。

---

## 3. 解决方案：Admin API 会话注入

核心思路：

1. 使用 Admin API（`supabase.auth.admin.generateLink()`）生成一个有效的魔法链接 URL — **不会真正发送邮件**。
2. 让 Playwright 直接访问该 URL — 这会自动完成 code 交换，设置 session cookie。
3. Playwright 现在已登录，就像点击了真实的魔法链接一样。
4. **保存会话**（`storageState`），后续截图运行直接加载，无需再次认证。

```
┌─────────────┐                  ┌──────────────┐
│  Playwright  │  admin.generate │   Supabase   │
│  脚本        │  Link()          │   Admin API   │
│              │────────────────▶│              │
│              │  ← action_link   │              │
│              │                  │              │
│              │  访问 action_link │   认证服务     │
│              │────────────────▶│              │
│              │  ← session       │              │
│              │  cookie 已设置    │              │
│              │                  │              │
│              │  保存             │              │
│              │  storageState    │              │
└─────────────┘                  └──────────────┘
```

---

## 4. 一次性认证脚本

创建 `scripts/setup-auth.mjs`：

```javascript
// scripts/setup-auth.mjs
// 生成 Supabase 会话，不发送任何邮件。
// 用法：node --env-file=.env.local scripts/setup-auth.mjs

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = "http://localhost:3000";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("缺少 SUPABASE 环境变量。运行方式：node --env-file=.env.local scripts/setup-auth.mjs");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. 生成魔法链接 — 不会发送邮件，不会触发频率限制
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: "jxjwilliam@gmail.com",
  });
  if (error) throw error;

  const actionLink = data.properties?.action_link;
  if (!actionLink) throw new Error("未返回 action_link");
  console.log("✓ 魔法链接已生成（未发送邮件）");

  // 2. 启动 Playwright 并访问该链接
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(actionLink, { waitUntil: "networkidle" });

  // 3. 验证登录成功（会被重定向到 /matches 或 /onboarding）
  const currentUrl = page.url();
  console.log("✓ 重定向到：", currentUrl);

  if (currentUrl.includes("/login") || currentUrl.includes("error")) {
    throw new Error("登录失败 — 仍然在登录页面");
  }

  // 4. 保存会话供后续复用
  await page.context().storageState({ path: "auth-state.json" });
  console.log("✓ 会话已保存到 auth-state.json");

  await browser.close();
  console.log("完成。现在可以运行截图脚本了。");
}

main().catch((err) => {
  console.error("✗", err);
  process.exit(1);
});
```

**重要：** `service_role` 密钥是敏感信息。该脚本在本地运行，不会暴露给浏览器。

### 执行一次

```bash
node --env-file=.env.local scripts/setup-auth.mjs
```

预期输出：
```
✓ 魔法链接已生成（未发送邮件）
✓ 重定向到：http://localhost:3000/matches
✓ 会话已保存到 auth-state.json
完成。
```

这会在项目根目录创建 `auth-state.json` — 保存了后续所有运行所需的认证状态。

---

## 5. 复用会话截图

之后的任何 Playwright 脚本都可以加载已保存的会话，跳过登录：

```javascript
// scripts/screenshot-with-auth.mjs
import { chromium } from "playwright";

const APP_URL = "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });
  // 加载预先保存的认证状态
  const context = await browser.newContext({
    storageState: "auth-state.json",   // ← 关键行
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // 已登录 — 直接导航
  const routes = ["/", "/matches", "/applications", "/profile"];
  for (const route of routes) {
    await page.goto(`${APP_URL}${route}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `screenshots${route === "/" ? "/home" : route}.png` });
    console.log(`  ✓ ${route}`);
  }

  await browser.close();
}

main().catch(console.error);
```

### 原理

当 Playwright 调用 `browser.newContext({ storageState: "auth-state.json" })` 时，会加载：
- **Cookies** — 包括 Supabase session cookie（`sb-<project>-auth-token`）
- **Local storage** — 任何持久化的会话数据

服务端中间件（`src/middleware.ts`）看到有效的 session cookie，就会通过请求 — 和你在浏览器中真实登录完全一样。

### 何时需要重新运行 setup-auth

在以下情况需要重新运行 `scripts/setup-auth.mjs`：
- Supabase 会话过期（默认 3600 秒 / 1 小时）
- 更改了用户邮箱
- `auth-state.json` 文件被删除

生成的会话默认存活时间较短，长时间会话期间需要定期刷新。脚本只需约 3 秒即可完成。

---

## 6. 与 Screenshot-UI Skill 集成

本项目已安装 `screenshot-ui` skill。其基础脚本支持两种认证方式：

### 方式 A：`loginDelaySeconds`（手动 — 不推荐）

Skill 配置中有 `loginDelaySeconds` 选项，会在登录页面暂停让你手动登录。不适合自动化。

### 方式 B：`storageState` 注入（推荐）

修改 JS 截图脚本（skill 的 `scripts/screenshot.js`），加载预先保存的状态：

```javascript
// scripts/screenshot.config.js — 添加 storageState 选项
export default {
  targets: {
    localhost: "http://localhost:3000",
  },
  run: "localhost",
  outputDir: "screenshots",
  viewport: { width: 1440, height: 900 },
  storageState: "auth-state.json",   // ← 加载已保存的会话
  manualRoutes: ["/", "/matches", "/applications", "/profile", "/onboarding"],
  // loginDelaySeconds: 0,   // 无需延迟
  extraDelayMs: 1500,
};
```

然后在截图脚本中创建 context 时：

```javascript
// 在 scripts/screenshot.js 内部，创建 context 时：
const contextOptions = {
  viewport: config.viewport,
};
if (config.storageState) {
  contextOptions.storageState = config.storageState;
}
const context = await browser.newContext(contextOptions);
```

### 方式 C：使用 Python 脚本 + 认证

Python 版（`scripts/screenshot_py.py`）没有原生 `storageState` 支持，但可以手动加载：

```python
import json
from playwright.sync_api import sync_playwright

with open("auth-state.json") as f:
    auth_state = json.load(f)

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(
        storage_state=auth_state,
        viewport={"width": 1440, "height": 900}
    )
    # ... 开始截图
```

### 端到端命令

```bash
# 1. 生成认证会话（每小时运行一次）
node --env-file=.env.local scripts/setup-auth.mjs

# 2. 运行截图 UI 脚本（加载 auth-state.json）
node scripts/screenshot.js --target localhost
```

---

## 7. 替代方案：创建密码测试用户

如果你更倾向于邮箱+密码登录（Playwright 可以直接填入），Admin API 可以创建测试用户：

### 创建用户（一次性）

```javascript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data, error } = await supabase.auth.admin.createUser({
  email: "test@jobpilot.local",
  password: "test123",
  email_confirm: true,                // 跳过邮箱验证
});
```

### 然后在 Playwright 中登录

```javascript
await page.goto("http://localhost:3000/login");
await page.fill('input[type="email"]', "test@jobpilot.local");
// 但登录页还需要密码输入框...
```

**缺点：** 当前登录页面只有魔法链接（仅邮箱）流程。使用此方法需要：
1. 在登录页面添加密码输入框，或
2. 使用单独的 API 路由支持密码登录

[§4](#4-一次性认证脚本) 的 `generateLink()` 方法更简单，因为它与现有的纯魔法链接流程兼容。

---

## 8. 完整流水线脚本

创建 `scripts/screenshot-all.mjs`，一键完成完整流程：

```javascript
// scripts/screenshot-all.mjs
// 1. 通过 admin API 认证 → 2. 截图所有路由 → 3. 完成
// 用法：node --env-file=.env.local scripts/screenshot-all.mjs

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync } from "fs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = "http://localhost:3000";
const SCREENSHOT_DIR = "screenshots";

const ROUTES = [
  { path: "/",           name: "home" },
  { path: "/matches",    name: "matches" },
  { path: "/applications", name: "applications" },
  { path: "/profile",    name: "profile" },
  { path: "/onboarding", name: "onboarding" },
];

async function main() {
  if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // 第 1 步：生成会话令牌（不发送邮件）
  console.log("[1/3] 生成认证会话...");
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: "jxjwilliam@gmail.com",
  });
  if (error) throw error;
  console.log("  ✓ 魔法链接已生成");

  // 第 2 步：启动浏览器并登录
  console.log("[2/3] 登录并开始截图...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // 访问魔法链接以建立会话
  await page.goto(data.properties.action_link, { waitUntil: "networkidle" });
  console.log(`  ✓ 已登录，当前地址：${page.url()}`);

  // 第 3 步：截取每个路由
  for (const route of ROUTES) {
    await page.goto(`${APP_URL}${route.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000); // 等待动画完成
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/${route.name}.png`,
      fullPage: false,
    });
    console.log(`  ✓ ${route.path}`);
  }

  await browser.close();
  console.log("[3/3] 完成。截图已保存到 screenshots/");
}

main().catch((err) => {
  console.error("✗", err);
  process.exit(1);
});
```

运行：
```bash
node --env-file=.env.local scripts/screenshot-all.mjs
```

---

## 9. 常见问题排查

### "action_link is undefined"

Admin `generateLink` 的响应结构取决于你的 Supabase 版本。如果 `data.properties?.action_link` 是 undefined，请打印完整响应来检查：

```javascript
const { data } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
console.log(JSON.stringify(data, null, 2));
```

你需要寻找一个包含 `?token=xxx&type=magiclink` 或 `?code=xxx` 的 URL。使用相应字段即可。

### 会话很快过期

Supabase access token 默认有效期为 **3600 秒（1 小时）**。如果遇到 401 错误，重新运行 setup-auth 脚本即可。[§8](#8-完整流水线脚本) 的完整流水线脚本每次运行都会重新生成会话。

### Admin API 也遇到"Email rate limit exceeded"

Admin API（使用 `service_role` 密钥的 `generateLink`）**不会**触发邮件频率限制，因为它根本不发送邮件。如果遇到频率限制，请检查你是否使用了 `SUPABASE_SERVICE_ROLE_KEY`，而不是 `ANON_KEY`。

### Playwright 报 "storageState file not found"

请确保你已经运行了 `scripts/setup-auth.mjs`。`auth-state.json` 文件创建在项目根目录。如果你从不同工作目录运行脚本，请调整路径：

```javascript
const path = require("path");
const statePath = path.join(process.cwd(), "auth-state.json");
```

### 想用不同用户？

修改 `generateLink` 调用中的邮箱。任何邮箱地址都可以 — Admin API 不要求该邮箱在 Supabase Auth 中已存在（它会隐式创建用户）。

---

## 参考

| 代码文件 | 用途 |
|---|---|
| `src/lib/supabase/admin.ts` | 使用 service role key 的管理员客户端 |
| `src/lib/supabase/client.ts` | 浏览器客户端（登录页面使用） |
| `src/app/(auth)/login/page.tsx` | 登录页面 — 调用 `signInWithOtp` |
| `src/app/auth/callback/route.ts` | 魔法链接处理器 |
| `scripts/setup-auth.mjs` | 一次性认证会话生成器（需创建） |
| `scripts/screenshot-all.mjs` | 完整流水线认证+截图（需创建） |
| `auth-state.json` | 已保存的 Playwright 会话（自动生成，不要提交到 git） |

**相关文档：** `docs/03-jobpilot-workflow-zh.md` — 运行时认证流程和时序图。
