import { ImportHistoryTable } from "@/components/import-history/import-history-table";

export function HistoryPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Import-Verlauf</h1>
      <ImportHistoryTable />
    </div>
  );
}
