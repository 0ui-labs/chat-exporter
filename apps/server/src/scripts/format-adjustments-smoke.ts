import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import type { Conversation, ImportJob } from "@chat-exporter/shared";
import Database from "better-sqlite3";
import { chromium } from "playwright";

import {
  conversationToHandover,
  conversationToMarkdown,
  conversationWordCount
} from "../lib/conversation-artifacts.js";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const projectRoot = path.resolve(scriptDir, "../../../..");
const outputDir = path.resolve(projectRoot, "apps/server/output/playwright");
const dbPath = path.join(outputDir, "format-adjustments-smoke.db");
const failureScreenshotPath = path.join(outputDir, "format-adjustments-smoke-failure.png");
const tsxLoaderPath = path.join(projectRoot, "apps/server/node_modules/tsx/dist/loader.mjs");
const serverEntryPath = path.join(projectRoot, "apps/server/src/index.ts");
const viteCliPath = path.join(projectRoot, "apps/web/node_modules/vite/bin/vite.js");
const serverPort = Number(process.env.SMOKE_SERVER_PORT ?? 8791);
const webPort = Number(process.env.SMOKE_WEB_PORT ?? 4176);
const serverUrl = `http://127.0.0.1:${serverPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const fixtureImportId = "smoke-format-adjustments-v1";

type ManagedChild = {
  label: string;
  process: ChildProcessWithoutNullStreams;
  tail: string[];
};

function createFixtureConversation(): Conversation {
  return {
    id: "conversation-smoke-format-adjustments",
    title: "Format adjustments smoke fixture",
    source: {
      platform: "chatgpt",
      url: "https://chatgpt.com/share/smoke-format-adjustments"
    },
    messages: [
      {
        id: "user-1",
        role: "user",
        blocks: [
          {
            type: "paragraph",
            text: "Please draft the release rollout checklist."
          }
        ]
      },
      {
        id: "assistant-1",
        role: "assistant",
        blocks: [
          {
            type: "heading",
            level: 2,
            text: "Project plan"
          },
          {
            type: "paragraph",
            text: "Important: check the logs before deploying."
          },
          {
            type: "paragraph",
            text: "Reminder: keep the rollback command handy."
          },
          {
            type: "list",
            ordered: false,
            items: ["Validate staging metrics", "Notify support before rollout"]
          },
          {
            type: "paragraph",
            text: "**Wichtig für den Launch:** Zuständigkeiten müssen sichtbar bleiben."
          }
        ]
      }
    ]
  };
}

function createFixtureJob(conversation: Conversation): ImportJob {
  const timestamp = "2026-03-08T12:00:00.000Z";

  return {
    artifacts: {
      handover: conversationToHandover(conversation),
      json: JSON.stringify(conversation, null, 2),
      markdown: conversationToMarkdown(conversation)
    },
    conversation,
    createdAt: timestamp,
    currentStage: "done",
    id: fixtureImportId,
    mode: "archive",
    sourcePlatform: "chatgpt",
    sourceUrl: conversation.source.url,
    status: "completed",
    summary: {
      messageCount: conversation.messages.length,
      transcriptWords: conversationWordCount(conversation)
    },
    updatedAt: timestamp,
    warnings: []
  };
}

async function resetSeededDatabase() {
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all(
    [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].map((candidatePath) =>
      fs.rm(candidatePath, { force: true }).catch(() => undefined)
    )
  );

  process.env.CHAT_EXPORTER_DB_PATH = dbPath;

  const [{ db }, { insertImport, saveImportSnapshot }] = await Promise.all([
    import("../lib/database.js"),
    import("../lib/import-repository.js")
  ]);
  const conversation = createFixtureConversation();
  const job = createFixtureJob(conversation);

  insertImport(job);
  saveImportSnapshot({
    fetchMetadata: {
      mode: "smoke-test"
    },
    fetchedAt: job.updatedAt,
    finalUrl: job.sourceUrl,
    importId: job.id,
    normalizedPayload: {
      messages: conversation.messages.length,
      smokeFixture: true
    },
    pageTitle: conversation.title,
    rawHtml: "<html><body>Format adjustments smoke fixture</body></html>",
    sourceUrl: job.sourceUrl
  });
  db.close();
}

function appendTail(tail: string[], chunk: string) {
  for (const line of chunk.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    tail.push(line);

    if (tail.length > 40) {
      tail.shift();
    }
  }
}

function spawnManagedProcess(
  label: string,
  command: string,
  args: string[],
  extraEnv: Record<string, string>,
  cwd = projectRoot
) {
  const child = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      ...extraEnv
    },
    stdio: "pipe"
  });
  const managedChild: ManagedChild = {
    label,
    process: child,
    tail: []
  };

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    appendTail(managedChild.tail, chunk);
  });
  child.stderr.on("data", (chunk: string) => {
    appendTail(managedChild.tail, chunk);
  });

  return managedChild;
}

async function waitForPort(port: number, label: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 45_000) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection(
          {
            host: "127.0.0.1",
            port
          },
          () => {
            socket.end();
            resolve();
          }
        );

        socket.setTimeout(1_000);
        socket.once("timeout", () => {
          socket.destroy();
          reject(new Error("timeout"));
        });
        socket.once("error", reject);
      });
      return;
    } catch {
      // Retry until timeout.
    }

    await delay(500);
  }

  throw new Error(`Timed out while waiting for ${label} on port ${port}.`);
}

function formatProcessTails(children: ManagedChild[]) {
  return children
    .map((child) => {
      const output = child.tail.length > 0 ? child.tail.join("\n") : "(no output captured)";
      return `${child.label} log tail:\n${output}`;
    })
    .join("\n\n");
}

async function stopManagedProcess(child: ManagedChild) {
  if (child.process.exitCode !== null || child.process.killed) {
    return;
  }

  child.process.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => {
      child.process.once("exit", () => resolve());
    }),
    delay(5_000)
  ]);

  if (child.process.exitCode === null && !child.process.killed) {
    child.process.kill("SIGKILL");
  }
}

async function buildSharedPackage() {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("pnpm", ["--filter", "@chat-exporter/shared", "build"], {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit"
    });

    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Shared package build failed with exit code ${code ?? "unknown"}.`));
    });
    child.once("error", reject);
  });
}

