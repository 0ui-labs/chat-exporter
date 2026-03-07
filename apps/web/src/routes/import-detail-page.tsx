import { useEffect, useState } from "react";
import {
  Bug,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  FileCode2,
  FileJson2,
  FileText,
  Layers3
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import type {
  Block,
  ImportJob,
  ImportSnapshot,
  NormalizedSnapshotMessage
} from "@chat-exporter/shared";

import { getImport, getImportSnapshot } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type ViewMode = "reader" | "markdown" | "handover" | "json" | "debug";
type DebugPanel = "compare" | "payload" | "raw-html";

const views: { value: ViewMode; label: string; icon: typeof Layers3 }[] = [
  { value: "reader", label: "Reader", icon: Layers3 },
  { value: "markdown", label: "Markdown", icon: FileText },
  { value: "handover", label: "Handover", icon: FileCode2 },
  { value: "json", label: "JSON", icon: FileJson2 },
  { value: "debug", label: "Debug", icon: Bug }
];

const debugPanels: { value: DebugPanel; label: string }[] = [
  { value: "compare", label: "Raw vs normalized" },
  { value: "payload", label: "Normalized payload" },
  { value: "raw-html", label: "Raw HTML" }
];

function blockToPlainText(block: Block) {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
    case "code":
      return block.text;
    case "list":
      return block.items.join(" ");
    case "table":
      return [block.headers.join(" "), ...block.rows.map((row) => row.join(" "))].join(" ");
  }
}

function getMessagePreview(message: NormalizedSnapshotMessage) {
  const source = (message.rawText ?? message.blocks.map(blockToPlainText).join(" "))
    .replace(/\s+/g, " ")
    .trim();

  if (!source) {
    return "No preview text available.";
  }

  return source.length > 160 ? `${source.slice(0, 157)}…` : source;
}

function truncatePreview(value: string, limit: number) {
  if (value.length <= limit) {
    return {
      text: value,
      truncated: false
    };
  }

  return {
    text: `${value.slice(0, limit)}\n…`,
    truncated: true
  };
}

