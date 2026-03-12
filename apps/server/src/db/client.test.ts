import { describe, expect, test } from "vitest";

import { rawDb, withTransaction } from "./client.js";

describe("withTransaction", () => {
  test("returns the value produced by the callback", () => {
    const result = withTransaction(() => 42);

    expect(result).toBe(42);
  });

  test("commits all statements when callback succeeds", () => {
    const table = `_test_tx_commit_${Date.now()}`;
    rawDb.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`);

    try {
      withTransaction(() => {
        rawDb.prepare(`INSERT INTO ${table} (id) VALUES (?)`).run(1);
        rawDb.prepare(`INSERT INTO ${table} (id) VALUES (?)`).run(2);
      });

      const rows = rawDb.prepare(`SELECT id FROM ${table} ORDER BY id`).all();
      expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
    } finally {
      rawDb.exec(`DROP TABLE IF EXISTS ${table}`);
    }
  });

  test("rolls back all statements when callback throws", () => {
    const table = `_test_tx_rollback_${Date.now()}`;
    rawDb.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`);

    try {
      expect(() =>
        withTransaction(() => {
          rawDb.prepare(`INSERT INTO ${table} (id) VALUES (?)`).run(1);
          throw new Error("deliberate failure");
        }),
      ).toThrow("deliberate failure");

      const rows = rawDb.prepare(`SELECT id FROM ${table}`).all();
      expect(rows).toEqual([]);
    } finally {
      rawDb.exec(`DROP TABLE IF EXISTS ${table}`);
    }
  });
});
