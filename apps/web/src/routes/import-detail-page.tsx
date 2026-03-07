import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, FileCode2, FileJson2, FileText, Layers3 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import type { Block, ImportJob } from "@chat-exporter/shared";

import { getImport } from "@/lib/api";
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

type ViewMode = "reader" | "markdown" | "handover" | "json";

const views: { value: ViewMode; label: string; icon: typeof Layers3 }[] = [
  { value: "reader", label: "Reader", icon: Layers3 },
  { value: "markdown", label: "Markdown", icon: FileText },
  { value: "handover", label: "Handover", icon: FileCode2 },
  { value: "json", label: "JSON", icon: FileJson2 }
];

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
