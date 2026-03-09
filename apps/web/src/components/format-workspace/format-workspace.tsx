import type {
  AdjustmentSessionDetail,
  FormatRule,
  ImportJob,
} from "@chat-exporter/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, LoaderCircle, Settings2 } from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { AdjustmentModeGuide } from "@/components/format-workspace/adjustment-mode-guide";
import { AdjustmentPopover } from "@/components/format-workspace/adjustment-popover";
import { ArtifactView } from "@/components/format-workspace/artifact-view";
import {
  getBlockTypeLabel,
  getRoleLabel,
  getViewLabel,
} from "@/components/format-workspace/labels";
import { MarkdownView } from "@/components/format-workspace/markdown-view";
import { ReaderView } from "@/components/format-workspace/reader-view";
import { applyMarkdownRules } from "@/components/format-workspace/rule-engine";
import { RulesListPopover } from "@/components/format-workspace/rules-list-popover";
import type {
  AdjustmentSelection,
  FloatingAdjustmentAnchor,
  ViewMode,
  ViewportAnchor,
} from "@/components/format-workspace/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/orpc";
import { rpc } from "@/lib/rpc";

type ActiveStage = {
  detail: string;
  label: string;
} | null;

type FormatWorkspaceProps = {
  activeStage: ActiveStage;
  elapsedTime: string;
  job: ImportJob;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
};

const outputViews: { value: ViewMode; label: string }[] = [
  { value: "reader", label: getViewLabel("reader") },
  { value: "markdown", label: getViewLabel("markdown") },
  { value: "handover", label: getViewLabel("handover") },
  { value: "json", label: getViewLabel("json") },
];

const adjustableViews = new Set<ViewMode>(["reader", "markdown"]);

function _describeSelectionLabel(selection: AdjustmentSelection) {
  if (selection.lineStart !== undefined && selection.lineEnd !== undefined) {
    return `Markdown-Zeilen ${selection.lineStart}-${selection.lineEnd}`;
  }

  return `${getRoleLabel(selection.messageRole)}-Nachricht ${selection.messageIndex + 1} · ${getBlockTypeLabel(selection.blockType)}`;
}

function getStatusLabel(job: ImportJob) {
  if (job.status === "completed") {
    return "Bereit";
  }

  if (job.status === "failed") {
    return "Fehlgeschlagen";
  }

  if (job.status === "queued") {
    return "Warteschlange";
  }

  return "Import läuft";
}

function renderArtifact(view: Exclude<ViewMode, "reader">, job: ImportJob) {
  if (!job.artifacts) {
    return "Artefakt ist noch nicht verfügbar.";
  }

  switch (view) {
    case "markdown":
      return job.artifacts.markdown;
    case "handover":
      return job.artifacts.handover;
    case "json":
      return job.artifacts.json;
  }
}

