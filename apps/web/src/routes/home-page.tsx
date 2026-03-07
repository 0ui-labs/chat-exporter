import { startTransition, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Gauge, Layers3, Link2, WandSparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { ImportJob } from "@chat-exporter/shared";

import { createImport, listImports } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

const featureCards = [
  {
    icon: Link2,
    title: "Single source first",
    body: "This first slice targets public ChatGPT share links only so the IR and import pipeline can harden before provider sprawl."
  },
  {
    icon: Layers3,
    title: "IR before UI tricks",
    body: "Everything routes through a durable conversation schema: messages, blocks, roles and derived artifacts."
  },
  {
    icon: Gauge,
    title: "Performance guardrails",
    body: "No scraping inside the request thread, no framework overhead on the client, no giant transcript dump on initial render."
  },
  {
    icon: WandSparkles,
    title: "AI as a second pass",
    body: "Deterministic DOM cleanup comes first. LLMs should classify and repair structure, not invent the whole page."
  }
];

export function HomePage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("https://chatgpt.com/share/69ac09e5-d494-8001-915f-0d7e3786d266");
  const [mode, setMode] = useState<"archive" | "handover">("archive");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recentJobs, setRecentJobs] = useState<ImportJob[]>([]);

  useEffect(() => {
    let cancelled = false;

    void listImports()
      .then((jobs) => {
        if (!cancelled) {
          setRecentJobs(jobs.slice(0, 3));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecentJobs([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const job = await createImport({ url, mode });
      startTransition(() => {
        navigate(`/imports/${job.id}`);
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "The import could not be started."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="space-y-6">
        <Card className="overflow-hidden">
          <CardHeader className="space-y-4">
            <Badge className="w-fit">Performance First</Badge>
            <div className="space-y-3">
              <CardTitle className="max-w-3xl text-4xl leading-tight sm:text-5xl">
                Turn closed AI share pages into portable transcripts that stay fast.
              </CardTitle>
              <CardDescription className="max-w-2xl text-base leading-7">
                This scaffold is intentionally narrow: import public ChatGPT share links,
                normalize them into a stable conversation model and render outputs for
                archive and handover without dragging in a heavyweight app framework.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-3">
                <label className="text-sm font-medium text-foreground" htmlFor="share-url">
                  Share link
                </label>
                <Input
                  id="share-url"
                  inputMode="url"
                  placeholder="https://chatgpt.com/share/..."
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant={mode === "archive" ? "default" : "outline"}
                  onClick={() => setMode("archive")}
                >
                  Archive mode
                </Button>
                <Button
                  type="button"
                  variant={mode === "handover" ? "default" : "outline"}
                  onClick={() => setMode("handover")}
                >
                  Handover mode
                </Button>
              </div>

              {error ? (
                <div className="rounded-xl border border-red-300/40 bg-red-100/60 px-4 py-3 text-sm text-red-900">
                  {error}
                </div>
              ) : null}

              <Button className="w-full sm:w-auto" size="lg" disabled={submitting} type="submit">
                {submitting ? "Starting import…" : "Create import job"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              {featureCards.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-border/70 bg-background/65 p-4"
                >
                  <div className="mb-3 inline-flex rounded-xl bg-primary/10 p-2 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h2 className="mb-2 text-base font-semibold">{title}</h2>
                  <p className="text-sm leading-6 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <aside className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Current build</CardTitle>
            <CardDescription>
              Public ChatGPT share links are fetched with Playwright, persisted in
              SQLite and optionally repaired with an OpenAI or Cerebras structuring
              pass when a provider key is configured.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
            <div className="rounded-2xl bg-secondary p-4 text-secondary-foreground">
              Web stays route-split and lightweight. Server owns browser automation,
              deterministic extraction and the optional AI repair pass.
            </div>
            <ul className="space-y-3">
              <li>Reader view for a human-friendly archive.</li>
              <li>Markdown export for notes, files and Git.</li>
              <li>Bot handover transcript for continuation in another model.</li>
              <li>JSON export for future normalization and storage.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent prototype jobs</CardTitle>
            <CardDescription>
              Imports are stored in SQLite so completed jobs survive restarts and keep
              their debug snapshots.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs yet.</p>
            ) : (
              recentJobs.map((job) => (
                <button
                  key={job.id}
                  className="w-full rounded-2xl border border-border/70 bg-background/60 p-4 text-left transition hover:bg-background"
                  onClick={() => navigate(`/imports/${job.id}`)}
                  type="button"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium text-foreground">
                      {job.sourceUrl}
                    </p>
                    <Badge variant="outline">{job.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Stage: {job.currentStage}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
