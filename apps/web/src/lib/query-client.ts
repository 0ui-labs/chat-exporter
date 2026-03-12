import { QueryClient } from "@tanstack/react-query";

export const QUERY_STALE_TIME_MS = 30_000;
export const QUERY_RETRY_ATTEMPTS = 1;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME_MS,
      retry: QUERY_RETRY_ATTEMPTS,
    },
  },
});
