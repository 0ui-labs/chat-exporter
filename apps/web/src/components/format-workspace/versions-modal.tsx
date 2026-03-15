import type { ConversationSnapshot } from "@chat-exporter/shared";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type VersionsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshots: ConversationSnapshot[];
  activeSnapshotId: string | null;
  onActivate: (snapshotId: string) => void;
  onDeactivate: () => void;
  onCreate: (label: string) => void;
  onRename: (snapshotId: string, label: string) => void;
  onDelete: (snapshotId: string) => void;
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function VersionsModal({
  open,
  onOpenChange,
  snapshots,
  activeSnapshotId,
  onActivate,
  onDeactivate,
  onCreate,
  onRename,
  onDelete,
}: VersionsModalProps) {
  const [creatingNew, setCreatingNew] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleActivateOriginal = useCallback(() => {
    onDeactivate();
    onOpenChange(false);
  }, [onDeactivate, onOpenChange]);

  const handleActivateSnapshot = useCallback(
    (snapshotId: string) => {
      onActivate(snapshotId);
      onOpenChange(false);
    },
    [onActivate, onOpenChange],
  );

  const handleCreateSubmit = useCallback(() => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setNewLabel("");
    setCreatingNew(false);
  }, [newLabel, onCreate]);

  const handleRenameSubmit = useCallback(
    (snapshotId: string) => {
      const trimmed = renameValue.trim();
      if (!trimmed) return;
      onRename(snapshotId, trimmed);
      setRenamingId(null);
      setRenameValue("");
    },
    [renameValue, onRename],
  );

  const handleDeleteClick = useCallback(
    (snapshotId: string) => {
      const confirmed = window.confirm(
        "Soll diese Version wirklich gelöscht werden?",
      );
      if (confirmed) {
        onDelete(snapshotId);
      }
    },
    [onDelete],
  );

  const startRename = useCallback((snapshot: ConversationSnapshot) => {
    setRenamingId(snapshot.id);
    setRenameValue(snapshot.label);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Versionen</DialogTitle>
          <DialogDescription className="sr-only">
            Versionen der Konversation verwalten
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {/* Original entry */}
          <div
            data-testid="version-original"
            data-active={activeSnapshotId === null ? "true" : "false"}
            className={`flex items-center justify-between rounded-lg px-3 py-2 ${
              activeSnapshotId === null
                ? "bg-primary/10 border border-primary/30"
                : "hover:bg-muted/50"
            }`}
          >
            <button
              type="button"
              data-testid="version-activate-original"
              className="flex-1 text-left font-medium"
              onClick={handleActivateOriginal}
            >
              Original
            </button>
          </div>

          {/* Snapshot entries */}
          {snapshots.map((snapshot) => (
            <div
              key={snapshot.id}
              data-testid={`version-${snapshot.id}`}
              data-active={activeSnapshotId === snapshot.id ? "true" : "false"}
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                activeSnapshotId === snapshot.id
                  ? "bg-primary/10 border border-primary/30"
                  : "hover:bg-muted/50"
              }`}
            >
              <div className="flex-1 min-w-0">
                {renamingId === snapshot.id ? (
                  <input
                    data-testid={`rename-input-${snapshot.id}`}
                    type="text"
                    className="w-full rounded border px-2 py-1 text-sm"
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleRenameSubmit(snapshot.id);
                      } else if (e.key === "Escape") {
                        setRenamingId(null);
                      }
                    }}
                    onBlur={() => setRenamingId(null)}
                  />
                ) : (
                  <button
                    type="button"
                    data-testid={`version-activate-${snapshot.id}`}
                    className="block w-full text-left"
                    onClick={() => handleActivateSnapshot(snapshot.id)}
                  >
                    <span className="font-medium">{snapshot.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      Erstellt: {formatTimestamp(snapshot.createdAt)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Geändert: {formatTimestamp(snapshot.updatedAt)}
                    </span>
                  </button>
                )}
              </div>

              {renamingId !== snapshot.id && (
                <div className="ml-2 flex items-center gap-1">
                  <button
                    type="button"
                    data-testid={`rename-${snapshot.id}`}
                    className="rounded p-1 hover:bg-muted"
                    onClick={() => startRename(snapshot)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    data-testid={`delete-${snapshot.id}`}
                    className="rounded p-1 hover:bg-destructive/10 text-destructive"
                    onClick={() => handleDeleteClick(snapshot.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* New version creation */}
        {creatingNew ? (
          <div className="flex items-center gap-2">
            <input
              data-testid="new-version-input"
              type="text"
              className="flex-1 rounded border px-2 py-1 text-sm"
              placeholder="Versionsname..."
              value={newLabel}
              autoFocus
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateSubmit();
                } else if (e.key === "Escape") {
                  setCreatingNew(false);
                  setNewLabel("");
                }
              }}
            />
          </div>
        ) : (
          <Button
            data-testid="new-version-button"
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setCreatingNew(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Neue Version
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
