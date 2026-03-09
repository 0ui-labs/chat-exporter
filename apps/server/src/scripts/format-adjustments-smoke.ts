import fs from "node:fs/promises";
import http from "node:http";
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
const mockOpenAiPort = Number(process.env.SMOKE_OPENAI_PORT ?? 8793);
const serverUrl = `http://127.0.0.1:${serverPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const fixtureImportId = "smoke-format-adjustments-v1";

type ManagedChild = {
  label: string;
  process: ChildProcessWithoutNullStreams;
  tail: string[];
};

type ManagedMockServer = {
  close: () => Promise<void>;
  url: string;
};

function getBodyInputRecord(body: Record<string, unknown>, index: number) {
  const { input } = body;

  if (!Array.isArray(input)) {
    return null;
  }

  const entry = input[index];

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  return entry as Record<string, unknown>;
}

function getBodyInputText(body: Record<string, unknown>, index: number) {
  const entry = getBodyInputRecord(body, index);
  const content = entry?.content;

  if (!Array.isArray(content)) {
    return "";
  }

  const firstContentPart = content[0];

  if (!firstContentPart || typeof firstContentPart !== "object" || Array.isArray(firstContentPart)) {
    return "";
  }

  return typeof firstContentPart.text === "string" ? firstContentPart.text : "";
}

function getBodyInputOutput(body: Record<string, unknown>, index: number) {
  const entry = getBodyInputRecord(body, index);

  return typeof entry?.output === "string" ? entry.output : "";
}

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

function readRequestBody(request: http.IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    request.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.once("error", reject);
  });
}

function buildMockPreviewResponse(body: Record<string, unknown>) {
  const prompt = getBodyInputText(body, 1);

  if (/mehr Abstand unter ähnlichen Überschriften/i.test(prompt)) {
    return {
      draftRule: {
        effect: {
          amount: "lg",
          direction: "after",
          type: "adjust_block_spacing"
        },
        kind: "render",
        scope: "import_local",
        selector: {
          blockType: "heading",
          strategy: "block_type"
        }
      },
      limitations: [],
      rationale: "Die Anfrage nennt klar mehr Abstand unter Überschriften im Reader.",
      summary: "Vergrößere den Abstand rund um ähnliche Überschriften im Reader."
    };
  }

  if (/markdown-fettdruck-markierungen/i.test(prompt)) {
    return {
      draftRule: {
        effect: {
          type: "render_markdown_strong"
        },
        kind: "inline_semantics",
        scope: "import_local",
        selector: {
          blockIndex: 4,
          blockType: "paragraph",
          messageId: "assistant-1"
        }
      },
      limitations: [],
      rationale:
        "Die Auswahl enthält wörtliche Markdown-Fettdruck-Markierungen und soll im Reader korrekt gerendert werden.",
      summary: "Rendere vorhandene Markdown-Fettdruck-Markierungen im ausgewählten Reader-Block korrekt."
    };
  }

  return {
    draftRule: {
      effect: {
        type: "bold_prefix_before_colon"
      },
      kind: "inline_semantics",
      scope: "import_local",
      selector: {
        strategy: "prefix_before_colon"
      }
    },
    limitations: [],
    rationale: "Die Anfrage beschreibt ein wiederkehrendes Markdown-Labelmuster.",
    summary: "Hebe labelartige Präfixe mit Doppelpunkt in passenden Markdown-Zeilen importweit hervor."
  };
}

function buildMockChatResponse(body: Record<string, unknown>) {
  const latestInput = getBodyInputText(body, 1);

  if (/mehr Abstand unter ähnlichen Überschriften/i.test(latestInput)) {
    return {
      id: "resp_reader_apply",
      output: [
        {
          arguments: JSON.stringify({
            instruction: "Mehr Abstand unter ähnlichen Überschriften im Reader."
          }),
          call_id: "call_reader_spacing",
          name: "apply_adjustment_rule",
          status: "completed",
          type: "function_call"
        }
      ]
    };
  }

  if (/Mach das luftiger/i.test(latestInput)) {
    return {
      id: "resp_reader_clarify",
      output_text: "Soll das nur für diese Überschrift gelten oder auch für ähnliche Überschriften?"
    };
  }

  if (/Fettdruck wird im Reader nicht korrekt gerendert/i.test(latestInput)) {
    return {
      id: "resp_reader_bold",
      output: [
        {
          arguments: JSON.stringify({
            instruction:
              "Vorhandene Markdown-Fettdruck-Markierungen im Reader sichtbar rendern."
          }),
          call_id: "call_reader_bold",
          name: "apply_adjustment_rule",
          status: "completed",
          type: "function_call"
        }
      ]
    };
  }

  return {
    id: "resp_markdown_bold",
    output: [
      {
        arguments: JSON.stringify({
          instruction: "Labelartige Präfixe mit Doppelpunkt in Markdown fett darstellen."
        }),
        call_id: "call_markdown_bold",
        name: "apply_adjustment_rule",
        status: "completed",
        type: "function_call"
      }
    ]
  };
}

function buildMockFollowUpResponse(body: Record<string, unknown>) {
  const output = getBodyInputOutput(body, 0);

  if (/ähnliche Überschriften im Reader/i.test(output)) {
    return {
      id: "resp_reader_apply_done",
      output_text: "Ich habe den Abstand unter ähnlichen Überschriften jetzt direkt im Reader vergrößert."
    };
  }

  if (/Markdown-Fettdruck-Markierungen/i.test(output)) {
    return {
      id: "resp_reader_bold_done",
      output_text: "Ich habe den markierten Fettdruck jetzt direkt im Reader sichtbar gemacht."
    };
  }

  return {
    id: "resp_markdown_bold_done",
    output_text: "Ich habe die markierte Markdown-Stelle jetzt direkt fett hervorgehoben."
  };
}

async function startMockOpenAiServer(): Promise<ManagedMockServer> {
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/responses") {
      response.writeHead(404).end("not found");
      return;
    }

    const rawBody = await readRequestBody(request);
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const isPreviewCompilation = Boolean((body.text as Record<string, unknown> | undefined)?.format);
    const isFollowUp = typeof body.previous_response_id === "string";
    const payload = isPreviewCompilation
      ? {
          output_text: JSON.stringify(buildMockPreviewResponse(body))
        }
      : isFollowUp
        ? buildMockFollowUpResponse(body)
        : buildMockChatResponse(body);

    response.writeHead(200, {
      "Content-Type": "application/json"
    });
    response.end(JSON.stringify(payload));
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(mockOpenAiPort, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });

  return {
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
    url: `http://127.0.0.1:${mockOpenAiPort}/v1`
  };
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
  const mockOpenAi = await startMockOpenAiServer();

  const children = [
    spawnManagedProcess("server", process.execPath, ["--import", tsxLoaderPath, serverEntryPath], {
      ADJUSTMENT_RULE_COMPILATION_ENABLED: "1",
      ADJUSTMENT_RULE_COMPILATION_MODEL: "gpt-5-mini",
      ADJUSTMENT_RULE_COMPILATION_PROVIDER: "openai",
      CHAT_EXPORTER_DB_PATH: dbPath,
      OPENAI_API_BASE_URL: mockOpenAi.url,
      OPENAI_API_KEY: "smoke-openai-key",
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
    await page.getByTestId("adjustment-mode-guide-reader").waitFor();
    await page.getByTestId("reader-block-assistant-1-0").click();
    await page.getByTestId("adjustment-popover-reader").waitFor();
    await page.getByTestId("adjustment-draft-message").fill(
      "Mach das luftiger."
    );
    await page.getByTestId("adjustment-send").click();
    await page.getByTestId("adjustment-last-reply").waitFor();
    await page.reload({
      waitUntil: "networkidle"
    });
    await page.getByTestId("toggle-adjust-mode-reader").click();
    await page.getByTestId("reader-block-assistant-1-0").click();

    if ((await page.getByTestId("adjustment-last-reply").count()) > 0) {
      throw new Error(
        "Reader adjustment smoke test showed an old AI reply before the user sent a new message."
      );
    }

    const inspectionDb = new Database(dbPath, {
      readonly: true
    });
    const resumedReaderSessionRow = inspectionDb
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
      .get(fixtureImportId, "reader");
    const resumedReaderSessionCount = resumedReaderSessionRow?.count ?? 0;
    inspectionDb.close();

    if (resumedReaderSessionCount !== 1) {
      throw new Error("Reader adjustment smoke test created a duplicate session on reload.");
    }

    await page.getByTestId("adjustment-draft-message").fill(
      "Ja, bitte mehr Abstand unter ähnlichen Überschriften."
    );
    await page.getByTestId("adjustment-send").click();
    await page.getByTestId("adjustment-last-reply").waitFor();
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

    await page
      .getByTestId("adjustment-popover-reader")
      .getByRole("button", {
        name: "Abbrechen"
      })
      .click();
    await page.getByTestId("reader-block-assistant-1-4").click();
    await page.getByTestId("adjustment-draft-message").fill(
      "Fettdruck wird im Reader nicht korrekt gerendert."
    );
    await page.getByTestId("adjustment-send").click();
    await page.waitForFunction(() => {
      const block = document.querySelector('[data-testid="reader-block-assistant-1-4"]');

      if (!(block instanceof HTMLElement)) {
        return false;
      }

      return block.querySelector("strong") !== null && !block.textContent.includes("**");
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
    await mockOpenAi.close();
  }
}

void runSmokeFlow().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
