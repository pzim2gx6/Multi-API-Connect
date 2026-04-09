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

## 部署到 Replit

1. Fork 本项目到 Replit
2. 在 Replit Integrations 中添加 OpenAI 和 Anthropic AI 集成（自动注入环境变量，无需自备 Key）
3. 在 Replit Secrets 中添加：
   - `PROXY_API_KEY`：任意字符串，作为鉴权 Bearer Token
4. 运行项目，访问根路径查看 API 门户

## 技术栈

- **运行时**：Node.js 24 + TypeScript
- **框架**：Express 5
- **包管理**：pnpm workspaces (monorepo)
- **AI SDK**：openai ^6 + @anthropic-ai/sdk ^0.82
- **前端**：React + Vite（纯内联样式，无 UI 库依赖）
- **托管**：Replit（AI 调用费用计入 Replit 积分）
