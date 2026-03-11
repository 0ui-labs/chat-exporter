import type { ImportSummary } from "@chat-exporter/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import { orpc } from "@/lib/orpc";

import { DeleteImportDialog } from "./delete-import-dialog";
import { ImportHistoryFilters } from "./import-history-filters";
import { ImportHistoryRow } from "./import-history-row";
import type { SortField, SortOrder } from "./sort-icon";
import { SortIcon } from "./sort-icon";

export function ImportHistoryTable() {
  const [searchParams, setSearchParams] = useSearchParams();
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
                  // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
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
                  {imports.map((imp) => (
                    <ImportHistoryRow
                      key={imp.id}
                      imp={imp}
                      onDelete={setDeleteTarget}
                    />
                  ))}
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
