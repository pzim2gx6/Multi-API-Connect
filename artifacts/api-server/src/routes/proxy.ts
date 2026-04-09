import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { openaiPool, anthropicPool } from "../lib/key-pool";

const proxyRouter: Router = Router();

const PROXY_API_KEY = process.env.PROXY_API_KEY || "";

const MODELS = [
  { id: "gpt-5.2", provider: "openai" },
  { id: "gpt-5-mini", provider: "openai" },
  { id: "gpt-5-nano", provider: "openai" },
  { id: "o4-mini", provider: "openai" },
  { id: "o3", provider: "openai" },
  { id: "claude-opus-4-6", provider: "anthropic" },
  { id: "claude-sonnet-4-6", provider: "anthropic" },
  { id: "claude-haiku-4-5", provider: "anthropic" },
];

function verifyToken(req: Request, res: Response): boolean {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ") || auth.slice(7) !== PROXY_API_KEY) {
    res.status(401).json({ error: { message: "Invalid or missing API key", type: "authentication_error" } });
    return false;
  }
  return true;
}

function isOpenAIModel(model: string): boolean {
  return model.startsWith("gpt-") || model.startsWith("o");
}

function convertToolsToAnthropic(tools: any[]): any[] {
  return tools.map((t: any) => ({
    name: t.function.name,
    description: t.function.description || "",
    input_schema: t.function.parameters || { type: "object", properties: {} },
  }));
}

function convertToolsToOpenAI(tools: any[]): any[] {
  return tools.map((t: any) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description || "",
      parameters: t.input_schema || { type: "object", properties: {} },
    },
  }));
}

function convertToolChoiceToAnthropic(tc: any): any {
  if (!tc) return undefined;
  if (tc === "auto") return { type: "auto" };
  if (tc === "none") return { type: "auto" };
  if (tc === "required") return { type: "any" };
  if (typeof tc === "object" && tc.function?.name) {
    return { type: "tool", name: tc.function.name };
  }
  return { type: "auto" };
}

function convertToolChoiceToOpenAI(tc: any): any {
  if (!tc) return undefined;
  if (tc.type === "auto") return "auto";
  if (tc.type === "any") return "required";
  if (tc.type === "tool" && tc.name) {
    return { type: "function", function: { name: tc.name } };
  }
  return "auto";
}

function convertMessagesToAnthropic(messages: any[]): { system: string | undefined; messages: any[] } {
  let system: string | undefined;
  const converted: any[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      system = (system ? system + "\n" : "") + (typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
      continue;
    }
    if (msg.role === "tool") {
      converted.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.tool_call_id || "unknown",
            content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
          },
        ],
      });
      continue;
    }
    if (msg.role === "assistant" && msg.tool_calls) {
      const content: any[] = [];
      if (msg.content) {
        content.push({ type: "text", text: msg.content });
      }
      for (const tc of msg.tool_calls) {
        let input: any;
        try {
          input = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
        } catch {
          input = {};
        }
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input,
        });
      }
      converted.push({ role: "assistant", content });
      continue;
    }
    converted.push({ role: msg.role, content: msg.content });
  }

  return { system, messages: converted };
}

