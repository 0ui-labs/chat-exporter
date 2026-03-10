import type { ImportSummary } from "@chat-exporter/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { orpc } from "@/lib/orpc";
import { formatRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

import { DeleteImportDialog } from "./delete-import-dialog";
import { ImportHistoryFilters } from "./import-history-filters";

type SortField = "createdAt" | "updatedAt" | "sourcePlatform" | "status";
type SortOrder = "asc" | "desc";

const platformLabels: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
  deepseek: "DeepSeek",
  notebooklm: "NotebookLM",
  unknown: "Unbekannt",
};

const defaultStatusConfig = {
  label: "Unbekannt",
  className: "border-gray-300/40 bg-gray-100/60 text-gray-700",
};

const statusConfig: Record<string, { label: string; className: string }> = {
  completed: {
    label: "Abgeschlossen",
    className: "border-green-300/40 bg-green-100/60 text-green-800",
  },
  failed: {
    label: "Fehlgeschlagen",
    className: "border-red-300/40 bg-red-100/60 text-red-800",
  },
  running: {
    label: "Läuft",
    className: "border-yellow-300/40 bg-yellow-100/60 text-yellow-800",
  },
  queued: {
    label: "Warteschlange",
    className: "border-gray-300/40 bg-gray-100/60 text-gray-700",
  },
};

function formatTitle(imp: ImportSummary): string {
  if (imp.pageTitle) return imp.pageTitle;
  try {
    const url = new URL(imp.sourceUrl);
    return `${url.hostname}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return imp.sourceUrl;
  }
}

function SortIcon({
  field,
  activeField,
  order,
}: {
  field: SortField;
  activeField: SortField;
  order: SortOrder;
}) {
  if (field !== activeField)
    return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
  return order === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5" />
  );
}

export function ImportHistoryTable() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const sortBy = (searchParams.get("sort") as SortField) || "createdAt";
  const sortOrder = (searchParams.get("order") as SortOrder) || "desc";
  const statusFilter = searchParams.get("status") || undefined;
  const platformFilter = searchParams.get("platform") || undefined;
  const searchQuery = searchParams.get("search") || undefined;

  const [deleteTarget, setDeleteTarget] = useState<ImportSummary | null>(null);

  const { data: imports = [], isLoading } = useQuery(
    orpc.imports.list.queryOptions({
      input: {
        sortBy,
        sortOrder,
        status: statusFilter as
          | "completed"
          | "failed"
          | "running"
          | "queued"
          | undefined,
        platform: platformFilter as "chatgpt" | "claude" | undefined,
        search: searchQuery,
      },
    }),
  );

  function updateParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSearchParams(next);
  }

  function handleSort(field: SortField) {
    const next = new URLSearchParams(searchParams);
    if (sortBy === field) {
      next.set("order", sortOrder === "asc" ? "desc" : "asc");
    } else {
      next.set("sort", field);
      next.set("order", "desc");
    }
    setSearchParams(next);
  }

  function handleDeleteSuccess() {
    setDeleteTarget(null);
    queryClient.invalidateQueries({ queryKey: orpc.imports.key() });
  }

  const hasActiveFilters = Boolean(
    statusFilter || platformFilter || searchQuery,
  );

  return (
    <div className="space-y-4">
      <ImportHistoryFilters
        onFilterChange={(key, value) => updateParam(key, value)}
        search={searchQuery}
        status={statusFilter}
        platform={platformFilter}
      />

      <Card className="border-border/90 bg-card/92 shadow-panel">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-1 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className="h-14 animate-pulse rounded-lg bg-muted/50"
                />
              ))}
            </div>
          ) : imports.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <p className="text-sm text-muted-foreground">
                {hasActiveFilters
                  ? "Keine Imports gefunden. Versuche andere Filter."
                  : "Noch keine Imports. Starte deinen ersten Import auf der Startseite."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Titel</th>
                    <th className="px-4 py-3 font-medium">
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        type="button"
                        onClick={() => handleSort("sourcePlatform")}
                      >
                        Plattform
                        <SortIcon
                          field="sourcePlatform"
                          activeField={sortBy}
                          order={sortOrder}
                        />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium">
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        type="button"
                        onClick={() => handleSort("status")}
                      >
                        Status
                        <SortIcon
                          field="status"
                          activeField={sortBy}
                          order={sortOrder}
                        />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      Nachrichten
                    </th>
                    <th className="px-4 py-3 font-medium">
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        type="button"
                        onClick={() => handleSort("createdAt")}
                      >
                        Datum
                        <SortIcon
                          field="createdAt"
                          activeField={sortBy}
                          order={sortOrder}
                        />
                      </button>
                    </th>
                    <th className="w-10 px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {imports.map((imp) => {
                    const statusInfo =
                      statusConfig[imp.status] ?? defaultStatusConfig;
                    return (
                      <tr
                        key={imp.id}
                        className="group cursor-pointer border-b border-border/30 transition hover:bg-muted/30"
                        onClick={() => navigate(`/?import=${imp.id}`)}
                      >
                        <td className="max-w-xs truncate px-4 py-3 font-medium">
                          {formatTitle(imp)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {platformLabels[imp.sourcePlatform] ??
                            imp.sourcePlatform}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            className={cn(
                              "text-[10px] uppercase",
                              statusInfo.className,
                            )}
                          >
                            {statusInfo.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {imp.summary?.messageCount ?? "–"}
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
                              setDeleteTarget(imp);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {deleteTarget ? (
        <DeleteImportDialog
          import_={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleteSuccess}
        />
      ) : null}
    </div>
  );
}
