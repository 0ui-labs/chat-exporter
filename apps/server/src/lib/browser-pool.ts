import type { Browser, BrowserContext } from "playwright";
import { chromium } from "playwright";

import {
  BROWSER_IDLE_SHUTDOWN_MS,
  MAX_CONCURRENT_BROWSER_CONTEXTS,
} from "./constants.js";

export const MAX_CONTEXTS_PER_BROWSER = 50;

type QueueEntry = {
  resolve: (ctx: BrowserContext) => void;
  reject: (err: Error) => void;
};

let browser: Browser | null = null;
let launchPromise: Promise<Browser> | null = null;
let activeContextCount = 0;
let totalContextCount = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const queue: QueueEntry[] = [];

function clearIdleTimer() {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function scheduleIdleShutdown() {
  clearIdleTimer();
  idleTimer = setTimeout(async () => {
    if (activeContextCount === 0 && browser !== null) {
      const instance = browser;
      browser = null;
      totalContextCount = 0;
      await instance.close();
    }
  }, BROWSER_IDLE_SHUTDOWN_MS);
}

async function ensureBrowser(): Promise<Browser> {
  if (browser !== null) {
    return browser;
  }

  if (launchPromise !== null) {
    return launchPromise;
  }

  launchPromise = (async () => {
    const instance = await chromium.launch({ headless: true });
    instance.on("disconnected", () => {
      if (browser === instance) {
        browser = null;
        totalContextCount = 0;
      }
    });
    browser = instance;
    launchPromise = null;
    return instance;
  })();

  return launchPromise;
}

async function createContext(): Promise<BrowserContext> {
  if (
    totalContextCount >= MAX_CONTEXTS_PER_BROWSER &&
    activeContextCount === 0 &&
    browser !== null
  ) {
    const old = browser;
    browser = null;
    totalContextCount = 0;
    await old.close();
  }

  const instance = await ensureBrowser();
  clearIdleTimer();

  const ctx = await instance.newContext();
  activeContextCount++;
  totalContextCount++;
  return ctx;
}

export async function acquireContext(): Promise<BrowserContext> {
  if (activeContextCount >= MAX_CONCURRENT_BROWSER_CONTEXTS) {
    return new Promise<BrowserContext>((resolve, reject) => {
      queue.push({ resolve, reject });
    });
  }

  return createContext();
}

export async function releaseContext(context: BrowserContext): Promise<void> {
  await context.close();
  activeContextCount--;

  if (queue.length > 0) {
    const next = queue.shift()!;
    try {
      const ctx = await createContext();
      next.resolve(ctx);
    } catch (err) {
      next.reject(err instanceof Error ? err : new Error(String(err)));
    }
  } else if (activeContextCount === 0) {
    scheduleIdleShutdown();
  }
}

export async function shutdownPool(): Promise<void> {
  clearIdleTimer();

  while (queue.length > 0) {
    const entry = queue.shift()!;
    entry.reject(new Error("Pool shut down"));
  }

  if (browser !== null) {
    const instance = browser;
    browser = null;
    await instance.close();
  }

  launchPromise = null;
  activeContextCount = 0;
  totalContextCount = 0;
}

export function getPoolStats() {
  return {
    activeContexts: activeContextCount,
    queueLength: queue.length,
    browserConnected: browser !== null,
    totalContextsServed: totalContextCount,
  };
}
