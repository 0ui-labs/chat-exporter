import { Outlet } from "react-router-dom";

export function RootLayout() {
  return (
    <div className="min-h-screen bg-mesh">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <main className="flex-1 py-4 sm:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
