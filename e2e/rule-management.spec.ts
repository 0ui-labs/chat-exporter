import { expect, FIXTURE_IMPORT_ID, test } from "./fixtures/test-fixtures";

test.describe("Rule Management", () => {
  test("should show rule in rules list after applying adjustment", async ({
    homePage,
    workspace,
  }) => {
    await homePage.gotoImport(FIXTURE_IMPORT_ID);

    // Apply a heading spacing rule
    await workspace.enableAdjustMode("reader");
    await workspace.readerBlock("assistant-1", 0).click();
    await workspace.sendAdjustment(
      "Ja, bitte mehr Abstand unter ähnlichen Überschriften.",
    );
    await workspace.waitForReply();

    // Open rules list and verify rule appears
    await workspace.openRulesList();
    await expect(workspace.rulesListExpandToggle.first()).toBeVisible();
  });

  test("should expand rule to show explanation", async ({
    homePage,
    workspace,
  }) => {
    await homePage.gotoImport(FIXTURE_IMPORT_ID);

    // Apply adjustment
    await workspace.enableAdjustMode("reader");
    await workspace.readerBlock("assistant-1", 0).click();
    await workspace.sendAdjustment(
      "Ja, bitte mehr Abstand unter ähnlichen Überschriften.",
    );
    await workspace.waitForReply();

    // Open rules list and expand
    await workspace.openRulesList();
    await workspace.expandFirstRule();
    await expect(workspace.rulesListExplanation).toBeVisible();
    await expect(workspace.rulesListExplanation).toContainText("Project plan");
  });

  test("should undo a rule and revert the change", async ({
    homePage,
    workspace,
  }) => {
    await homePage.gotoImport(FIXTURE_IMPORT_ID);

    // Apply heading spacing rule
    await workspace.enableAdjustMode("reader");
    await workspace.readerBlock("assistant-1", 0).click();
    await workspace.sendAdjustment(
      "Ja, bitte mehr Abstand unter ähnlichen Überschriften.",
    );
    await workspace.waitForReply();

    // Verify rule is applied
    const headingBlock = workspace.readerBlock("assistant-1", 0);
    await expect(headingBlock).toHaveClass(/mb-4/);

    // Undo the rule
    await workspace.openRulesList();
    await workspace.undoFirstRule();

    // Verify the expand toggle is gone (rule removed)
    await workspace.rulesListExpandToggle.waitFor({ state: "detached" });

    // Verify the class is reverted
    await expect(headingBlock).not.toHaveClass(/mb-4/);
  });
});
