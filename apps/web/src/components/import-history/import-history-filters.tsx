import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const statusOptions = [
  { value: undefined, label: "Alle" },
  { value: "completed", label: "Abgeschlossen" },
  { value: "failed", label: "Fehlgeschlagen" },
  { value: "running", label: "Läuft" },
] as const;

const platformOptions = [
  { value: undefined, label: "Alle Plattformen" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini" },
  { value: "grok", label: "Grok" },
  { value: "deepseek", label: "DeepSeek" },
] as const;

interface ImportHistoryFiltersProps {
  onFilterChange: (key: string, value: string | undefined) => void;
  search?: string;
  status?: string;
  platform?: string;
}

export function ImportHistoryFilters({
  onFilterChange,
  search,
  status,
  platform,
}: ImportHistoryFiltersProps) {
  const [localSearch, setLocalSearch] = useState(search ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setLocalSearch(search ?? "");
  }, [search]);

  function handleSearchChange(value: string) {
    setLocalSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFilterChange("search", value || undefined);
    }, 300);
  }

  const activeFilters: { key: string; label: string }[] = [];
  if (status) {
    const opt = statusOptions.find((o) => o.value === status);
    activeFilters.push({ key: "status", label: opt?.label ?? status });
  }
  if (platform) {
    const opt = platformOptions.find((o) => o.value === platform);
    activeFilters.push({ key: "platform", label: opt?.label ?? platform });
  }
  if (search) {
    activeFilters.push({ key: "search", label: `"${search}"` });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9 text-sm"
            placeholder="Suche nach Titel oder URL..."
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        <div className="flex gap-1">
          {statusOptions.map((opt) => (
            <Button
              key={opt.label}
              className={cn(
                "h-9 text-xs",
                status === opt.value || (!status && !opt.value)
                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                  : "",
              )}
              size="sm"
              variant="ghost"
              onClick={() => onFilterChange("status", opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        <select
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          value={platform ?? ""}
          onChange={(e) =>
            onFilterChange("platform", e.target.value || undefined)
          }
        >
          {platformOptions.map((opt) => (
            <option key={opt.label} value={opt.value ?? ""}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {activeFilters.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/65 px-3 py-1 text-xs text-foreground transition hover:bg-foreground/5"
              type="button"
              onClick={() => onFilterChange(filter.key, undefined)}
            >
              {filter.label}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
