import { LoaderCircle } from "lucide-react";

import { miscLabels } from "@/components/format-workspace/labels";

type LoadingStateBlockProps = {
  stageDetail: string | undefined;
};

export function LoadingStateBlock({ stageDetail }: LoadingStateBlockProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-[1.6rem] border border-border/80 bg-card/75 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
          {stageDetail ?? miscLabels.transcriptLoading}
        </div>
        <div className="space-y-3">
          <div className="h-3 w-40 animate-pulse rounded-full bg-primary/15" />
          <div className="h-4 animate-pulse rounded-full bg-border/80" />
          <div className="h-4 w-11/12 animate-pulse rounded-full bg-border/70" />
          <div className="h-4 w-4/5 animate-pulse rounded-full bg-border/60" />
          <div className="h-24 animate-pulse rounded-[1.4rem] border border-border/70 bg-background/80" />
        </div>
      </div>
    </div>
  );
}
