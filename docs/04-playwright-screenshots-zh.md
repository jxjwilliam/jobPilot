# Playwright 截图自动化 — 无需邮件即可登录

**状态：** 指南 · **适用于：** JobPilot（Supabase Auth + 固定凭据密码登录） · **最后更新：** 2026-09-10

实际实现见 [`scripts/screenshot-with-auth.mjs`](../scripts/screenshot-with-auth.mjs)。本文说明它如何完成认证，以及如何在其他项目复用同样的思路。

---

## 目录

1. [为什么要由脚本自己铸造会话](#1-为什么要由脚本自己铸造会话)
2. [当前认证方式](#2-当前认证方式)
3. [方案：Admin API → 注入 sessionStorage](#3-方案admin-api--注入-sessionstorage)
4. [`scripts/screenshot-with-auth.mjs` 内部实现](#4-scripts-screenshot-with-authmjs-内部实现)
5. [运行方式](#5-运行方式)
6. [与 screenshot-ui skill 集成](#6-与-screenshot-ui-skill-集成)
7. [替代方案：真实填写密码表单](#7-替代方案真实填写密码表单)
8. [常见问题排查](#8-常见问题排查)
9. [参考](#9-参考)

---

## 1. 为什么要由脚本自己铸造会话

应用只有一条登录入口：`/login` 的固定凭据表单，它调用 `POST /api/auth/password-login`。
截图脚本不应该把 owner 的密码写进脚本或手动输入，因此改为使用 **service-role key** 在服务端
铸造一个真实的 Supabase 会话，再注入到浏览器里。全程不发邮件、不消耗频率额度，密码也不会
出现在脚本中。

本文早期版本讲的是如何绕过 Supabase 魔法链接邮件的频率限制（免费版每小时 2 封）。魔法链接
已不再是登录路径，但 Admin API 这套思路依然是 headless 认证最可靠的做法。

---

## 2. 当前认证方式

```
┌──────────┐  邮箱+密码   ┌────────────────────────────────┐
│  /login  │────────────▶│ POST /api/auth/password-login  │
└──────────┘             └───────────────┬────────────────┘
                                         │ 凭据匹配
                                         ▼
                             ┌────────────────────────────┐
                             │ mintSessionForEmail()      │
                             │  admin createUser          │
                             │  generateLink(magiclink)   │
                             │  POST /auth/v1/verify      │
                             └───────────────┬────────────┘
                                             │ Session
                                             ▼
                             ┌────────────────────────────┐
                             │ supabase.auth.setSession   │
                             │ → sessionStorage           │
                             └────────────────────────────┘
```

要点：

- **单租户登录门。** `APP_LOGIN_EMAIL` / `APP_LOGIN_PASSWORD` 使用常量时间哈希比较；失败会被
  限流（每 IP 每 5 分钟 10 次，按 serverless 实例计）。自助注册已移除，`jp_restrict_signups`
  会在数据库层拒绝白名单之外的新 `auth.users`。
- **服务端铸造标准 Supabase 会话。** `mintSessionForEmail()`
  （`src/lib/auth/mint-session.ts`）在用户不存在时先创建（自动确认、不发邮件），再调用
  `supabase.auth.admin.generateLink({ type: "magiclink" })` 拿到 6 位 `email_otp`，最后通过
  `POST {SUPABASE_URL}/auth/v1/verify` 换取 `access_token` / `refresh_token`。
- **会话存放在 `sessionStorage`。** 浏览器客户端（`src/lib/supabase/client.ts`）设置了
  `storage: window.sessionStorage`，因此会话是**按标签页隔离**的：刷新和站内跳转仍在，关闭
  标签页即失效。全程不使用 Cookie，这也是应用能在跨域 iframe 中正常工作的原因。
- **API 路由读取 Bearer token。** `getSessionUser(request)` 从 `apiFetch()` 附加的
  `Authorization: Bearer <access_token>` 头解析用户；路由守卫在客户端
  `src/app/(app)/layout.tsx`，项目没有 middleware。

---

## 3. 方案：Admin API → 注入 sessionStorage

1. 从 `NEXT_PUBLIC_SUPABASE_URL` 解析出 project ref（主机名第一段）。
2. 通过 Admin API 生成魔法链接 OTP：
   `supabase.auth.admin.generateLink({ type: "magiclink", email })` — **不会发送邮件**。
3. 用 REST 交换会话：
   `POST {SUPABASE_URL}/auth/v1/verify`，body 为
   `{ email, token: email_otp, type: "magiclink" }`，`APIKey` 头使用公开的 anon key。
4. 先访问一次应用以确定 origin，然后在**同一个标签页**把会话写入 `sessionStorage` 的
   `sb-<project_ref>-auth-token`，再跳转到受保护页面（`/matches`）。`@supabase/supabase-js`
   会像读取真实登录会话一样读取它。
5. 任何一步失败，或 `/matches` 被重定向到 `/login`，立即中止并且不截图。

> **不要用 Playwright 的 `storageState` 保存这个会话。** `storageState` 只能保存 Cookie 和
> `localStorage`，无法保存 `sessionStorage`。保存下来的 `auth-state.json` **不能**恢复本应用
> 的登录状态，必须每次运行重新注入。

---

## 4. `scripts/screenshot-with-auth.mjs` 内部实现

配置部分：

```javascript
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const APP_URL = process.env.APP_URL ?? "http://localhost:5200";

const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const AUTH_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;
```

流水线步骤：

| 步骤 | 作用 |
|---|---|
| 1. `getSessionFromAPI()` | `admin.generateLink({ type: "magiclink" })` → `email_otp` → `POST /auth/v1/verify` → 会话 JSON |
| 2. `loginWithSession()` | `page.goto(APP_URL)` → `sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))` → 跳转 `/matches` → 若跳回 `/login` 则中止 |
| 3. `captureScreenshots()` | 以 1440×900 访问 7 个路由，等待 1.5s，移除 toast/alert，写入 `screenshots/<name>.png` |
| 4. `injectReadme()` | 替换 `README.md` 与 `README-zh.md` 中的 `<!-- screenshots -->…<!-- /screenshots -->` 区块 |

截图的 7 个路由：`/`（首页）、`/login`、`/matches`、`/applications`、`/profile`、
`/onboarding`、`/usage`。

---

## 5. 运行方式

```bash
# 终端 1 — 启动开发服务器（需已安装 PLAYWRIGHT 依赖并执行过一次 npx playwright install chromium）
npm run dev

# 终端 2 — 需要 NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、
#          NEXT_PUBLIC_SUPABASE_ANON_KEY，以及可选的 APP_URL（默认 :5200）
node --env-file=.env.local scripts/screenshot-with-auth.mjs
```

预期输出（节选）：

```
🚀  JobPilot Screenshot Pipeline (sessionStorage-injection)

  STEP 1: Get session via Supabase REST API
  Generating OTP for jxjwilliam@gmail.com...
  ✅ Session obtained for user: jxjwilliam@gmail.com

  STEP 2: Inject session into sessionStorage and verify login
  ✅ Session stored in sessionStorage
  ✅ Login verified — on: http://localhost:5200/matches

  STEP 3: Capture screenshots
  📸 [home] http://localhost:5200/ ... ✅
  ...
```

副作用：在 `screenshots/` 生成 PNG，并刷新 `README.md` / `README-zh.md` 的截图表格。若登录
无法建立，脚本以退出码 1 结束且不生成任何截图。

---

## 6. 与 screenshot-ui skill 集成

`screenshot-ui` skill 对需要登录的应用直接驱动这个脚本：

1. 在 5200 端口启动开发服务器。
2. 运行 `node --env-file=.env.local scripts/screenshot-with-auth.mjs`。
3. 脚本完成认证、截取所有路由，并更新 README 标记区块。
4. `/demo-video` 可复用同一批 PNG — 见
   [`05-screenshot-demo-pipeline.md`](./05-screenshot-demo-pipeline.md)。

因为会话在第一次访问受保护页之前就已注入，所以不需要 `loginDelaySeconds` 之类的等待，也不需要
手动登录。

---

## 7. 替代方案：真实填写密码表单

由于登录页现在是真实的邮箱 + 密码表单，Playwright 也可以直接登录：

```javascript
await page.goto(`${APP_URL}/login`);
await page.fill('input[type="email"]', process.env.APP_LOGIN_EMAIL);
await page.fill('input[type="password"]', process.env.APP_LOGIN_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((url) => !url.pathname.startsWith("/login"));
```

这在单个浏览器上下文内可行（会话写入该标签页的 `sessionStorage`），但需要把
`APP_LOGIN_EMAIL` / `APP_LOGIN_PASSWORD` 放进截图环境。推荐使用 §3 的 Admin API 注入方式，
这样密码始终只存在于服务端登录路由中。

---

## 8. 常见问题排查

### "Missing SUPABASE env vars"

用 `node --env-file=.env.local …` 运行脚本，并确认
`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`
三个变量都已设置。

### `generateLink` 或 `/auth/v1/verify` 失败（403 / "Failed to generate session token"）

对**不存在的用户**调用 `generateLink` 会返回 signup 类型的 OTP，而 `/auth/v1/verify` 会拒绝它。
owner 账号必须已经存在：先通过 `/login` 登录一次（会走
`mintSessionForEmail()` → `admin.createUser()`），或像 `src/lib/auth/mint-session.ts` 那样在脚本里
显式调用 `createUser`。

### 注入后仍被重定向到 `/login`

说明会话 key 或 origin 不匹配。请检查：

- 是否在 `page.goto(APP_URL)` **之后**、且在同一标签页/页面里注入；
- key 是否为 `sb-<project_ref>-auth-token`（`<project_ref>` 来自 Supabase URL）；
- `APP_URL` 是否与应用实际 origin 一致（默认 `http://localhost:5200`）。

### 大约一小时后出现 401

Supabase access token 有效期为 3600 秒。脚本每次运行都会重新铸造会话，直接重跑即可，无需手动刷新。

### 端口不对 / "connection refused"

设置 `APP_URL=http://localhost:<端口> node --env-file=.env.local scripts/screenshot-with-auth.mjs`，
或用 `npm run dev` 启动开发服务器（端口 5200）。

### Admin API 会触发邮件频率限制吗？

不会 —— `generateLink` 不发送邮件。如果报错，请确认 admin 客户端使用的是
`SUPABASE_SERVICE_ROLE_KEY`，而不是 anon key。

---

## 9. 参考

| 代码文件 | 用途 |
|---|---|
| `src/app/(auth)/login/page.tsx` | 密码登录表单（无任何预填） |
| `src/app/api/auth/password-login/route.ts` | 常量时间凭据校验 + 限流；返回铸造好的会话 |
| `src/lib/auth/mint-session.ts` | 按需创建用户，并用 admin OTP 换取会话 |
| `src/lib/supabase/client.ts` | 浏览器客户端 — `sessionStorage`、PKCE、iframe 安全 |
| `src/lib/supabase/server.ts` | `getSessionUser()` — API 路由的 Bearer token 认证 |
| `src/lib/supabase/admin.ts` | 管理员客户端（service-role key） |
| `scripts/screenshot-with-auth.mjs` | 会话注入 + 7 路由截图流水线 |

**相关文档：** [`03-jobpilot-workflow-zh.md`](./03-jobpilot-workflow-zh.md)（运行时认证流程）·
[`05-screenshot-demo-pipeline.md`](./05-screenshot-demo-pipeline.md)（截图 → 演示视频）