function renderBlock(block: Block) {
  switch (block.type) {
    case "paragraph":
      return <p className="text-sm leading-7 text-foreground/90">{block.text}</p>;
    case "heading": {
      const Tag = (`h${Math.min(block.level + 1, 6)}` as keyof JSX.IntrinsicElements);
      return <Tag className="font-semibold text-foreground">{block.text}</Tag>;
    }
    case "list":
      return (
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-foreground/90">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-accent pl-4 text-sm italic leading-7 text-foreground/80">
          {block.text}
        </blockquote>
      );
    case "code":
      return (
        <div className="rounded-2xl border border-border/80 bg-zinc-950 p-4 text-sm text-zinc-100">
          <p className="mb-3 text-xs uppercase tracking-[0.22em] text-zinc-400">
            {block.language}
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
            <code>{block.text}</code>
          </pre>
        </div>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-2xl border border-border/80">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-secondary/70 text-secondary-foreground">
              <tr>
                {block.headers.map((header) => (
                  <th key={header} className="px-4 py-3 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${rowIndex}-${row.join("-")}`} className="border-t border-border/80">
                  {row.map((cell) => (
                    <td key={`${rowIndex}-${cell}`} className="px-4 py-3 align-top text-muted-foreground">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function ImportDetailPage() {
  const navigate = useNavigate();
  const { importId } = useParams();
  const [job, setJob] = useState<ImportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("reader");
  const [debugPanel, setDebugPanel] = useState<DebugPanel>("compare");
  const [snapshot, setSnapshot] = useState<ImportSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [selectedCompareMessageId, setSelectedCompareMessageId] = useState<string | null>(null);

  useEffect(() => {
    setSnapshot(null);
    setSnapshotError(null);
    setLoadingSnapshot(false);
    setSelectedCompareMessageId(null);
  }, [importId]);

  useEffect(() => {
    if (!importId) {
      setError("Import id missing.");
      return;
    }

    const jobId = importId;
    let cancelled = false;
    let intervalId: number | undefined;

    async function refresh() {
      try {
        const nextJob = await getImport(jobId);
        if (cancelled) {
          return;
        }

        setJob(nextJob);
        setError(null);

        if (nextJob.status === "completed" || nextJob.status === "failed") {
          if (intervalId) {
            window.clearInterval(intervalId);
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Import job could not be loaded."
          );
        }
      }
    }

    void refresh();
    intervalId = window.setInterval(() => {
      void refresh();
    }, 1200);

    return () => {
      cancelled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [importId]);

  useEffect(() => {
    if (!importId || view !== "debug" || job?.status !== "completed" || snapshot || loadingSnapshot) {
      return;
    }

    let cancelled = false;

    setLoadingSnapshot(true);
    setSnapshotError(null);

    void getImportSnapshot(importId)
      .then((nextSnapshot) => {
        if (!cancelled) {
          setSnapshot(nextSnapshot);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setSnapshotError(
            loadError instanceof Error
              ? loadError.message
              : "Import snapshot could not be loaded."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingSnapshot(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [importId, job?.status, snapshot, view]);

  useEffect(() => {
    const messages = snapshot?.normalizedPayload.messages ?? [];

    if (messages.length === 0) {
      setSelectedCompareMessageId(null);
      return;
    }

    setSelectedCompareMessageId((currentSelection) => {
      if (currentSelection && messages.some((message) => message.id === currentSelection)) {
        return currentSelection;
      }

      return messages[0]?.id ?? null;
    });
  }, [snapshot]);

  const compareMessages = snapshot?.normalizedPayload.messages ?? [];
  const selectedCompareMessage =
    compareMessages.find((message) => message.id === selectedCompareMessageId) ??
    compareMessages[0] ??
    null;
  const hasRawCompareData = compareMessages.some((message) => message.rawText || message.rawHtml);
  const selectedCompareRawText = selectedCompareMessage?.rawText
    ? truncatePreview(selectedCompareMessage.rawText, 8_000)
    : null;
  const selectedCompareRawHtml = selectedCompareMessage?.rawHtml
    ? truncatePreview(selectedCompareMessage.rawHtml, 6_000)
    : null;

  const artifact =
    view === "markdown"
      ? job?.artifacts?.markdown ?? ""
      : view === "handover"
        ? job?.artifacts?.handover ?? ""
        : view === "json"
          ? job?.artifacts?.json ?? ""
          : "";

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import error</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate("/")}>Back to importer</Button>
        </CardContent>
      </Card>
    );
  }

  if (!job) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading import</CardTitle>
          <CardDescription>Waiting for the import job status.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (job.status === "failed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import failed</CardTitle>
          <CardDescription>
            {job.error ?? "The import pipeline stopped before a conversation could be extracted."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {job.warnings.length > 0 ? (
            <div className="rounded-2xl border border-amber-300/40 bg-amber-100/60 p-4 text-amber-950">
              <p className="mb-2 font-medium">Import warnings</p>
              <ul className="space-y-2">
                {job.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button onClick={() => navigate("/")}>Back to importer</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
      <aside className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle>Import job</CardTitle>
              <Badge variant={job.status === "completed" ? "default" : "outline"}>
                {job.status}
              </Badge>
            </div>
            <CardDescription className="break-all">{job.sourceUrl}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-2xl bg-secondary p-4 text-secondary-foreground">
              <div className="mb-1 flex items-center gap-2">
                {job.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Clock3 className="h-4 w-4" />
                )}
                <span className="font-medium">Current stage: {job.currentStage}</span>
              </div>
              <p className="text-secondary-foreground/80">
                Mode: {job.mode}. Source: {job.sourcePlatform}.
              </p>
            </div>

            {job.summary ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/80 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Messages
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{job.summary.messageCount}</p>
                </div>
                <div className="rounded-2xl border border-border/80 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Words
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{job.summary.transcriptWords}</p>
                </div>
              </div>
            ) : null}

            {job.warnings.length > 0 ? (
              <div className="rounded-2xl border border-amber-300/40 bg-amber-100/60 p-4 text-amber-950">
                <p className="mb-2 font-medium">Import warnings</p>
                <ul className="space-y-2">
                  {job.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Button variant="outline" onClick={() => navigate("/")}>
              Create another import
            </Button>
          </CardContent>
        </Card>
      </aside>

      <section className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Outputs</CardTitle>
            <CardDescription>
              Reader view is human-first. Markdown, handover and JSON are derived artifacts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {views.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  variant={view === value ? "default" : "outline"}
                  onClick={() => setView(value)}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              ))}
            </div>

            <Separator />

            {view === "reader" ? (
              <div className="space-y-4">
                {job.conversation?.messages.map((message) => (
                  <article
                    key={message.id}
                    className={cn(
                      "rounded-[1.75rem] border border-border/80 p-5",
                      message.role === "user"
                        ? "bg-background/90"
                        : "bg-card/95"
                    )}
                  >
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <Badge variant={message.role === "assistant" ? "default" : "outline"}>
                        {message.role}
                      </Badge>
                    </div>
                    <div className="space-y-4">
                      {message.blocks.map((block, index) => (
                        <div key={`${message.id}-${block.type}-${index}`}>{renderBlock(block)}</div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : view === "debug" ? (
              <div className="space-y-4">
                {loadingSnapshot ? (
                  <div className="rounded-2xl border border-border/80 bg-background/70 p-5 text-sm text-muted-foreground">
                    Loading persisted snapshot…
                  </div>
                ) : snapshotError ? (
                  <div className="rounded-2xl border border-red-300/40 bg-red-100/60 p-5 text-sm text-red-900">
                    {snapshotError}
                  </div>
                ) : snapshot ? (
                  <>
                    <div className="grid gap-4 lg:grid-cols-3">
                      <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
                        <div className="mb-2 inline-flex rounded-xl bg-primary/10 p-2 text-primary">
                          <Database className="h-4 w-4" />
                        </div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Snapshot size
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {snapshot.rawHtmlBytes.toLocaleString()}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">bytes of raw HTML</p>
                      </div>
                      <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
                        <div className="mb-2 inline-flex rounded-xl bg-primary/10 p-2 text-primary">
                          <Layers3 className="h-4 w-4" />
                        </div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Article candidates
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {snapshot.fetchMetadata.articleCount.toLocaleString()}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">seen during extraction</p>
                      </div>
                      <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
                        <div className="mb-2 inline-flex rounded-xl bg-primary/10 p-2 text-primary">
                          <FileJson2 className="h-4 w-4" />
                        </div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Persisted messages
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {snapshot.fetchMetadata.messageCount.toLocaleString()}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">normalized into IR</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/80 bg-background/70 p-5">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Snapshot metadata
                          </p>
                          <p className="mt-1 text-sm text-foreground">{snapshot.pageTitle}</p>
                        </div>
                        <a
                          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/70 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-foreground/5"
                          href={`/api/imports/${snapshot.importId}/snapshot/raw-html`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open raw HTML
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <p className="break-all">
                          <span className="font-medium text-foreground">Final URL:</span>{" "}
                          {snapshot.finalUrl}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">Fetched at:</span>{" "}
                          {new Date(snapshot.fetchedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {snapshot.normalizedPayload.warnings.length > 0 ? (
                      <div className="rounded-2xl border border-amber-300/40 bg-amber-100/60 p-5 text-sm text-amber-950">
                        <p className="mb-2 font-medium">Normalization warnings</p>
                        <ul className="space-y-2">
                          {snapshot.normalizedPayload.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-3">
                      {debugPanels.map((panel) => (
                        <Button
                          key={panel.value}
                          type="button"
                          variant={debugPanel === panel.value ? "default" : "outline"}
                          onClick={() => setDebugPanel(panel.value)}
                        >
                          {panel.label}
                        </Button>
                      ))}
                    </div>

                    {debugPanel === "compare" ? (
                      <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
                        <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Message compare
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            Inspect the stored raw fragment beside the normalized block output for a
                            single message at a time.
                          </p>
                          <div className="mt-4 space-y-2">
                            {compareMessages.map((message, index) => (
                              <button
                                key={message.id}
                                type="button"
                                onClick={() => setSelectedCompareMessageId(message.id)}
                                className={cn(
                                  "w-full rounded-2xl border p-3 text-left transition",
                                  selectedCompareMessage?.id === message.id
                                    ? "border-primary bg-primary/10"
                                    : "border-border/80 bg-card/70 hover:bg-foreground/5"
                                )}
                              >
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <Badge
                                    variant={message.role === "assistant" ? "default" : "outline"}
                                  >
                                    {message.role}
                                  </Badge>
                                  <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                    #{index + 1}
                                  </span>
                                </div>
                                <p className="text-sm text-foreground/85">
                                  {getMessagePreview(message)}
                                </p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {message.parser?.usedFallback
                                    ? "fallback paragraph"
                                    : `${message.blocks.length} normalized block${message.blocks.length === 1 ? "" : "s"}`}
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4 min-w-0">
                          {!hasRawCompareData ? (
                            <div className="rounded-2xl border border-amber-300/40 bg-amber-100/60 p-5 text-sm text-amber-950">
                              This snapshot predates raw fragment capture. Re-import the page to
                              inspect stored raw text and HTML side by side.
                            </div>
                          ) : null}

                          {selectedCompareMessage ? (
                            <>
                              <div className="rounded-2xl border border-border/80 bg-background/70 p-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                      Selected message
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      <Badge
                                        variant={
                                          selectedCompareMessage.role === "assistant"
                                            ? "default"
                                            : "outline"
                                        }
                                      >
                                        {selectedCompareMessage.role}
                                      </Badge>
                                      <Badge variant="outline">
                                        {selectedCompareMessage.blocks.length} block
                                        {selectedCompareMessage.blocks.length === 1 ? "" : "s"}
                                      </Badge>
                                      {selectedCompareMessage.parser?.source ? (
                                        <Badge variant="outline">
                                          {selectedCompareMessage.parser.source}
                                        </Badge>
                                      ) : null}
                                      {selectedCompareMessage.parser?.usedFallback ? (
                                        <Badge variant="outline">fallback</Badge>
                                      ) : null}
                                    </div>
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    Message id: {selectedCompareMessage.id}
                                  </p>
                                </div>
                              </div>

                              <div className="grid gap-4 xl:grid-cols-2">
                                <div className="rounded-2xl border border-border/80 bg-zinc-950 p-5 text-sm text-zinc-100">
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">
                                      Raw text
                                    </p>
                                    {selectedCompareRawText?.truncated ? (
                                      <Badge
                                        variant="outline"
                                        className="border-zinc-700 bg-zinc-900 text-zinc-300"
                                      >
                                        truncated preview
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
                                    <code>
                                      {selectedCompareRawText?.text ??
                                        "No raw text stored for this snapshot message."}
                                    </code>
                                  </pre>
                                </div>

                                <div className="rounded-2xl border border-border/80 bg-background/70 p-5">
                                  <p className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                    Normalized render
                                  </p>
                                  <div className="space-y-4">
                                    {selectedCompareMessage.blocks.map((block, index) => (
                                      <div
                                        key={`${selectedCompareMessage.id}-${block.type}-${index}`}
                                      >
                                        {renderBlock(block)}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              <div className="grid gap-4 xl:grid-cols-2">
                                <div className="rounded-2xl border border-border/80 bg-zinc-950 p-5 text-sm text-zinc-100">
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">
                                      Raw HTML fragment
                                    </p>
                                    {selectedCompareRawHtml?.truncated ? (
                                      <Badge
                                        variant="outline"
                                        className="border-zinc-700 bg-zinc-900 text-zinc-300"
                                      >
                                        truncated preview
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
                                    <code>
                                      {selectedCompareRawHtml?.text ??
                                        "No raw HTML fragment stored for this snapshot message."}
                                    </code>
                                  </pre>
                                </div>

                                <div className="rounded-2xl border border-border/80 bg-zinc-950 p-5 text-sm text-zinc-100">
                                  <p className="mb-3 text-xs uppercase tracking-[0.22em] text-zinc-400">
                                    Normalized message JSON
                                  </p>
                                  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
                                    <code>
                                      {JSON.stringify(selectedCompareMessage, null, 2)}
                                    </code>
                                  </pre>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="rounded-2xl border border-border/80 bg-background/70 p-5 text-sm text-muted-foreground">
                              No normalized messages were stored in this snapshot.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : debugPanel === "payload" ? (
                      <div className="rounded-2xl border border-border/80 bg-zinc-950 p-5 text-sm text-zinc-100">
                        <p className="mb-3 text-xs uppercase tracking-[0.22em] text-zinc-400">
                          Normalized payload
                        </p>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
                          <code>{JSON.stringify(snapshot.normalizedPayload, null, 2)}</code>
                        </pre>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-border/80 bg-zinc-950 p-5 text-sm text-zinc-100">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">
                            Raw HTML preview
                          </p>
                          {snapshot.rawHtmlTruncated ? (
                            <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
                              truncated preview
                            </Badge>
                          ) : null}
                        </div>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
                          <code>{snapshot.rawHtmlPreview}</code>
                        </pre>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-2xl border border-border/80 bg-background/70 p-5 text-sm text-muted-foreground">
                    Snapshot data will appear here after a completed import.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-border/80 bg-zinc-950 p-5 text-sm text-zinc-100">
                <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
                  <code>{artifact || "Artifact not available yet."}</code>
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
