import { useCallback, useState } from "react";

type DeletionToastState = {
  message: string;
  messageId: string;
} | null;

export function useDeletionToast() {
  const [toast, setToast] = useState<DeletionToastState>(null);

  const showDeletedToast = useCallback(
    (messageId: string, isRound: boolean, count?: number) => {
      const message = isRound
        ? `Round (${count} Nachrichten) gelöscht`
        : "Nachricht gelöscht";
      setToast({ message, messageId });
    },
    [],
  );

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  return {
    toast,
    showDeletedToast,
    dismissToast,
  };
}
