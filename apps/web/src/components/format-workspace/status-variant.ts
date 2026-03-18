import type { ImportStatus } from "@chat-exporter/shared";
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const statusVariantMap: Record<ImportStatus, BadgeVariant> = {
  completed: "success",
  failed: "error",
  running: "warning",
  queued: "info",
};

export function getStatusVariant(status: ImportStatus): BadgeVariant {
  return statusVariantMap[status];
}
