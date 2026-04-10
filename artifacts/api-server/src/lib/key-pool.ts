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

/** 若配置了 EXTRA_PROXY_BASE_URL + EXTRA_PROXY_API_KEY，追加到账号列表末尾 */
function appendExtraProxy(accounts: Account[]): Account[] {
  const baseURL = process.env.EXTRA_PROXY_BASE_URL;
  const apiKey = process.env.EXTRA_PROXY_API_KEY;
  if (baseURL && apiKey) {
    return [...accounts, { baseURL, apiKey }];
  }
  return accounts;
}

class OpenAIPool {
  private clients: OpenAI[];
  private index = 0;

  constructor() {
    const base = parseAccounts(
      process.env.OPENAI_ACCOUNTS,
      process.env.OPENAI_API_KEYS,
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      process.env.OPENAI_BASE_URL ?? process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      "https://api.openai.com/v1"
    );
    const accounts = appendExtraProxy(base);

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
    const base = parseAccounts(
      process.env.ANTHROPIC_ACCOUNTS,
      process.env.ANTHROPIC_API_KEYS,
      process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
      process.env.ANTHROPIC_BASE_URL ?? process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      "https://api.anthropic.com"
    );
    const accounts = appendExtraProxy(base);

    if (accounts.length === 0) {
      logger.warn("No Anthropic accounts configured");
      this.clients = [new Anthropic({ apiKey: "missing" })];
      return;
    }

    this.clients = accounts.map(({ baseURL, apiKey }) => {
      // Anthropic SDK 自身会拼 /v1/messages，所以 baseURL 不能带 /v1 后缀
      const normalizedURL = baseURL.replace(/\/v1\/?$/, "");
      const host = new URL(normalizedURL).hostname;
      const isOfficialAnthropic = host === "api.anthropic.com";
      // Replit AI Integration 本地代理和第三方代理都期待 Authorization: Bearer，
      // 而 Anthropic SDK 默认只发 x-api-key，需手动补齐（官方 Anthropic 除外）
      const defaultHeaders: Record<string, string> =
        (!isOfficialAnthropic)
          ? { Authorization: `Bearer ${apiKey}` }
          : {};
      return new Anthropic({ baseURL: normalizedURL, apiKey, defaultHeaders });
    });
    logger.info(`Anthropic pool: ${accounts.length} account(s)`);
    accounts.forEach((a, i) => {
      const host = new URL(a.baseURL).hostname;
      const tag = host === "localhost" || host === "127.0.0.1" ? " [local-proxy]" : "";
      logger.info(`  [${i + 1}] ${host}${tag} / key=...${a.apiKey.slice(-6)}`);
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
