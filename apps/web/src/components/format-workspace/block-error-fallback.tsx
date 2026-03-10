export function BlockErrorFallback({ blockType }: { blockType: string }) {
  return (
    <div className="border border-red-300/40 bg-red-100/70 text-red-900 px-3 py-2 rounded text-sm">
      Block &bdquo;{blockType}&ldquo; konnte nicht dargestellt werden.
    </div>
  );
}
