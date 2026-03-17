import type { ImportJob } from "@chat-exporter/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardPaste, ExternalLink, Link2 } from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";

import { FormatWorkspace } from "@/components/format-workspace/format-workspace";
import { getImportStageEntry } from "@/components/format-workspace/labels";
import type { ViewMode } from "@/components/format-workspace/types";
import { WelcomeCard } from "@/components/onboarding/welcome-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

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
    return getImportStageEntry("queued");
  }

  if (job.status === "completed") {
    return getImportStageEntry("done");
  }

  return getImportStageEntry(job.currentStage);
}

type ImportTab = "link" | "paste";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
        active
          ? "bg-foreground/10 text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
      )}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeImportId = searchParams.get("import");
  const queryClient = useQueryClient();

  const [url, setUrl] = useState("");
  const [hasEditedUrl, setHasEditedUrl] = useState(false);
  const [view, setView] = useState<ViewMode>("reader");
  const [now, setNow] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<ImportTab>("link");
  const [pastedContent, setPastedContent] = useState<{
    html?: string;
    plainText?: string;
  } | null>(null);
  const [previewText, setPreviewText] = useState("");
  const urlInputRef = useRef<HTMLInputElement>(null);

  const handleScrollToInput = useCallback(() => {
    urlInputRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    urlInputRef.current?.focus();
  }, []);

  const { data: allJobs = [] } = useQuery(
    orpc.imports.list.queryOptions({ input: {} }),
  );

  const recentJobs = allJobs
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 2);

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

  const clipboardImport = useMutation(
    orpc.imports.createFromClipboard.mutationOptions({
      onSuccess: (nextJob) => {
        queryClient.invalidateQueries({ queryKey: orpc.imports.key() });
        setPastedContent(null);
        setPreviewText("");
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

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const plainText = e.clipboardData.getData("text/plain");

    setPastedContent({
      html: html || undefined,
      plainText: plainText || undefined,
    });
    setPreviewText(plainText?.slice(0, 500) || "");
  }

  function handleClipboardSubmit() {
    if (!pastedContent) return;
    clipboardImport.mutate({
      html: pastedContent.html,
      plainText: pastedContent.plainText,
    });
  }

  const activeStage = job ? getActiveStage(job) : null;
  const activeSourceUrl = getSafeExternalUrl(job?.sourceUrl ?? url);
  const createdAtMs = job ? Date.parse(job.createdAt) : Number.NaN;
  const elapsedTime = formatElapsed(now - createdAtMs);
  const showRecentJobs = !activeImportId && recentJobs.length > 0;
  const showInlineOriginalButton = Boolean(job && activeSourceUrl);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <WelcomeCard
        visible={allJobs.length === 0 && !activeImportId}
        onScrollToInput={handleScrollToInput}
      />
      <Card className="border-border/90 bg-card/92 shadow-panel">
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex gap-1">
                <TabButton
                  active={activeTab === "link"}
                  onClick={() => setActiveTab("link")}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Link
                </TabButton>
                <TabButton
                  active={activeTab === "paste"}
                  onClick={() => setActiveTab("paste")}
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  Einfügen
                </TabButton>
              </div>

              {activeTab === "link" ? (
                <form className="space-y-3" onSubmit={handleSubmit}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="relative flex-1">
                      <Input
                        ref={urlInputRef}
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
                          <span className="hidden sm:inline">
                            Original öffnen
                          </span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>

                    <Button
                      className="h-12 px-5 lg:min-w-[8rem]"
                      disabled={createImport.isPending}
                      type="submit"
                    >
                      {createImport.isPending
                        ? "Import läuft..."
                        : "Importieren"}
                    </Button>
                  </div>

                  {createImport.error ? (
                    <div className="rounded-2xl border border-red-300/40 bg-red-100/60 px-4 py-3 text-sm text-red-900">
                      {createImport.error.message}
                    </div>
                  ) : null}
                </form>
              ) : (
                <div className="space-y-3">
                  <textarea
                    aria-label="Chat einfügen"
                    className="h-32 w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Chat hier einfügen (Strg+V / ⌘+V)..."
                    readOnly
                    value={previewText}
                    onPaste={handlePaste}
                  />

                  {pastedContent ? (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        {pastedContent.html
                          ? "HTML + Text erkannt"
                          : "Nur Text erkannt"}
                      </p>
                      <Button
                        className="h-12 px-5 lg:min-w-[8rem]"
                        disabled={clipboardImport.isPending}
                        onClick={handleClipboardSubmit}
                      >
                        {clipboardImport.isPending
                          ? "Importiert..."
                          : "Importieren"}
                      </Button>
                    </div>
                  ) : null}

                  {clipboardImport.error ? (
                    <div className="rounded-2xl border border-red-300/40 bg-red-100/60 px-4 py-3 text-sm text-red-900">
                      {clipboardImport.error.message}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {showRecentJobs ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Letzte Importe
                  </p>
                  {allJobs.length > 2 ? (
                    <Link
                      className="text-xs text-muted-foreground transition hover:text-foreground"
                      to="/history"
                    >
                      Alle anzeigen →
                    </Link>
                  ) : null}
                </div>
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
