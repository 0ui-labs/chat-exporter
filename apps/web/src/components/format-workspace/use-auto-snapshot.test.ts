import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useAutoSnapshot } from "./use-auto-snapshot";

describe("useAutoSnapshot", () => {
  const createMock = vi.fn();
  const activateMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue({
      id: "snap-new",
      label: "Bearbeitet",
      isActive: false,
    });
    activateMock.mockResolvedValue(undefined);
  });

  test("creates and activates a snapshot on first edit when no active snapshot", async () => {
    const { result } = renderHook(() =>
      useAutoSnapshot({
        activeSnapshot: null,
        create: createMock,
        activate: activateMock,
      }),
    );

    let snapshotReady: boolean | undefined;
    await act(async () => {
      snapshotReady = await result.current.ensureSnapshot();
    });

    expect(createMock).toHaveBeenCalledWith("Bearbeitet");
    expect(activateMock).toHaveBeenCalledWith("snap-new");
    expect(snapshotReady).toBe(true);
  });

  test("does not create snapshot when one is already active", async () => {
    const { result } = renderHook(() =>
      useAutoSnapshot({
        activeSnapshot: {
          id: "snap-existing",
          label: "Existing",
          isActive: true,
          importId: "job-1",
          createdAt: "",
          updatedAt: "",
        },
        create: createMock,
        activate: activateMock,
      }),
    );

    let snapshotReady: boolean | undefined;
    await act(async () => {
      snapshotReady = await result.current.ensureSnapshot();
    });

    expect(createMock).not.toHaveBeenCalled();
    expect(activateMock).not.toHaveBeenCalled();
    expect(snapshotReady).toBe(true);
  });

  test("does not create duplicate snapshots on concurrent calls", async () => {
    createMock.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({ id: "snap-new", label: "Bearbeitet", isActive: false }),
            50,
          ),
        ),
    );

    const { result } = renderHook(() =>
      useAutoSnapshot({
        activeSnapshot: null,
        create: createMock,
        activate: activateMock,
      }),
    );

    await act(async () => {
      const p1 = result.current.ensureSnapshot();
      const p2 = result.current.ensureSnapshot();
      await Promise.all([p1, p2]);
    });

    expect(createMock).toHaveBeenCalledTimes(1);
  });

  test("returns false when snapshot creation fails", async () => {
    createMock.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useAutoSnapshot({
        activeSnapshot: null,
        create: createMock,
        activate: activateMock,
      }),
    );

    let snapshotReady: boolean | undefined;
    await act(async () => {
      snapshotReady = await result.current.ensureSnapshot();
    });

    expect(snapshotReady).toBe(false);
  });
});
