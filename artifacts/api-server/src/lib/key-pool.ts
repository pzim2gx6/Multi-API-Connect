import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

interface Account {
  baseURL: string;
  apiKey: string;
}

function parseAccounts(
  envAccounts: string | undefined,
  envMultiKeys: string | undefined,
  envSingleKey: string | undefined,
  envBaseURL: string | undefined,
  defaultBaseURL: string
): Account[] {
  // Priority 1: OPENAI_ACCOUNTS / ANTHROPIC_ACCOUNTS — "url|key,url|key,..."
  if (envAccounts) {
    const accounts = envAccounts
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const sep = s.indexOf("|");
        if (sep === -1) return null;
        return { baseURL: s.slice(0, sep).trim(), apiKey: s.slice(sep + 1).trim() };
      })
      .filter((a): a is Account => a !== null && Boolean(a.baseURL) && Boolean(a.apiKey));

    if (accounts.length > 0) return accounts;
  }

  // Priority 2: OPENAI_API_KEYS / ANTHROPIC_API_KEYS — multiple keys, single base URL
  if (envMultiKeys) {
    const base = envBaseURL || defaultBaseURL;
    const keys = envMultiKeys.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length > 0) return keys.map((apiKey) => ({ baseURL: base, apiKey }));
  }

  // Priority 3: single key env var (Replit AI Integration or manual)
  if (envSingleKey) {
    return [{ baseURL: envBaseURL || defaultBaseURL, apiKey: envSingleKey }];
  }

  return [];
}

class OpenAIPool {
  private clients: OpenAI[];
  private index = 0;

  constructor() {
    const accounts = parseAccounts(
      process.env.OPENAI_ACCOUNTS,
      process.env.OPENAI_API_KEYS,
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      process.env.OPENAI_BASE_URL ?? process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      "https://api.openai.com/v1"
    );

    if (accounts.length === 0) {
      logger.warn("No OpenAI accounts configured");
      this.clients = [new OpenAI({ apiKey: "missing" })];
      return;
    }

    this.clients = accounts.map(({ baseURL, apiKey }) => new OpenAI({ baseURL, apiKey }));
    logger.info(`OpenAI pool: ${accounts.length} account(s)`);
    accounts.forEach((a, i) => {
      const host = new URL(a.baseURL).hostname;
      logger.info(`  [${i + 1}] ${host} / key=...${a.apiKey.slice(-6)}`);
    });
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
          logger.warn({ attempt: attempt + 1, total }, "OpenAI 429 — switching to next account");
          continue;
        }
        if (status === 401) {
          logger.warn({ attempt: attempt + 1, total }, "OpenAI 401 — switching to next account");
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
    const accounts = parseAccounts(
      process.env.ANTHROPIC_ACCOUNTS,
      process.env.ANTHROPIC_API_KEYS,
      process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
      process.env.ANTHROPIC_BASE_URL ?? process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      "https://api.anthropic.com"
    );

    if (accounts.length === 0) {
      logger.warn("No Anthropic accounts configured");
      this.clients = [new Anthropic({ apiKey: "missing" })];
      return;
    }

    this.clients = accounts.map(({ baseURL, apiKey }) => {
      const host = new URL(baseURL).hostname;
      const isLocalReplit = host === "localhost" || host === "127.0.0.1";
      const isOfficialAnthropic = host === "api.anthropic.com";
      // 对于第三方代理（既不是本地 Replit Integration，也不是官方 Anthropic），
      // 同时发 Authorization: Bearer 头，兼容那些只认 Bearer 格式的代理
      const defaultHeaders: Record<string, string> =
        (!isLocalReplit && !isOfficialAnthropic)
          ? { "Authorization": `Bearer ${apiKey}` }
          : {};
      return new Anthropic({ baseURL, apiKey, defaultHeaders });
    });
    logger.info(`Anthropic pool: ${accounts.length} account(s)`);
    accounts.forEach((a, i) => {
      const host = new URL(a.baseURL).hostname;
      logger.info(`  [${i + 1}] ${host} / key=...${a.apiKey.slice(-6)}`);
    });
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
          logger.warn({ attempt: attempt + 1, total }, "Anthropic 429 — switching to next account");
          continue;
        }
        if (status === 401) {
          const errDetail = err?.error?.message || err?.message || JSON.stringify(err).slice(0, 200);
          logger.warn({ attempt: attempt + 1, total, detail: errDetail }, "Anthropic 401 — switching to next account");
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
