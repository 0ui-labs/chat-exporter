import type { ImportJob } from "@chat-exporter/shared";

/**
 * Ordered stage-to-progress mapping for import jobs.
 * Returns a percentage (0–100) based on the job's current status and stage.
 */

const stageProgressMap: Record<string, number> = {
  queued: 0,
  validate: 10,
  fetch: 25,
  extract: 45,
  normalize: 60,
  structure: 75,
  render: 90,
  done: 100,
};

export function getStageProgress(
  job: Pick<ImportJob, "status" | "currentStage">,
): number {
  if (job.status === "completed") return 100;
  if (job.status === "failed") return stageProgressMap[job.currentStage] ?? 0;
  if (job.status === "queued") return 0;

  return stageProgressMap[job.currentStage] ?? 0;
}
