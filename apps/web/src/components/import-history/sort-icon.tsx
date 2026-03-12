import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export type SortField = "createdAt" | "updatedAt" | "sourcePlatform" | "status";
export type SortOrder = "asc" | "desc";

export function SortIcon({
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
