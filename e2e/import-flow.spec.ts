import { expect, FIXTURE_IMPORT_ID, test } from "./fixtures/test-fixtures";

test.describe("Import Flow", () => {
  test("should load a seeded import and display the format workspace", async ({
    homePage,
    workspace,
  }) => {
    await homePage.gotoImport(FIXTURE_IMPORT_ID);

    // The format workspace should be visible with reader tab active
    await expect(workspace.readerTab).toBeVisible();
    await expect(workspace.markdownTab).toBeVisible();
  });

  test("should display reader blocks for the conversation", async ({
    homePage,
    workspace,
  }) => {
    await homePage.gotoImport(FIXTURE_IMPORT_ID);

    // The seeded conversation has assistant-1 with multiple blocks
    const headingBlock = workspace.readerBlock("assistant-1", 0);
    await expect(headingBlock).toBeVisible();
    await expect(headingBlock).toContainText("Project plan");
  });

  test("should switch between reader and markdown views", async ({
    homePage,
    workspace,
  }) => {
    await homePage.gotoImport(FIXTURE_IMPORT_ID);

    // Switch to markdown
    await workspace.switchToMarkdown();
    const markdownLine = workspace.markdownLine(0);
    await expect(markdownLine).toBeVisible();

    // Switch back to reader
    await workspace.switchToReader();
    await expect(workspace.readerBlock("assistant-1", 0)).toBeVisible();
  });

  test("should show the home page with import form", async ({ homePage }) => {
    await homePage.goto();
    await expect(homePage.urlInput).toBeVisible();
    await expect(homePage.importButton).toBeVisible();
  });
});
