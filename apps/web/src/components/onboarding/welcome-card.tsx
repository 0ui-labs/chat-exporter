import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STORAGE_KEY = "onboarding-dismissed";

interface WelcomeCardProps {
  visible: boolean;
  onScrollToInput: () => void;
}

export function WelcomeCard({ visible, onScrollToInput }: WelcomeCardProps) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "true",
  );

  if (!visible || dismissed) {
    return null;
  }

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  }

  return (
    <Card className="relative border-border/90 bg-card/92 shadow-panel">
      <button
        aria-label="Schließen"
        className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
        type="button"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </button>

      <CardHeader>
        <CardTitle>Conversations importieren und anpassen</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Füge einen öffentlichen Share-Link ein — zum Beispiel von ChatGPT oder
          Claude — und passe das Gesprächsformat nach deinen Wünschen an.
        </p>

        <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
          <li>Link einfügen und importieren</li>
          <li>Zwischen Ansichten wechseln</li>
          <li>Stellen markieren und anpassen lassen</li>
        </ol>

        <Button variant="outline" onClick={onScrollToInput}>
          Probiere es aus →
        </Button>
      </CardContent>
    </Card>
  );
}
