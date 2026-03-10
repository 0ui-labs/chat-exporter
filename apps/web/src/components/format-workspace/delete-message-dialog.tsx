import { useState } from "react";
import { Button } from "@/components/ui/button";

type DeleteMessageDialogProps = {
  messagePreview: string;
  isRound: boolean;
  roundCount?: number;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
};

export function DeleteMessageDialog({
  messagePreview,
  isRound,
  roundCount,
  onConfirm,
  onCancel,
}: DeleteMessageDialogProps) {
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-lg">
        <h3 className="text-base font-semibold mb-3">
          {isRound
            ? `Round löschen (${roundCount ?? 0} Nachrichten)`
            : "Nachricht löschen"}
        </h3>

        <div className="mb-4 max-h-32 overflow-y-auto rounded-xl border border-border/60 bg-secondary/30 p-3 text-sm text-muted-foreground">
          {messagePreview}
        </div>

        <div className="mb-4">
          <label
            htmlFor="delete-reason"
            className="block text-sm mb-1 text-muted-foreground"
          >
            Grund (optional)
          </label>
          <input
            id="delete-reason"
            type="text"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="z.B. irrelevant, doppelt..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={() => onConfirm(reason || undefined)}
          >
            Löschen
          </Button>
        </div>
      </div>
    </div>
  );
}
