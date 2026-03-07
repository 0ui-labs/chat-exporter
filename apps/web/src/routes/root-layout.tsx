import { Outlet } from "react-router-dom";

export function RootLayout() {
  return (
    <div className="min-h-screen bg-mesh">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <main className="flex-1 py-2 sm:py-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
