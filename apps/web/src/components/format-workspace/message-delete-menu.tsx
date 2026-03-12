import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type MessageDeleteMenuProps = {
  onDeleteMessage: () => void;
  onDeleteRound: () => void;
};

export function MessageDeleteMenu({
  onDeleteMessage,
  onDeleteRound,
}: MessageDeleteMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-red-600 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        aria-label="Löschen-Optionen"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 min-w-[180px] rounded-xl border border-border bg-background py-1 shadow-lg">
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-sm hover:bg-secondary/50"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDeleteMessage();
            }}
          >
            Nachricht löschen
          </button>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-sm hover:bg-secondary/50"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDeleteRound();
            }}
          >
            Round löschen
          </button>
        </div>
      )}
    </div>
  );
}