async function runSmokeFlow() {
  await buildSharedPackage();
  await resetSeededDatabase();

  const children = [
    spawnManagedProcess("server", process.execPath, ["--import", tsxLoaderPath, serverEntryPath], {
      CHAT_EXPORTER_DB_PATH: dbPath,
      PORT: String(serverPort)
    }),
    spawnManagedProcess(
      "web",
      process.execPath,
      [viteCliPath, "--host", "127.0.0.1", "--port", String(webPort)],
      {
        API_PROXY_TARGET: serverUrl,
        WEB_PORT: String(webPort)
      },
      path.join(projectRoot, "apps/web")
    )
  ];

  const browser = await chromium.launch({
    headless: process.env.SMOKE_HEADLESS !== "0"
  });
  const pageDiagnostics: string[] = [];
  let pageBodyText = "";
  let pageUrl = "about:blank";

  try {
    await Promise.all([
      waitForPort(serverPort, "server health"),
      waitForPort(webPort, "web app")
    ]);

    const page = await browser.newPage();
    page.on("console", (message) => {
      const text = message.text().trim();

      if (!text) {
        return;
      }

      pageDiagnostics.push(`[console:${message.type()}] ${text}`);

      if (pageDiagnostics.length > 20) {
        pageDiagnostics.shift();
      }
    });
    page.on("pageerror", (error) => {
      pageDiagnostics.push(`[pageerror] ${error.message}`);

      if (pageDiagnostics.length > 20) {
        pageDiagnostics.shift();
      }
    });
    await page.goto(`${webUrl}/?import=${fixtureImportId}`, {
      waitUntil: "networkidle"
    });
    pageUrl = page.url();
    pageBodyText = (await page.locator("body").innerText()).trim();

    await page.getByTestId("toggle-adjust-mode-reader").click();
    await page.getByTestId("reader-block-assistant-1-0").click();
    await page.getByTestId("adjustment-draft-message").fill(
      "Please add more spacing under headings here."
    );
    await page.getByTestId("adjustment-send").click();
    await page.getByTestId("adjustment-generate-preview").click();
    await page.getByTestId("adjustment-preview").waitFor();
    await page.reload({
      waitUntil: "networkidle"
    });
    await page.getByTestId("toggle-adjust-mode-reader").click();
    await page.getByTestId("reader-block-assistant-1-0").click();
    await page.getByTestId("adjustment-preview").waitFor();

    const resumedReaderSessionText = await page.getByTestId("adjustment-session").innerText();

    if (!resumedReaderSessionText.includes("Please add more spacing under headings here.")) {
      throw new Error("Reader adjustment smoke test did not resume the saved draft session.");
    }

    const inspectionDb = new Database(dbPath, {
      readonly: true
    });
    const resumedReaderSessionCount = inspectionDb
      .prepare<
        [string, string],
        {
          count: number;
        }
      >(
        `SELECT COUNT(*) AS count
         FROM adjustment_sessions
         WHERE import_id = ?
           AND target_format = ?
           AND status IN ('open', 'preview_ready')`
      )
      .get(fixtureImportId, "reader").count;
    inspectionDb.close();

    if (resumedReaderSessionCount !== 1) {
      throw new Error("Reader adjustment smoke test created a duplicate session on reload.");
    }

    await page.getByTestId("adjustment-apply-rule").click();
    await page.getByTestId("active-format-rule").waitFor();
    await page.getByTestId("active-format-rule-why").click();
    await page.getByTestId("active-format-rule-explanation").waitFor();
    await page.getByTestId("active-format-rule-explanation").getByText("Project plan").waitFor();

    const explanationText = await page.getByTestId("active-format-rule-explanation").innerText();

    if (!explanationText.includes("Project plan")) {
      throw new Error("Reader adjustment smoke test did not show the rule explanation.");
    }

    const readerHeadingClassName = await page
      .getByTestId("reader-block-assistant-1-0")
      .evaluate((element) => element.className);

    if (!readerHeadingClassName.includes("mb-4")) {
      throw new Error("Reader adjustment smoke test did not apply the heading spacing rule.");
    }

    await page.getByTestId("active-format-rule-undo").click();
    await page.getByTestId("active-format-rule").waitFor({
      state: "detached"
    });

    const revertedReaderHeadingClassName = await page
      .getByTestId("reader-block-assistant-1-0")
      .evaluate((element) => element.className);

    if (revertedReaderHeadingClassName.includes("mb-4")) {
      throw new Error("Reader adjustment smoke test did not undo the heading spacing rule.");
    }

    await page.getByTestId("reader-block-assistant-1-4").click();
    await page.getByTestId("adjustment-draft-message").fill(
      "Fettdruck wird im Reader nicht korrekt gerendert."
    );
    await page.getByTestId("adjustment-send").click();
    await page.getByTestId("adjustment-generate-preview").click();
    await page.getByTestId("adjustment-preview").waitFor();
    await page.getByTestId("adjustment-apply-rule").click();
    await page.waitForFunction(() => {
      const block = document.querySelector('[data-testid="reader-block-assistant-1-4"]');
      return block?.querySelector("strong") !== null && !(block.textContent ?? "").includes("**");
    });

    const renderedMarkdownStrong = await page.getByTestId("reader-block-assistant-1-4").innerText();

    if (
      renderedMarkdownStrong.includes("**") ||
      !renderedMarkdownStrong.includes("Wichtig für den Launch:")
    ) {
      throw new Error(
        "Reader adjustment smoke test did not render literal Markdown bold markers correctly."
      );
    }

    await page.getByTestId("format-view-markdown").click();
    await page.getByTestId("toggle-adjust-mode-markdown").click();
    await page.getByTestId("markdown-line-9").click();
    await page.getByTestId("adjustment-draft-message").fill(
      "Labels with a colon should always be bold in Markdown."
    );
    await page.getByTestId("adjustment-send").click();
    await page.getByTestId("adjustment-generate-preview").click();
    await page.getByTestId("adjustment-preview").waitFor();
    await page.getByTestId("adjustment-apply-rule").click();
    await page.waitForFunction(() => {
      const line = document.querySelector('[data-testid="markdown-line-9"]');
      return line?.textContent?.includes("**Important") ?? false;
    });

    const markdownLineText = await page.getByTestId("markdown-line-9").innerText();

    if (
      !markdownLineText.includes("**Important") ||
      !markdownLineText.includes("check the logs before deploying.")
    ) {
      throw new Error("Markdown adjustment smoke test did not bold the selected label line.");
    }

    console.log(`Smoke flow passed at ${webUrl} using seeded import ${fixtureImportId}.`);
  } catch (error) {
    const page = browser.contexts()[0]?.pages()[0];

    if (page) {
      await page.screenshot({
        path: failureScreenshotPath,
        fullPage: true
      });
    }

    const processTails = formatProcessTails(children);
    const detail = error instanceof Error ? error.message : "Unknown smoke test failure.";
    const pageDetail =
      pageDiagnostics.length > 0
        ? pageDiagnostics.join("\n")
        : `No browser console output captured. Last URL: ${pageUrl}`;
    const pageTextDetail = pageBodyText || "(body text empty)";
    throw new Error(
      `${detail}\n\nFailure screenshot: ${failureScreenshotPath}\n\nBrowser diagnostics:\n${pageDetail}\n\nPage URL: ${pageUrl}\nPage text:\n${pageTextDetail}\n\n${processTails}`
    );
  } finally {
    await browser.close();
    await Promise.all(children.map((child) => stopManagedProcess(child)));
  }
}

void runSmokeFlow().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
