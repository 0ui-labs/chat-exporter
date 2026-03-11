import type { ImportSummary } from "@chat-exporter/shared";
import { Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

import {
  defaultStatusConfig,
  formatTitle,
  platformLabels,
  statusConfig,
} from "./history-labels";

export function ImportHistoryRow({
  imp,
  onDelete,
}: {
  imp: ImportSummary;
  onDelete: (imp: ImportSummary) => void;
}) {
  const navigate = useNavigate();
  const statusInfo = statusConfig[imp.status] ?? defaultStatusConfig;

  return (
    <tr
      className="group cursor-pointer border-b border-border/30 transition hover:bg-muted/30"
      onClick={() => navigate(`/?import=${imp.id}`)}
    >
      <td className="max-w-xs truncate px-4 py-3 font-medium">
        {formatTitle(imp)}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {platformLabels[imp.sourcePlatform] ?? imp.sourcePlatform}
      </td>
      <td className="px-4 py-3">
        <Badge className={cn("text-[10px] uppercase", statusInfo.className)}>
          {statusInfo.label}
        </Badge>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
        {imp.summary?.messageCount ?? "\u2013"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
        {formatRelativeTime(imp.createdAt)}
      </td>
      <td className="px-4 py-3">
        <Button
          className="h-8 w-8 opacity-0 transition group-hover:opacity-100"
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(imp);
          }}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </td>
    </tr>
  );
}
