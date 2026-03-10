import { describe, expect, test } from "vitest";

import {
  QUERY_RETRY_ATTEMPTS,
  QUERY_STALE_TIME_MS,
  queryClient,
} from "./query-client";

describe("query-client constants", () => {
  test("QUERY_STALE_TIME_MS is 30_000", () => {
    expect(QUERY_STALE_TIME_MS).toBe(30_000);
  });

  test("QUERY_RETRY_ATTEMPTS is 1", () => {
    expect(QUERY_RETRY_ATTEMPTS).toBe(1);
  });

  test("queryClient uses QUERY_STALE_TIME_MS as default staleTime", () => {
    const defaults = queryClient.getDefaultOptions();

    expect(defaults.queries?.staleTime).toBe(QUERY_STALE_TIME_MS);
  });

  test("queryClient uses QUERY_RETRY_ATTEMPTS as default retry", () => {
    const defaults = queryClient.getDefaultOptions();

    expect(defaults.queries?.retry).toBe(QUERY_RETRY_ATTEMPTS);
  });
});
