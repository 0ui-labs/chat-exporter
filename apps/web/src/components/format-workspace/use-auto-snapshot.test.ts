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

  test("concurrent second call waits for activation before resolving true", async () => {
    // Arrange: track activation order vs concurrent call resolution
    let resolveCreate!: (value: {
      id: string;
      label: string;
      isActive: boolean;
    }) => void;
    let resolveActivate!: () => void;
    let activateStarted = false;
    let activateFinished = false;

    createMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    activateMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          activateStarted = true;
          resolveActivate = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useAutoSnapshot({
        activeSnapshot: null,
        create: createMock,
        activate: activateMock,
      }),
    );

    // Both calls fired concurrently — p2 hits the in-progress guard
    const p1 = result.current.ensureSnapshot();
    const p2 = result.current.ensureSnapshot();

    // Resolve creation — activate begins
    resolveCreate({ id: "snap-new", label: "Bearbeitet", isActive: false });

    // Flush microtasks so activate is called
    await Promise.resolve();
    await Promise.resolve();

    expect(activateStarted).toBe(true);

    // p2 must NOT have resolved yet — activation is still pending.
    // We test this by checking whether p2 has settled before we resolve activate.
    let p2Resolved = false;
    void p2.then(() => {
      p2Resolved = true;
    });

    // Flush microtasks — p2 should still be pending
    await Promise.resolve();
    await Promise.resolve();

    // With the buggy implementation p2 already resolved true (before activate
    // finished), so p2Resolved would be true here.
    expect(p2Resolved).toBe(false);

    // Now finish activation
    activateFinished = false;
    resolveActivate();
    activateFinished = true;

    const [r1, r2] = await Promise.all([p1, p2]);

    // Both callers receive true only after activation is complete
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(activateFinished).toBe(true);
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
