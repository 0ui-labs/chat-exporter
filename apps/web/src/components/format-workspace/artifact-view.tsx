type ArtifactViewProps = {
  content: string;
};

export function ArtifactView({ content }: ArtifactViewProps) {
  return (
    <div className="rounded-[1.6rem] border border-border/80 bg-zinc-950 p-5 text-sm text-zinc-100">
      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">
        <code>{content}</code>
      </pre>
    </div>
  );
}
