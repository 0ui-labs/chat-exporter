const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export function formatRelativeTime(dateString: string): string {
  const diff = Date.now() - Date.parse(dateString);

  if (diff < MINUTE) return "gerade eben";
  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return `vor ${minutes} Min.`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `vor ${hours} Std.`;
  }
  if (diff < 2 * DAY) return "gestern";

  const days = Math.floor(diff / DAY);
  if (days < 30) return `vor ${days} Tagen`;

  return new Date(dateString).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
