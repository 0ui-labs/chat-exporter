import type { ImportJob } from "@chat-exporter/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { type FormEvent, startTransition, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { FormatWorkspace } from "@/components/format-workspace/format-workspace";
import type { ViewMode } from "@/components/format-workspace/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

const importStages = {
  validate: {
    label: "Link wird geprüft",
    detail: "Der Link wird geprüft und dem passenden Importer zugeordnet.",
  },
  fetch: {
    label: "Seite wird geladen",
    detail: "Die freigegebene Seite wird geöffnet und als Quelle erfasst.",
  },
  extract: {
    label: "Nachrichten werden extrahiert",
    detail: "Die Unterhaltung wird aus dem Markup des Anbieters extrahiert.",
  },
  normalize: {
    label: "Transkript wird bereinigt",
    detail: "Rohfragmente werden in lesbare Nachrichten umgewandelt.",
  },
  structure: {
    label: "Struktur wird repariert",
    detail: "Abschnitte mit zusätzlichem Bereinigungsbedarf werden korrigiert.",
  },
  render: {
    label: "Ausgaben werden erzeugt",
    detail: "Reader- und Exportformate werden vorbereitet.",
  },
  done: {
    label: "Bereit",
    detail: "Das Transkript ist bereit.",
  },
} as const;

function getSafeExternalUrl(value: string) {
  try {
    const url = new URL(value);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }

    return null;
  } catch {
    return null;
  }
}

function formatSourceLabel(url: string) {
  try {
    const parsed = new URL(url);
    const value =
      `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname}`.replace(
        /\/$/,
        "",
      );
    return value.length > 46 ? `${value.slice(0, 43)}...` : value;
  } catch {
    return url.length > 46 ? `${url.slice(0, 43)}...` : url;
  }
}

function formatElapsed(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) {
    return "00:00";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getActiveStage(job: ImportJob) {
  if (job.status === "queued") {
    return {
      label: "Wartet auf Start",
      detail:
        "Der Job ist in der Warteschlange und startet, sobald ein Worker frei ist.",
    };
  }

  if (job.status === "completed") {
    return importStages.done;
  }

  return importStages[job.currentStage];
}

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeImportId = searchParams.get("import");
  const queryClient = useQueryClient();

  const [url, setUrl] = useState("");
  const [hasEditedUrl, setHasEditedUrl] = useState(false);
  const [view, setView] = useState<ViewMode>("reader");
  const [now, setNow] = useState(() => Date.now());

  const { data: recentJobs = [] } = useQuery({
    ...orpc.imports.list.queryOptions(),
    select: (jobs) =>
      jobs
        .slice()
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, 2),
  });

  const { data: job, error: jobError } = useQuery({
    ...orpc.imports.get.queryOptions({ input: { id: activeImportId ?? "" } }),
    enabled: Boolean(activeImportId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      return 1200;
    },
  });

  const createImport = useMutation(
    orpc.imports.create.mutationOptions({
      onSuccess: (nextJob) => {
        queryClient.invalidateQueries({ queryKey: orpc.imports.key() });
        setHasEditedUrl(false);
        startTransition(() => setActiveImport(nextJob.id));
      },
    }),
  );

  useEffect(() => {
    setView("reader");
  }, []);

  useEffect(() => {
    if (!job) {
      return;
    }

    if (!hasEditedUrl) {
      setUrl(job.sourceUrl);
    }
  }, [hasEditedUrl, job]);

  useEffect(() => {
    setNow(Date.now());

    if (!job || job.status === "completed" || job.status === "failed") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [job]);

  function setActiveImport(importId: string | null) {
    const nextSearchParams = new URLSearchParams(searchParams);

    if (importId) {
      nextSearchParams.set("import", importId);
    } else {
      nextSearchParams.delete("import");
    }

    setSearchParams(nextSearchParams);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createImport.mutate({ url, mode: "archive" });
  }

  function handleSelectJob(selectedJob: ImportJob) {
    setHasEditedUrl(false);
    setUrl(selectedJob.sourceUrl);
    startTransition(() => {
      setActiveImport(selectedJob.id);
    });
  }

  const activeStage = job ? getActiveStage(job) : null;
  const activeSourceUrl = getSafeExternalUrl(job?.sourceUrl ?? url);
  const createdAtMs = job ? Date.parse(job.createdAt) : Number.NaN;
  const elapsedTime = formatElapsed(now - createdAtMs);
  const showRecentJobs = !activeImportId && recentJobs.length > 0;
  const showInlineOriginalButton = Boolean(job && activeSourceUrl);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Card className="border-border/90 bg-card/92 shadow-panel">
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-6">
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Input
                    aria-label="Freigabelink"
                    className={cn(
                      "h-12 pr-4 text-base",
                      showInlineOriginalButton ? "pr-24 sm:pr-40" : null,
                    )}
                    inputMode="url"
                    placeholder="https://chatgpt.com/share/... oder ein anderer öffentlicher KI-Share-Link"
                    value={url}
                    onChange={(event) => {
                      setHasEditedUrl(true);
                      setUrl(event.target.value);
                    }}
                  />

                  {showInlineOriginalButton ? (
                    <a
                      className="absolute right-2 top-1/2 inline-flex h-8 -translate-y-1/2 items-center gap-1 rounded-lg border border-border bg-background/95 px-3 text-xs font-medium text-foreground transition hover:bg-foreground/5"
                      href={activeSourceUrl ?? undefined}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="sm:hidden">Öffnen</span>
                      <span className="hidden sm:inline">Original öffnen</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>

                <Button
                  className="h-12 px-5 lg:min-w-[8rem]"
                  disabled={createImport.isPending}
                  type="submit"
                >
                  {createImport.isPending ? "Import läuft..." : "Importieren"}
                </Button>
              </div>

              {createImport.error ? (
                <div className="rounded-2xl border border-red-300/40 bg-red-100/60 px-4 py-3 text-sm text-red-900">
                  {createImport.error.message}
                </div>
              ) : null}
            </form>

            {showRecentJobs ? (
              <section className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Letzte Importe
                </p>
                <div className="flex flex-wrap gap-2">
                  {recentJobs.map((recentJob) => (
                    <button
                      key={recentJob.id}
                      className={cn(
                        "inline-flex max-w-full items-center rounded-full border px-4 py-2 text-sm transition",
                        activeImportId === recentJob.id
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border/80 bg-background/65 text-foreground hover:bg-foreground/5",
                      )}
                      type="button"
                      onClick={() => handleSelectJob(recentJob)}
                    >
                      <span className="max-w-[22rem] truncate">
                        {formatSourceLabel(recentJob.sourceUrl)}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {jobError ? (
              <div className="rounded-2xl border border-red-300/40 bg-red-100/60 px-4 py-3 text-sm text-red-900">
                {jobError.message}
              </div>
            ) : job ? (
              <FormatWorkspace
                activeStage={activeStage}
                elapsedTime={elapsedTime}
                job={job}
                view={view}
                onViewChange={setView}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
