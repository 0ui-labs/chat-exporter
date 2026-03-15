import { describe, expect, test } from "vitest";
import {
  addColumn,
  addRow,
  canAddColumn,
  canAddRow,
  canRemoveColumn,
  canRemoveRow,
  createEmptyTable,
  removeColumn,
  removeRow,
} from "./table-utils";

describe("createEmptyTable", () => {
  test("creates table with correct headers and empty rows", () => {
    const table = createEmptyTable(3, 2);

    expect(table.type).toBe("table");
    expect(table.headers).toEqual(["Spalte 1", "Spalte 2", "Spalte 3"]);
    expect(table.rows).toEqual([
      ["", "", ""],
      ["", "", ""],
    ]);
  });

  test("generates a block id with length 8", () => {
    const table = createEmptyTable(2, 1);

    expect(table.id).toHaveLength(8);
  });

  test("creates 1x1 table", () => {
    const table = createEmptyTable(1, 1);

    expect(table.headers).toEqual(["Spalte 1"]);
    expect(table.rows).toEqual([[""]]);
  });
});

describe("addRow", () => {
  test("appends a row of empty strings", () => {
    const table = createEmptyTable(2, 1);

    const result = addRow(table);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]).toEqual(["", ""]);
  });

  test("does not mutate the original table", () => {
    const table = createEmptyTable(2, 1);

    const result = addRow(table);

    expect(result).not.toBe(table);
    expect(table.rows).toHaveLength(1);
  });
});

describe("addColumn", () => {
  test("adds a header and extends each row", () => {
    const table = createEmptyTable(2, 2);

    const result = addColumn(table);

    expect(result.headers).toEqual(["Spalte 1", "Spalte 2", "Spalte 3"]);
    expect(result.rows[0]).toEqual(["", "", ""]);
    expect(result.rows[1]).toEqual(["", "", ""]);
  });

  test("does not mutate the original table", () => {
    const table = createEmptyTable(2, 1);

    const result = addColumn(table);

    expect(result).not.toBe(table);
    expect(table.headers).toHaveLength(2);
  });
});

describe("removeRow", () => {
  test("removes row at given index", () => {
    const table = createEmptyTable(2, 3);

    const result = removeRow(table, 1);

    expect(result.rows).toHaveLength(2);
  });

  test("noop when only one row remains", () => {
    const table = createEmptyTable(2, 1);

    const result = removeRow(table, 0);

    expect(result).toBe(table);
    expect(result.rows).toHaveLength(1);
  });
});

describe("removeColumn", () => {
  test("removes column at given index from headers and rows", () => {
    const table = createEmptyTable(3, 2);

    const result = removeColumn(table, 1);

    expect(result.headers).toEqual(["Spalte 1", "Spalte 3"]);
    expect(result.rows[0]).toHaveLength(2);
  });

  test("noop when only one column remains", () => {
    const table = createEmptyTable(1, 2);

    const result = removeColumn(table, 0);

    expect(result).toBe(table);
    expect(result.headers).toHaveLength(1);
  });
});

describe("canAddRow", () => {
  test("returns true when rows < 10", () => {
    const table = createEmptyTable(2, 9);

    expect(canAddRow(table)).toBe(true);
  });

  test("returns false when rows = 10", () => {
    const table = createEmptyTable(2, 10);

    expect(canAddRow(table)).toBe(false);
  });
});

describe("canAddColumn", () => {
  test("returns true when columns < 10", () => {
    const table = createEmptyTable(9, 1);

    expect(canAddColumn(table)).toBe(true);
  });

  test("returns false when columns = 10", () => {
    const table = createEmptyTable(10, 1);

    expect(canAddColumn(table)).toBe(false);
  });
});

describe("canRemoveRow", () => {
  test("returns true when more than 1 row", () => {
    const table = createEmptyTable(2, 2);

    expect(canRemoveRow(table)).toBe(true);
  });

  test("returns false when only 1 row", () => {
    const table = createEmptyTable(2, 1);

    expect(canRemoveRow(table)).toBe(false);
  });
});

describe("canRemoveColumn", () => {
  test("returns true when more than 1 column", () => {
    const table = createEmptyTable(2, 1);

    expect(canRemoveColumn(table)).toBe(true);
  });

  test("returns false when only 1 column", () => {
    const table = createEmptyTable(1, 1);

    expect(canRemoveColumn(table)).toBe(false);
  });
});

describe("edge cases", () => {
  test("10x10 table respects all limits", () => {
    const table = createEmptyTable(10, 10);

    expect(canAddRow(table)).toBe(false);
    expect(canAddColumn(table)).toBe(false);
    expect(canRemoveRow(table)).toBe(true);
    expect(canRemoveColumn(table)).toBe(true);
  });

  test("1x1 table respects all limits", () => {
    const table = createEmptyTable(1, 1);

    expect(canAddRow(table)).toBe(true);
    expect(canAddColumn(table)).toBe(true);
    expect(canRemoveRow(table)).toBe(false);
    expect(canRemoveColumn(table)).toBe(false);
  });

  test("removeRow on last row of 1x1 table is noop", () => {
    const table = createEmptyTable(1, 1);

    const result = removeRow(table, 0);

    expect(result).toBe(table);
  });

  test("removeColumn on last column of 1x1 table is noop", () => {
    const table = createEmptyTable(1, 1);

    const result = removeColumn(table, 0);

    expect(result).toBe(table);
  });
});
