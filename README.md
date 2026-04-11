# Multi API Connect

OpenAI + Anthropic 双兼容反代 API，基于 Replit pnpm monorepo 构建。无需提供自己的 API Key，费用计入 Replit 积分。

## 功能特性

- **双协议兼容**：同时支持 OpenAI 和 Anthropic 两种请求格式
- **自动格式转换**：Claude 模型可通过 `/v1/chat/completions` 调用；GPT/o 系列可通过 `/v1/messages` 调用
- **完整 Tool Call 支持**：工具调用双向格式转换
- **流式输出（SSE）**：支持 stream 模式，每 5 秒发送 keepalive 防断线
- **Bearer Token 鉴权**：通过 `PROXY_API_KEY` 保护接口
- **前端门户**：内置 API 文档页面，含 CherryStudio 配置指引

## 支持模型

| 模型 | 提供商 |
|------|--------|
| gpt-5.2 | OpenAI |
| gpt-5-mini | OpenAI |
| gpt-5-nano | OpenAI |
| o4-mini | OpenAI |
| o3 | OpenAI |
| claude-opus-4-6 | Anthropic |
| claude-sonnet-4-6 | Anthropic |
| claude-haiku-4-5 | Anthropic |

## API 接口

### 鉴权

所有接口需在请求头中携带：

```
Authorization: Bearer YOUR_PROXY_API_KEY
```

### GET /v1/models

返回可用模型列表（OpenAI 格式）。

### POST /v1/chat/completions

OpenAI 兼容接口，支持所有模型。Claude 模型请求自动转换为 Anthropic 格式。

```bash
curl https://your-domain/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_PROXY_API_KEY" \
  -d '{
    "model": "gpt-5.2",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### POST /v1/messages

Anthropic Messages API 原生接口，支持所有模型。GPT/o 系列模型请求自动转换为 OpenAI 格式。

```bash
curl https://your-domain/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_PROXY_API_KEY" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 在 CherryStudio 中使用

1. 打开 CherryStudio **设置 → 模型服务 → 添加服务**
2. 将 API Base URL 设置为 `https://your-domain/v1`，提供商类型选 OpenAI 或 Anthropic
3. API Key 填入你的 `PROXY_API_KEY`
4. 选择模型，开始对话

---

## 自部署教程

### 方案一：部署到 Replit（推荐，无需自备 API Key）

Replit 提供托管的 OpenAI 和 Anthropic 代理（费用计入 Replit 积分），无需注册 OpenAI/Anthropic 账号。

**前置条件**

- Replit 账号（Deploy 功能需要 Core 订阅）

**步骤**

1. **Fork 项目**

   在 Replit 中打开本仓库，点击右上角 **Fork** 按钮，复制到自己账号下。

     > **💡 统一域名格式**
     > Fork 完成后，将项目名称改为 `api-connector`（Replit 顶部菜单 → 项目名称旁的铅笔图标）。
     > 这样部署后你的访问地址将固定为：
     > `https://api-connector--你的用户名.replit.app`
     > 所有人按此规范命名，域名前缀就完全统一。

2. **添加 AI Integrations**

   进入项目 → 左侧菜单 **Integrations（集成）**，分别搜索并添加：
   - **OpenAI** AI Integration
   - **Anthropic** AI Integration

   添加后 Replit 自动注入以下环境变量，无需手动填写：
   ```
   AI_INTEGRATIONS_OPENAI_BASE_URL
   AI_INTEGRATIONS_OPENAI_API_KEY
   AI_INTEGRATIONS_ANTHROPIC_BASE_URL
   AI_INTEGRATIONS_ANTHROPIC_API_KEY
   ```

3. **设置 Secrets**

   进入项目 → **Secrets**，添加：

   | 变量名 | 说明 |
   |--------|------|
   | `PROXY_API_KEY` | 自定义字符串，用于鉴权，填入客户端的 API Key 字段 |

4. **启动并部署**

   - 点击顶部 **Run** 运行开发环境，验证接口正常
   - 点击 **Deploy** → **Autoscale** 部署到生产，获得永久访问地址

---

### 方案二：部署到其他平台（需自备 API Key）

适合 Railway、Render、Fly.io、VPS 等任意 Node.js 环境。需要自己提供 OpenAI 和 Anthropic 的 API Key。

**前置条件**

