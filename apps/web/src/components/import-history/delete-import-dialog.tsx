import type { ImportSummary } from "@chat-exporter/shared";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { rpc } from "@/lib/rpc";

interface DeleteImportDialogProps {
  import_: ImportSummary;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteImportDialog({
  import_,
  onClose,
  onDeleted,
}: DeleteImportDialogProps) {
  const title = import_.pageTitle || import_.sourceUrl;

  const deleteMutation = useMutation({
    mutationFn: () => rpc.imports.delete({ id: import_.id }),
    onSuccess: () => {
      toast.success("Import gelöscht");
      onDeleted();
    },
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
    >
      <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <h2 className="mb-2 text-lg font-semibold">Import löschen</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Import &ldquo;
          {title.length > 60 ? `${title.slice(0, 57)}...` : title}
          &rdquo; wirklich löschen? Diese Aktion kann nicht rückgängig gemacht
          werden.
        </p>

        {deleteMutation.error ? (
          <div className="mb-4 rounded-lg border border-red-300/40 bg-red-100/60 px-3 py-2 text-sm text-red-900">
            {deleteMutation.error.message}
          </div>
        ) : null}

        <div className="flex justify-end gap-3">
          <Button
            disabled={deleteMutation.isPending}
            variant="ghost"
            onClick={onClose}
          >
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? "Wird gelöscht..." : "Löschen"}
          </Button>
        </div>
      </div>
    </div>
  );
}