function convertAnthropicResponseToOpenAI(anthropicResp: any, model: string): any {
  const choices: any[] = [];
  const toolCalls: any[] = [];
  let textContent = "";

  for (const block of anthropicResp.content || []) {
    if (block.type === "text") {
      textContent += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  const finishReason = anthropicResp.stop_reason === "tool_use" ? "tool_calls" : "stop";
  const message: any = { role: "assistant", content: textContent || null };
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  choices.push({
    index: 0,
    message,
    finish_reason: finishReason,
  });

  return {
    id: anthropicResp.id || `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices,
    usage: {
      prompt_tokens: anthropicResp.usage?.input_tokens || 0,
      completion_tokens: anthropicResp.usage?.output_tokens || 0,
      total_tokens: (anthropicResp.usage?.input_tokens || 0) + (anthropicResp.usage?.output_tokens || 0),
    },
  };
}

proxyRouter.get("/models", (req: Request, res: Response) => {
  if (!verifyToken(req, res)) return;
  res.json({
    object: "list",
    data: MODELS.map((m) => ({
      id: m.id,
      object: "model",
      created: 1700000000,
      owned_by: m.provider,
    })),
  });
});

proxyRouter.post("/chat/completions", async (req: Request, res: Response) => {
  if (!verifyToken(req, res)) return;

  const { model, messages, stream, tools, tool_choice, ...rest } = req.body;
  if (!model || !messages) {
    res.status(400).json({ error: { message: "model and messages are required" } });
    return;
  }

  try {
    if (isOpenAIModel(model)) {
      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const keepalive = setInterval(() => {
          try { res.write(": keepalive\n\n"); (res as any).flush?.(); } catch {}
        }, 5000);

        req.on("close", () => clearInterval(keepalive));

        try {
          const openaiStream = await openaiPool.callWithRetry((c) =>
            c.chat.completions.create({
              model,
              messages,
              stream: true,
              ...(tools ? { tools } : {}),
              ...(tool_choice ? { tool_choice } : {}),
              ...rest,
            })
          );

          for await (const chunk of openaiStream) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            (res as any).flush?.();
          }
          res.write("data: [DONE]\n\n");
          (res as any).flush?.();
        } finally {
          clearInterval(keepalive);
          res.end();
        }
      } else {
        const response = await openaiPool.callWithRetry((c) =>
          c.chat.completions.create({
            model,
            messages,
            stream: false,
            ...(tools ? { tools } : {}),
            ...(tool_choice ? { tool_choice } : {}),
            ...rest,
          })
        );
        res.json(response);
      }
    } else {
      const { system, messages: anthropicMessages } = convertMessagesToAnthropic(messages);
      const anthropicParams: any = {
        model,
        messages: anthropicMessages,
        max_tokens: rest.max_tokens || rest.max_completion_tokens || 4096,
      };
      if (system) anthropicParams.system = system;
      if (tools) anthropicParams.tools = convertToolsToAnthropic(tools);
      if (tool_choice) anthropicParams.tool_choice = convertToolChoiceToAnthropic(tool_choice);

      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const keepalive = setInterval(() => {
          try { res.write(": keepalive\n\n"); (res as any).flush?.(); } catch {}
        }, 5000);

        req.on("close", () => clearInterval(keepalive));

        const chatId = `chatcmpl-${Date.now()}`;
        let toolCallIndex = -1;

        try {
          const anthropicStream = anthropicPool.next().messages.stream(anthropicParams);

          anthropicStream.on("error", (err: any) => {
            logger.error({ err }, "Anthropic stream error (chat/completions)");
            try {
              res.write(`data: ${JSON.stringify({ error: { message: err.message || "Stream error", type: "stream_error" } })}\n\n`);
              res.write("data: [DONE]\n\n");
              (res as any).flush?.();
            } catch {}
          });

          anthropicStream.on("contentBlockStart", (event: any) => {
            if (event.content_block.type === "text") {
              const chunk = {
                id: chatId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
              };
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
              (res as any).flush?.();
            } else if (event.content_block.type === "tool_use") {
              toolCallIndex++;
              toolCallArgs[toolCallIndex] = "";
              const chunk = {
                id: chatId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                  index: 0,
                  delta: {
                    tool_calls: [{
                      index: toolCallIndex,
                      id: event.content_block.id,
                      type: "function",
                      function: { name: event.content_block.name, arguments: "" },
                    }],
                  },
                  finish_reason: null,
                }],
              };
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
              (res as any).flush?.();
            }
          });

          anthropicStream.on("contentBlockDelta", (event: any) => {
            if (event.delta.type === "text_delta") {
              const chunk = {
                id: chatId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: { content: event.delta.text }, finish_reason: null }],
              };
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
              (res as any).flush?.();
            } else if (event.delta.type === "input_json_delta") {
              const chunk = {
                id: chatId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                  index: 0,
                  delta: {
                    tool_calls: [{
                      index: toolCallIndex,
                      function: { arguments: event.delta.partial_json },
                    }],
                  },
                  finish_reason: null,
                }],
              };
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
              (res as any).flush?.();
            }
          });

          anthropicStream.on("contentBlockStop", () => {});

          const finalMessage = await anthropicStream.finalMessage();
          const finishReason = finalMessage.stop_reason === "tool_use" ? "tool_calls" : "stop";

          const doneChunk = {
            id: chatId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
          };
          res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
          res.write("data: [DONE]\n\n");
          (res as any).flush?.();
        } finally {
          clearInterval(keepalive);
          res.end();
        }
      } else {
        const finalMessage = await anthropicPool.callWithRetry((c) =>
          c.messages.stream(anthropicParams).finalMessage()
        );
        const openaiResponse = convertAnthropicResponseToOpenAI(finalMessage, model);
        res.json(openaiResponse);
      }
    }
  } catch (err: any) {
    logger.error({ err }, "Proxy chat/completions error");
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        error: { message: err.message || "Internal server error", type: "proxy_error" },
      });
    }
  }
});

function convertOpenAIMessagesToAnthropic(messages: any[]): any[] {
  return messages.map((msg: any) => {
    if (msg.role === "user") {
      if (Array.isArray(msg.content)) {
        return { role: "user", content: msg.content };
      }
      return { role: "user", content: msg.content };
    }
    if (msg.role === "assistant") {
      if (msg.tool_calls) {
        const content: any[] = [];
        if (msg.content) content.push({ type: "text", text: msg.content });
        for (const tc of msg.tool_calls) {
          let input: any;
          try {
            input = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
          } catch { input = {}; }
          content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
        }
        return { role: "assistant", content };
      }
      return { role: "assistant", content: msg.content };
    }
    if (msg.role === "tool") {
      return {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: msg.tool_call_id, content: msg.content }],
      };
    }
    return msg;
  });
}

function convertAnthropicMessagesToOpenAI(messages: any[]): any[] {
  const result: any[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      if (Array.isArray(msg.content)) {
        const toolResults = msg.content.filter((b: any) => b.type === "tool_result");
        const otherContent = msg.content.filter((b: any) => b.type !== "tool_result");
        for (const tr of toolResults) {
          result.push({
            role: "tool",
            tool_call_id: tr.tool_use_id,
            content: typeof tr.content === "string" ? tr.content : JSON.stringify(tr.content),
          });
        }
        if (otherContent.length > 0) {
          result.push({ role: "user", content: otherContent });
        }
      } else {
        result.push({ role: "user", content: msg.content });
      }
    } else if (msg.role === "assistant") {
      if (Array.isArray(msg.content)) {
        const toolUses = msg.content.filter((b: any) => b.type === "tool_use");
        const textBlocks = msg.content.filter((b: any) => b.type === "text");
        const textContent = textBlocks.map((b: any) => b.text).join("");
        if (toolUses.length > 0) {
          result.push({
            role: "assistant",
            content: textContent || null,
            tool_calls: toolUses.map((tu: any) => ({
              id: tu.id,
              type: "function",
              function: { name: tu.name, arguments: JSON.stringify(tu.input) },
            })),
          });
        } else {
          result.push({ role: "assistant", content: textContent });
        }
      } else {
        result.push({ role: "assistant", content: msg.content });
      }
    } else {
      result.push(msg);
    }
  }
  return result;
}

function convertOpenAIResponseToAnthropic(openaiResp: any): any {
  const choice = openaiResp.choices?.[0];
  if (!choice) return { id: openaiResp.id, type: "message", role: "assistant", content: [], model: openaiResp.model, stop_reason: "end_turn", usage: { input_tokens: 0, output_tokens: 0 } };

  const content: any[] = [];
  if (choice.message.content) {
    content.push({ type: "text", text: choice.message.content });
  }
  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let input: any;
      try { input = JSON.parse(tc.function.arguments); } catch { input = {}; }
      content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
    }
  }

  const stopReason = choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn";

  return {
    id: openaiResp.id || `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    content,
    model: openaiResp.model,
    stop_reason: stopReason,
    usage: {
      input_tokens: openaiResp.usage?.prompt_tokens || 0,
      output_tokens: openaiResp.usage?.completion_tokens || 0,
    },
  };
}

proxyRouter.post("/messages", async (req: Request, res: Response) => {
  if (!verifyToken(req, res)) return;

  const { model, messages, system, tools, tool_choice, max_tokens, stream, ...rest } = req.body;

  if (!model || !messages) {
    res.status(400).json({ error: { message: "model and messages are required", type: "invalid_request_error" } });
    return;
  }

  try {
    if (!isOpenAIModel(model)) {
      const params: any = {
        model,
        messages,
        max_tokens: max_tokens || 4096,
        ...rest,
      };
      if (system) params.system = system;
      if (tools) params.tools = tools;
      if (tool_choice) params.tool_choice = tool_choice;

      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const keepalive = setInterval(() => {
          try { res.write(": keepalive\n\n"); (res as any).flush?.(); } catch {}
        }, 5000);

        req.on("close", () => clearInterval(keepalive));

        try {
          // 直接迭代原始 SSE 事件并透传，支持 401/429 自动换账号
          const rawStream = await anthropicPool.callWithRetry((c) =>
            c.messages.create({ ...(params as any), stream: true }) as any
          );

          for await (const event of rawStream as any) {
            res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
            (res as any).flush?.();
          }
        } catch (streamErr: any) {
          logger.error({ err: streamErr }, "Anthropic stream error (messages)");
          try {
            res.write(`event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "stream_error", message: streamErr.message || "Stream error" } })}\n\n`);
            (res as any).flush?.();
          } catch {}
        } finally {
          clearInterval(keepalive);
          res.end();
        }
      } else {
        const finalMessage = await anthropicPool.callWithRetry((c) =>
          c.messages.stream(params).finalMessage()
        );
        res.json(finalMessage);
      }
    } else {
      const openaiMessages: any[] = [];
      if (system) {
        openaiMessages.push({ role: "system", content: typeof system === "string" ? system : system.map((s: any) => s.text || s).join("\n") });
      }
      openaiMessages.push(...convertAnthropicMessagesToOpenAI(messages));

      const openaiParams: any = {
        model,
        messages: openaiMessages,
      };
      if (tools) openaiParams.tools = convertToolsToOpenAI(tools);
      if (tool_choice) openaiParams.tool_choice = convertToolChoiceToOpenAI(tool_choice);
      if (max_tokens) openaiParams.max_completion_tokens = max_tokens;

      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const keepalive = setInterval(() => {
          try { res.write(": keepalive\n\n"); (res as any).flush?.(); } catch {}
        }, 5000);

        req.on("close", () => clearInterval(keepalive));

        const msgId = `msg_${Date.now()}`;
        let toolCallIndex = -1;
        let inputTokens = 0;
        let outputTokens = 0;
        let contentBlockIndex = 0;

        try {
          const openaiStream = await openaiPool.callWithRetry((c) =>
            c.chat.completions.create({
              ...openaiParams,
              stream: true,
              stream_options: { include_usage: true },
            })
          );

          res.write(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: msgId, type: "message", role: "assistant", content: [], model, stop_reason: null, usage: { input_tokens: 0, output_tokens: 0 } } })}\n\n`);
          (res as any).flush?.();

          let textBlockStarted = false;
          let lastFinishReason: string | null = null;

          for await (const chunk of openaiStream) {
            if (chunk.usage) {
              inputTokens = chunk.usage.prompt_tokens || 0;
              outputTokens = chunk.usage.completion_tokens || 0;
            }

            const choice = chunk.choices?.[0];
            if (!choice) continue;

            if (choice.finish_reason) {
              lastFinishReason = choice.finish_reason;
            }

            const delta = choice.delta;
            if (!delta) continue;

            if (delta.content) {
              if (!textBlockStarted) {
                res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: contentBlockIndex, content_block: { type: "text", text: "" } })}\n\n`);
                textBlockStarted = true;
              }
              res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: contentBlockIndex, delta: { type: "text_delta", text: delta.content } })}\n\n`);
              (res as any).flush?.();
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.id) {
                  if (textBlockStarted) {
                    res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: contentBlockIndex })}\n\n`);
                    contentBlockIndex++;
                    textBlockStarted = false;
                  }
                  toolCallIndex++;
                  res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: contentBlockIndex, content_block: { type: "tool_use", id: tc.id, name: tc.function?.name || "", input: {} } })}\n\n`);
                  (res as any).flush?.();
                }
                if (tc.function?.arguments) {
                  res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: contentBlockIndex, delta: { type: "input_json_delta", partial_json: tc.function.arguments } })}\n\n`);
                  (res as any).flush?.();
                }
              }
            }
          }

          if (textBlockStarted || toolCallIndex >= 0) {
            res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: contentBlockIndex })}\n\n`);
          }

          const stopReason = lastFinishReason === "tool_calls" ? "tool_use" : "end_turn";
          res.write(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: stopReason }, usage: { output_tokens: outputTokens } })}\n\n`);
          res.write(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
          (res as any).flush?.();
        } finally {
          clearInterval(keepalive);
          res.end();
        }
      } else {
        const openaiResp = await openaiPool.callWithRetry((c) =>
          c.chat.completions.create({ ...openaiParams, stream: false })
        );
        const anthropicResp = convertOpenAIResponseToAnthropic(openaiResp);
        res.json(anthropicResp);
      }
    }
  } catch (err: any) {
    logger.error({ err }, "Proxy messages error");
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        error: { message: err.message || "Internal server error", type: "proxy_error" },
      });
    }
  }
});

export default proxyRouter;
