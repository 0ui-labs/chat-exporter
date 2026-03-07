import { Outlet } from "react-router-dom";

export function RootLayout() {
  return (
    <div className="min-h-screen bg-mesh">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <header className="mb-8 flex items-center justify-between rounded-2xl border border-border/80 bg-background/70 px-4 py-3 backdrop-blur sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-primary">
              Chat Exporter
            </p>
            <h1 className="text-lg font-semibold text-foreground">
              Portable AI conversations without framework drag
            </h1>
          </div>
          <div className="hidden text-right text-sm text-muted-foreground sm:block">
            <p>Vite frontend</p>
            <p>Hono import API</p>
          </div>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