export function FormatWorkspace({
  activeStage,
  elapsedTime,
  job,
  view,
  onViewChange,
}: FormatWorkspaceProps) {
  const queryClient = useQueryClient();
  const sectionRef = useRef<HTMLElement | null>(null);
  const selectionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // --- UI-only state (stays as useState) ---
  const [draftMessageByView, setDraftMessageByView] = useState<
    Record<ViewMode, string>
  >({
    reader: "",
    markdown: "",
    handover: "",
    json: "",
  });
  const [adjustModeByView, setAdjustModeByView] = useState<
    Record<ViewMode, boolean>
  >({
    reader: false,
    markdown: false,
    handover: false,
    json: false,
  });
  const [guideDismissedByView, setGuideDismissedByView] = useState<
    Record<ViewMode, boolean>
  >({
    reader: false,
    markdown: false,
    handover: false,
    json: false,
  });
  const [selectionByView, setSelectionByView] = useState<
    Record<ViewMode, AdjustmentSelection | null>
  >({
    reader: null,
    markdown: null,
    handover: null,
    json: null,
  });
  const [anchorByView, setAnchorByView] = useState<
    Record<ViewMode, FloatingAdjustmentAnchor | null>
  >({
    reader: null,
    markdown: null,
    handover: null,
    json: null,
  });
  const [containerDimensions, setContainerDimensions] = useState<{
    width: number;
    height: number;
  }>({
    width: 0,
    height: 0,
  });
  const [hoveredRuleId, setHoveredRuleId] = useState<string | null>(null);
  const [replyVisibleByView, setReplyVisibleByView] = useState<
    Record<ViewMode, boolean>
  >({
    reader: false,
    markdown: false,
    handover: false,
    json: false,
  });
  const [sessionSelectionKeyByView, setSessionSelectionKeyByView] = useState<
    Record<ViewMode, string | null>
  >({
    reader: null,
    markdown: null,
    handover: null,
    json: null,
  });

  // --- Session detail (populated from mutation results) ---
  const [activeSessionDetail, setActiveSessionDetail] =
    useState<AdjustmentSessionDetail | null>(null);

  // --- Session error (shared across create/append/discard) ---
  const [sessionError, setSessionError] = useState<string | null>(null);

  // --- TanStack Query: rules ---
  const isAdjustableView = adjustableViews.has(view);

  const rulesQuery = useQuery({
    ...orpc.rules.list.queryOptions({
      input: { importId: job.id, format: view },
    }),
    enabled: isAdjustableView,
  });
  const activeRules: FormatRule[] = rulesQuery.data ?? [];

  // --- TanStack Query: create session mutation ---
  const createSession = useMutation(
    orpc.adjustments.createSession.mutationOptions(),
  );

  // --- TanStack Query: append message mutation ---
  const appendMessage = useMutation(
    orpc.adjustments.appendMessage.mutationOptions({
      onSuccess: (nextDetail) => {
        setActiveSessionDetail(nextDetail);
        setDraftMessageByView((current) => ({
          ...current,
          [view]: "",
        }));
        setReplyVisibleByView((current) => ({
          ...current,
          [view]: true,
        }));

        if (nextDetail.session.status === "applied") {
          queryClient.invalidateQueries({
            queryKey: orpc.rules.list.key(),
          });
        }
      },
      onError: (error) => {
        setSessionError(
          error instanceof Error
            ? error.message
            : "Anpassungsnachricht konnte nicht gespeichert werden.",
        );
      },
    }),
  );

  // --- TanStack Query: discard session mutation ---
  const discardSession = useMutation(
    orpc.adjustments.discard.mutationOptions({
      onSuccess: () => {
        clearCurrentAdjustmentState(view);
      },
      onError: (error) => {
        if (
          activeSessionDetail &&
          activeSessionDetail.session.status === "applied"
        ) {
          clearCurrentAdjustmentState(view);
        } else {
          setSessionError(
            error instanceof Error
              ? error.message
              : "Anpassungssession konnte nicht verworfen werden.",
          );
        }
      },
    }),
  );

  // Track which rule IDs are currently being disabled
  const [disablingRuleById, setDisablingRuleById] = useState<
    Record<string, boolean>
  >({});

  useLayoutEffect(() => {
    const node = sectionRef.current;

    if (!node) {
      return;
    }

    const updateDimensions = () => {
      setContainerDimensions((current) => {
        const nextWidth = node.clientWidth;
        const nextHeight = node.clientHeight;

        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }

        return { width: nextWidth, height: nextHeight };
      });
    };

    updateDimensions();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateDimensions);

    resizeObserver?.observe(node);

    return () => {
      resizeObserver?.disconnect();
    };
  }, []);

  const artifact = view === "reader" ? "" : renderArtifact(view, job);
  const isAdjustModeEnabled = adjustModeByView[view];
  const activeDraftMessage = draftMessageByView[view];
  const activeSelection = selectionByView[view];
  const activeAnchor = anchorByView[view];
  const activeSelectionKey = sessionSelectionKeyByView[view];
  const displayedMarkdown =
    view === "markdown" ? applyMarkdownRules(artifact, activeRules) : artifact;
  const isDiscarding = discardSession.isPending;
  const isSubmittingMessage = appendMessage.isPending;
  const activeSessionLoading = createSession.isPending;
  const activeSessionError = sessionError;
  const showGuide =
    isAdjustModeEnabled && !activeSelection && !guideDismissedByView[view];
  const showPopover =
    isAdjustModeEnabled && Boolean(activeSelection) && Boolean(activeAnchor);

  function clearCurrentAdjustmentState(targetView: ViewMode) {
    setDraftMessageByView((current) => ({
      ...current,
      [targetView]: "",
    }));
    setSelectionByView((current) => ({
      ...current,
      [targetView]: null,
    }));
    setAnchorByView((current) => ({
      ...current,
      [targetView]: null,
    }));
    setActiveSessionDetail(null);
    setSessionSelectionKeyByView((current) => ({
      ...current,
      [targetView]: null,
    }));
    setSessionError(null);
    setReplyVisibleByView((current) => ({
      ...current,
      [targetView]: false,
    }));
  }

  useEffect(() => {
    if (!isAdjustableView && isAdjustModeEnabled) {
      setAdjustModeByView((current) => ({
        ...current,
        [view]: false,
      }));
    }
  }, [isAdjustModeEnabled, isAdjustableView, view]);

  // Debounced session creation on selection change
  useEffect(() => {
    if (!isAdjustModeEnabled || !isAdjustableView || !activeSelection) {
      return;
    }

    const nextSelectionKey = JSON.stringify(activeSelection);

    if (
      activeSelectionKey === nextSelectionKey &&
      activeSessionDetail &&
      activeSessionDetail.session.importId === job.id
    ) {
      return;
    }

    if (selectionDebounceRef.current !== null) {
      clearTimeout(selectionDebounceRef.current);
    }

    selectionDebounceRef.current = setTimeout(() => {
      setSessionError(null);

      createSession.mutate(
        {
          importId: job.id,
          selection: activeSelection,
          targetFormat: view,
        },
        {
          onSuccess: (detail) => {
            setActiveSessionDetail(detail);
            setSessionSelectionKeyByView((current) => ({
              ...current,
              [view]: nextSelectionKey,
            }));
          },
          onError: (error) => {
            setSessionError(
              error instanceof Error
                ? error.message
                : "Anpassungssession konnte nicht erstellt werden.",
            );
          },
        },
      );
    }, 250);

    return () => {
      if (selectionDebounceRef.current !== null) {
        clearTimeout(selectionDebounceRef.current);
      }
    };
  }, [
    activeSelection,
    activeSelectionKey,
    activeSessionDetail,
    createSession.mutate,
    isAdjustModeEnabled,
    isAdjustableView,
    job.id,
    view,
  ]);

  function toggleAdjustMode() {
    if (!isAdjustableView) {
      return;
    }

    const nextEnabled = !adjustModeByView[view];

    setAdjustModeByView((current) => ({
      ...current,
      [view]: nextEnabled,
    }));
    setGuideDismissedByView((current) => ({
      ...current,
      [view]: false,
    }));

    if (!nextEnabled) {
      clearCurrentAdjustmentState(view);
    }
  }

  function handleSelectionChange(
    selection: AdjustmentSelection,
    anchor: ViewportAnchor,
  ) {
    const container = sectionRef.current;
    let containerAnchor = anchor;

    if (container) {
      const containerRect = container.getBoundingClientRect();
      containerAnchor = {
        top: anchor.top - containerRect.top + container.scrollTop,
        bottom: anchor.bottom - containerRect.top + container.scrollTop,
        left: anchor.left - containerRect.left,
        width: anchor.width,
        height: anchor.height,
      };
    }

    setSelectionByView((current) => ({
      ...current,
      [view]: selection,
    }));
    setAnchorByView((current) => ({
      ...current,
      [view]: containerAnchor,
    }));
    setGuideDismissedByView((current) => ({
      ...current,
      [view]: true,
    }));
    setSessionError(null);
    setReplyVisibleByView((current) => ({
      ...current,
      [view]: false,
    }));
  }

  function handleDraftMessageChange(value: string) {
    setDraftMessageByView((current) => ({
      ...current,
      [view]: value,
    }));
  }

  function handleSubmitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeSessionDetail) {
      return;
    }

    const content = activeDraftMessage.trim();

    if (!content) {
      return;
    }

    setSessionError(null);

    appendMessage.mutate({
      sessionId: activeSessionDetail.session.id,
      content,
    });
  }

  function handleDiscardSession() {
    if (!activeSessionDetail) {
      clearCurrentAdjustmentState(view);
      return;
    }

    setSessionError(null);

    discardSession.mutate({
      sessionId: activeSessionDetail.session.id,
    });
  }

  async function handleRejectLastChange() {
    if (!activeSessionDetail) {
      return;
    }

    let matchingRule = activeRules.find(
      (rule) =>
        rule.sourceSessionId === activeSessionDetail.session.id &&
        rule.status === "active",
    );

    if (!matchingRule) {
      try {
        const freshRules = await rpc.rules.list({
          importId: job.id,
          format: view,
        });
        // Invalidate the query cache so it picks up the fresh data
        queryClient.invalidateQueries({
          queryKey: orpc.rules.list.key(),
        });
        matchingRule = freshRules.find(
          (rule) =>
            rule.sourceSessionId === activeSessionDetail.session.id &&
            rule.status === "active",
        );
      } catch {
        // Rules konnten nicht neu geladen werden – Reply bleibt sichtbar.
        return;
      }
    }

    if (!matchingRule) {
      return;
    }

    const success = await handleDisableRule(matchingRule.id);

    if (success) {
      setReplyVisibleByView((current) => ({
        ...current,
        [view]: false,
      }));
    }
  }

  async function handleDisableRule(ruleId: string): Promise<boolean> {
    setDisablingRuleById((current) => ({
      ...current,
      [ruleId]: true,
    }));
    setSessionError(null);

    try {
      await rpc.rules.disable({ id: ruleId });

      queryClient.invalidateQueries({
        queryKey: orpc.rules.list.key(),
      });

      setHoveredRuleId((current) => (current === ruleId ? null : current));
      return true;
    } catch (error) {
      setSessionError(
        error instanceof Error
          ? error.message
          : "Formatregel konnte nicht deaktiviert werden.",
      );
      return false;
    } finally {
      setDisablingRuleById((current) => {
        const nextState = { ...current };
        delete nextState[ruleId];
        return nextState;
      });
    }
  }

  return (
    <section
      ref={sectionRef}
      className="relative space-y-4 rounded-[1.9rem] border border-border/80 bg-background/70 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={job.status === "completed" ? "default" : "outline"}>
          {getStatusLabel(job)}
        </Badge>
        {job.summary ? (
          <p className="text-sm text-muted-foreground">
            {job.summary.messageCount} Nachrichten ·{" "}
            {job.summary.transcriptWords} Wörter
          </p>
        ) : null}
        {job.status !== "completed" && activeStage ? (
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            {job.status === "queued" ? (
              <Clock3 className="h-4 w-4" />
            ) : (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            )}
            <span>{activeStage.label}</span>
            <span>·</span>
            <span>{elapsedTime}</span>
          </div>
        ) : null}
      </div>

      {job.warnings.length > 0 ? (
        <div className="rounded-2xl border border-amber-300/40 bg-amber-100/60 px-4 py-3 text-sm text-amber-950">
          {job.warnings[0]}
        </div>
      ) : null}

      {job.status === "failed" ? null : job.status === "queued" ||
        job.status === "running" ? (
        <div className="space-y-3">
          <div className="rounded-[1.6rem] border border-border/80 bg-card/75 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
              {activeStage?.detail ?? "Transkript wird vorbereitet"}
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
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {outputViews.map((outputView) => (
                <Button
                  key={outputView.value}
                  data-testid={`format-view-${outputView.value}`}
                  type="button"
                  size="sm"
                  variant={view === outputView.value ? "default" : "outline"}
                  onClick={() => onViewChange(outputView.value)}
                >
                  {outputView.label}
                </Button>
              ))}
            </div>

            {isAdjustableView ? (
              <div className="flex items-center gap-2">
                <RulesListPopover
                  disablingRuleById={disablingRuleById}
                  rules={activeRules}
                  view={view}
                  onDisableRule={(ruleId) => {
                    void handleDisableRule(ruleId);
                  }}
                  onHoverRule={(ruleId) => setHoveredRuleId(ruleId)}
                  onLeaveRule={() => setHoveredRuleId(null)}
                />
                <Button
                  data-testid={`toggle-adjust-mode-${view}`}
                  type="button"
                  size="sm"
                  variant={isAdjustModeEnabled ? "default" : "outline"}
                  onClick={toggleAdjustMode}
                >
                  <Settings2 className="mr-2 h-4 w-4" />
                  {isAdjustModeEnabled
                    ? "Anpassungsmodus beenden"
                    : `${getViewLabel(view)} anpassen`}
                </Button>
              </div>
            ) : null}
          </div>

          {activeSessionError && !isAdjustModeEnabled ? (
            <div className="rounded-2xl border border-red-300/40 bg-red-100/70 px-4 py-3 text-sm text-red-900">
              {activeSessionError}
            </div>
          ) : null}

          {view === "reader" ? (
            <ReaderView
              activeRules={activeRules}
              conversation={job.conversation}
              adjustModeEnabled={isAdjustModeEnabled}
              highlightedRuleId={hoveredRuleId}
              selectedBlock={view === "reader" ? activeSelection : null}
              onSelectBlock={handleSelectionChange}
            />
          ) : view === "markdown" ? (
            <MarkdownView
              activeRules={activeRules}
              content={displayedMarkdown}
              adjustModeEnabled={isAdjustModeEnabled}
              highlightedRuleId={hoveredRuleId}
              selectedRange={activeSelection}
              onSelectLines={handleSelectionChange}
            />
          ) : (
            <ArtifactView content={artifact} />
          )}

          {showGuide ? (
            <AdjustmentModeGuide
              view={view}
              onDismiss={() => {
                setGuideDismissedByView((current) => ({
                  ...current,
                  [view]: true,
                }));
              }}
            />
          ) : null}

          {showPopover && activeSelection && activeAnchor ? (
            <AdjustmentPopover
              anchor={activeAnchor}
              containerDimensions={containerDimensions}
              containerScrollTop={sectionRef.current?.scrollTop ?? 0}
              draftMessage={activeDraftMessage}
              error={activeSessionError}
              isLoading={activeSessionLoading || isDiscarding}
              isSubmitting={isSubmittingMessage}
              sessionDetail={activeSessionDetail}
              showReply={replyVisibleByView[view]}
              view={view}
              onClose={() => {
                handleDiscardSession();
              }}
              onDraftMessageChange={handleDraftMessageChange}
              onRejectLastChange={() => {
                void handleRejectLastChange();
              }}
              onSubmitMessage={handleSubmitMessage}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