- Node.js 18 或以上
- pnpm（安装：`npm install -g pnpm`）
- OpenAI API Key（在 [platform.openai.com](https://platform.openai.com) 获取）
- Anthropic API Key（在 [console.anthropic.com](https://console.anthropic.com) 获取）

**环境变量**

部署时必须设置以下环境变量（单账号最少 5 个，多账号见下方说明）：

**单账号配置**

| 变量名 | 值 |
|--------|-----|
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | `https://api.openai.com/v1` |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | 你的 OpenAI API Key |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | `https://api.anthropic.com` |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | 你的 Anthropic API Key |
| `PROXY_API_KEY` | 自定义字符串，用于鉴权 |

**多账号配置（合并多个账号的额度）**

支持三种方式，按优先级从高到低，选一种填写即可：

---

**方式一：多账号配对（支持不同 Base URL，适合合并多个 Replit 项目的积分）**

格式为 `BASE_URL|API_KEY`，多组之间用逗号分隔：

```bash
OPENAI_ACCOUNTS=https://proxy-a.replit.app/v1|sk-account-a...,https://proxy-b.replit.app/v1|sk-account-b...
ANTHROPIC_ACCOUNTS=https://proxy-a.replit.app|sk-ant-account-a...,https://proxy-b.replit.app|sk-ant-account-b...
PROXY_API_KEY=your-secret-key
```

> 如何获取其他 Replit 项目的凭证：在那个项目的 Shell 中执行：
> ```bash
> echo "$AI_INTEGRATIONS_OPENAI_BASE_URL|$AI_INTEGRATIONS_OPENAI_API_KEY"
> echo "$AI_INTEGRATIONS_ANTHROPIC_BASE_URL|$AI_INTEGRATIONS_ANTHROPIC_API_KEY"
> ```
> 复制输出的字符串，按格式填入 `OPENAI_ACCOUNTS` / `ANTHROPIC_ACCOUNTS`。

---

**方式二：多 Key 单 Base URL（适合同一供应商的多个账号）**

```bash
OPENAI_API_KEYS=sk-account-a...,sk-account-b...,sk-account-c...
OPENAI_BASE_URL=https://api.openai.com/v1
ANTHROPIC_API_KEYS=sk-ant-account-a...,sk-ant-account-b...
ANTHROPIC_BASE_URL=https://api.anthropic.com
PROXY_API_KEY=your-secret-key
```

---

**方式三：单账号（默认，Replit AI Integration 自动注入）**

```bash
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1
AI_INTEGRATIONS_OPENAI_API_KEY=sk-...
AI_INTEGRATIONS_ANTHROPIC_BASE_URL=https://api.anthropic.com
AI_INTEGRATIONS_ANTHROPIC_API_KEY=sk-ant-...
PROXY_API_KEY=your-secret-key
```

---

三种方式的负载逻辑相同：请求按**轮询（Round-Robin）**分配，某个账号返回 429 限速时自动切换下一个账号重试。

**本地运行**

```bash
# 克隆项目
git clone https://github.com/pzim2gx6/Multi-API-Connect.git
cd Multi-API-Connect

# 安装依赖
pnpm install

# 复制环境变量模板
cp .env.example .env
# 编辑 .env，填入上方所有变量

# 启动 API 服务（端口默认读取 $PORT，未设置时为 3000）
pnpm --filter @workspace/api-server run dev

# 另开一个终端启动前端门户（可选）
pnpm --filter @workspace/api-portal run dev
```

**生产构建**

```bash
# 构建 API 服务
pnpm --filter @workspace/api-server run build

# 启动生产服务
pnpm --filter @workspace/api-server run start
```

**部署到 Railway**

1. 在 [railway.app](https://railway.app) 新建项目，选择 **Deploy from GitHub repo**
2. 连接本仓库
3. 在 **Variables** 面板填入上方 5 个环境变量
4. Railway 自动检测 pnpm 并完成构建，部署完成后获得访问域名

**部署到 Render**

1. 在 [render.com](https://render.com) 新建 **Web Service**，连接本仓库
2. 设置：
   - **Build Command**：`pnpm install && pnpm --filter @workspace/api-server run build`
   - **Start Command**：`pnpm --filter @workspace/api-server run start`
3. 在 **Environment** 面板填入上方 5 个环境变量

**部署到 VPS / 自有服务器**

```bash
# 安装 Node.js 18+ 和 pnpm（以 Ubuntu 为例）
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pnpm

# 克隆并构建
git clone https://github.com/pzim2gx6/Multi-API-Connect.git
cd Multi-API-Connect
pnpm install
pnpm --filter @workspace/api-server run build

# 配置环境变量（以 systemd 为例，也可使用 .env 文件 + dotenv）
export AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1
export AI_INTEGRATIONS_OPENAI_API_KEY=sk-...
export AI_INTEGRATIONS_ANTHROPIC_BASE_URL=https://api.anthropic.com
export AI_INTEGRATIONS_ANTHROPIC_API_KEY=sk-ant-...
export PROXY_API_KEY=your-secret-key
export PORT=3000

# 启动服务
pnpm --filter @workspace/api-server run start

# 建议配合 nginx 反向代理 + pm2 保活
```

**使用 pm2 保活（推荐）**

```bash
npm install -g pm2

# 启动
PORT=3000 \
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1 \
AI_INTEGRATIONS_OPENAI_API_KEY=sk-... \
AI_INTEGRATIONS_ANTHROPIC_BASE_URL=https://api.anthropic.com \
AI_INTEGRATIONS_ANTHROPIC_API_KEY=sk-ant-... \
PROXY_API_KEY=your-secret-key \
pm2 start "pnpm --filter @workspace/api-server run start" --name multi-api-connect

# 设置开机自启
pm2 save && pm2 startup
```

---

### 验证部署是否成功

服务启动后，运行以下命令，返回 HTTP 200 和模型列表即为成功：

```bash
curl https://your-domain/v1/models \
  -H "Authorization: Bearer YOUR_PROXY_API_KEY"
```

---

## 技术栈

- **运行时**：Node.js 18+ + TypeScript
- **框架**：Express 5
- **包管理**：pnpm workspaces (monorepo)
- **AI SDK**：openai ^6 + @anthropic-ai/sdk ^0.82
- **前端**：React + Vite（纯内联样式，无 UI 库依赖）
- **托管**：Replit（AI 调用费用计入 Replit 积分）
