import { Hono } from "hono";

import { importRequestSchema } from "@chat-exporter/shared";

import {
  createImportJob,
  getImportJob,
  listImportJobs,
  runImportJob
} from "../lib/import-store.js";

function isSupportedChatGptShareLink(urlString: string) {
  const url = new URL(urlString);
  return url.hostname === "chatgpt.com" && url.pathname.startsWith("/share/");
}

export const importsRoute = new Hono()
  .get("/", (c) => c.json(listImportJobs()))
  .post("/", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = importRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json(
        {
          message: "Invalid import request.",
          issues: parsed.error.flatten()
        },
        400
      );
    }

    if (!isSupportedChatGptShareLink(parsed.data.url)) {
      return c.json(
        {
          message:
            "This first scaffold only accepts public ChatGPT share links."
        },
        400
      );
    }

    const job = createImportJob(parsed.data);
    void runImportJob(job.id);

    return c.json(job, 202);
  })
  .get("/:id", (c) => {
    const job = getImportJob(c.req.param("id"));

    if (!job) {
      return c.json(
        {
          message: "Import job not found."
        },
        404
      );
    }

    return c.json(job);
  })
  .get("/:id/export/:format", (c) => {
    const job = getImportJob(c.req.param("id"));

    if (!job || !job.artifacts) {
      return c.json(
        {
          message: "Export artifact not found."
        },
        404
      );
    }

    const format = c.req.param("format");

    switch (format) {
      case "markdown":
        c.header("Content-Type", "text/markdown; charset=utf-8");
        return c.body(job.artifacts.markdown);
      case "handover":
        c.header("Content-Type", "text/plain; charset=utf-8");
        return c.body(job.artifacts.handover);
      case "json":
        c.header("Content-Type", "application/json; charset=utf-8");
        return c.body(job.artifacts.json);
      default:
        return c.json(
          {
            message: "Unsupported export format."
          },
          400
        );
    }
  });
