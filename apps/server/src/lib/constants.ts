/** Maximale Größe des gecrawlten HTML in Bytes (10 MB). */
export const MAX_RAW_HTML_BYTES = 10 * 1024 * 1024;

/** Maximale Anzahl Messages nach Normalisierung. */
export const MAX_MESSAGE_COUNT = 5_000;

/** Timeout pro Import-Job in Millisekunden (120 Sekunden). */
export const IMPORT_TIMEOUT_MS = 120_000;

/** Maximale gleichzeitige Browser-Contexts im Pool. */
export const MAX_CONCURRENT_BROWSER_CONTEXTS = 3;

/** Browser-Idle-Timeout bevor er geschlossen wird (60 Sekunden). */
export const BROWSER_IDLE_SHUTDOWN_MS = 60_000;
