import { createBrowserRouter } from "react-router-dom";

import { RootLayout } from "./routes/root-layout";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import("./routes/home-page")).HomePage,
        }),
      },
      {
        path: "history",
        lazy: async () => ({
          Component: (await import("./routes/history-page")).HistoryPage,
        }),
      },
      {
        path: "imports/:importId",
        lazy: async () => ({
          Component: (await import("./routes/import-detail-page"))
            .ImportDetailPage,
        }),
      },
    ],
  },
]);
