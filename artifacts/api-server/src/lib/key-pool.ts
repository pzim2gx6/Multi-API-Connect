import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

function parseKeys(envMulti: string | undefined, envSingle: string | undefined): string[] {
  if (envMulti) {
    const keys = envMulti.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length > 0) return keys;
  }
  if (envSingle) return [envSingle];
  return [];
}

class OpenAIPool {
  private clients: OpenAI[];
  private index = 0;

  constructor() {
    const keys = parseKeys(process.env.OPENAI_API_KEYS, process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
    const baseURL = process.env.OPENAI_BASE_URL || process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

    if (keys.length === 0) {
      logger.warn("No OpenAI API keys configured");
      this.clients = [new OpenAI({ apiKey: "missing", baseURL })];
      return;
    }

    this.clients = keys.map((apiKey) => new OpenAI({ apiKey, baseURL }));
    logger.info(`OpenAI key pool initialized with ${keys.length} key(s)`);
  }

  next(): OpenAI {
    const client = this.clients[this.index];
    this.index = (this.index + 1) % this.clients.length;
    return client;
  }

  async callWithRetry<T>(fn: (client: OpenAI) => Promise<T>): Promise<T> {
    const total = this.clients.length;
    let lastErr: any;
    for (let attempt = 0; attempt < total; attempt++) {
      const client = this.next();
      try {
        return await fn(client);
      } catch (err: any) {
        lastErr = err;
        const status = err?.status ?? err?.statusCode;
        if (status === 429) {
          logger.warn({ attempt, total }, "OpenAI 429 rate limit, trying next key");
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }
}

class AnthropicPool {
  private clients: Anthropic[];
  private index = 0;

  constructor() {
    const keys = parseKeys(process.env.ANTHROPIC_API_KEYS, process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY);
    const baseURL = process.env.ANTHROPIC_BASE_URL || process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;

    if (keys.length === 0) {
      logger.warn("No Anthropic API keys configured");
      this.clients = [new Anthropic({ apiKey: "missing", baseURL })];
      return;
    }

    this.clients = keys.map((apiKey) => new Anthropic({ apiKey, baseURL }));
    logger.info(`Anthropic key pool initialized with ${keys.length} key(s)`);
  }

  next(): Anthropic {
    const client = this.clients[this.index];
    this.index = (this.index + 1) % this.clients.length;
    return client;
  }

  async callWithRetry<T>(fn: (client: Anthropic) => Promise<T>): Promise<T> {
    const total = this.clients.length;
    let lastErr: any;
    for (let attempt = 0; attempt < total; attempt++) {
      const client = this.next();
      try {
        return await fn(client);
      } catch (err: any) {
        lastErr = err;
        const status = err?.status ?? err?.statusCode;
        if (status === 429) {
          logger.warn({ attempt, total }, "Anthropic 429 rate limit, trying next key");
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }
}

export const openaiPool = new OpenAIPool();
export const anthropicPool = new AnthropicPool();
