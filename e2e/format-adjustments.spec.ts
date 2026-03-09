import { expect, FIXTURE_IMPORT_ID, test } from "./fixtures/test-fixtures";

test.describe("Format Adjustments", () => {
  test.beforeEach(async ({ homePage }) => {
    await homePage.gotoImport(FIXTURE_IMPORT_ID);
  });

  test("should enable reader adjustment mode and show guide", async ({
    workspace,
  }) => {
    await workspace.enableAdjustMode("reader");
    await expect(workspace.adjustGuideReader).toBeVisible();
  });

  test("should open adjustment popover on block click", async ({
    workspace,
  }) => {
    await workspace.enableAdjustMode("reader");
    await workspace.readerBlock("assistant-1", 0).click();
    await expect(workspace.adjustPopoverReader).toBeVisible();
  });

  test("should send adjustment and receive AI reply", async ({ workspace }) => {
    await workspace.enableAdjustMode("reader");
    await workspace.readerBlock("assistant-1", 0).click();
    await workspace.sendAdjustment("Mach das luftiger.");
    await workspace.waitForReply();
    await expect(workspace.adjustLastReply).toBeVisible();
  });

  test("should apply heading spacing rule via follow-up instruction", async ({
    workspace,
  }) => {
    await workspace.enableAdjustMode("reader");
    await workspace.readerBlock("assistant-1", 0).click();
    await workspace.sendAdjustment(
      "Ja, bitte mehr Abstand unter ähnlichen Überschriften.",
    );
    await workspace.waitForReply();

    // Verify the heading block got the spacing class applied
    const headingBlock = workspace.readerBlock("assistant-1", 0);
    await expect(headingBlock).toHaveClass(/mb-4/);
  });

  test("should render markdown bold in reader view", async ({ workspace }) => {
    await workspace.enableAdjustMode("reader");
    await workspace.readerBlock("assistant-1", 4).click();
    await workspace.sendAdjustment(
      "Fettdruck wird im Reader nicht korrekt gerendert.",
    );

    // Wait for bold rendering
    await workspace.page.waitForFunction(() => {
      const block = document.querySelector(
        '[data-testid="reader-block-assistant-1-4"]',
      );
      if (!(block instanceof HTMLElement)) return false;
      return (
        block.querySelector("strong") !== null &&
        !block.textContent?.includes("**")
      );
    });

    const blockText = await workspace.readerBlock("assistant-1", 4).innerText();
    expect(blockText).not.toContain("**");
    expect(blockText).toContain("Wichtig für den Launch:");
  });

  test("should apply markdown adjustment in markdown view", async ({
    workspace,
  }) => {
    await workspace.switchToMarkdown();
    await workspace.enableAdjustMode("markdown");
    await workspace.markdownLine(9).click();
    await workspace.sendAdjustment(
      "Labels with a colon should always be bold in Markdown.",
    );

    // Wait for bold prefix to appear
    await workspace.page.waitForFunction(() => {
      const line = document.querySelector('[data-testid="markdown-line-9"]');
      return line?.textContent?.includes("**Important") ?? false;
    });

    const lineText = await workspace.markdownLine(9).innerText();
    expect(lineText).toContain("**Important");
    expect(lineText).toContain("check the logs before deploying.");
  });
});
