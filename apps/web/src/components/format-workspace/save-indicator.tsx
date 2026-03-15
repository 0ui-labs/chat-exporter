type SaveIndicatorProps = {
  isSaving: boolean;
  hasEdits: boolean;
};

export function SaveIndicator({ isSaving, hasEdits }: SaveIndicatorProps) {
  if (!hasEdits) return null;

  return (
    <span className="text-xs text-muted-foreground">
      {isSaving ? "Speichert..." : "Gespeichert \u2713"}
    </span>
  );
}
