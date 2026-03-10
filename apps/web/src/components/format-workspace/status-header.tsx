import type { ImportJob } from "@chat-exporter/shared";
import { Clock3, LoaderCircle } from "lucide-react";

import { getJobStatusLabel } from "@/components/format-workspace/labels";
import { Badge } from "@/components/ui/badge";

type ActiveStage = {
  detail: string;
  label: string;
} | null;

type StatusHeaderProps = {
  activeStage: ActiveStage;
  elapsedTime: string;
  job: ImportJob;
};

export function StatusHeader({
  activeStage,
  elapsedTime,
  job,
}: StatusHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge variant={job.status === "completed" ? "default" : "outline"}>
        {getJobStatusLabel(job.status)}
      </Badge>
      {job.summary ? (
        <p className="text-sm text-muted-foreground">
          {job.summary.messageCount} Nachrichten · {job.summary.transcriptWords}{" "}
          Wörter
        </p>
      ) : null}
      {job.status !== "completed" && activeStage ? (
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          {job.status === "queued" ? (
            <Clock3 className="h-4 w-4" />
          ) : (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          )}
          <span>{activeStage.label}</span>
          <span>·</span>
          <span>{elapsedTime}</span>
        </div>
      ) : null}
    </div>
  );
}
