import type { Locator, Page } from "@playwright/test";

export class FormatWorkspacePage {
  readonly page: Page;

  // View tabs
  readonly readerTab: Locator;
  readonly markdownTab: Locator;

  // Adjustment mode
  readonly toggleAdjustReader: Locator;
  readonly toggleAdjustMarkdown: Locator;
  readonly adjustGuideReader: Locator;
  readonly adjustGuideMarkdown: Locator;

  // Adjustment popover
  readonly adjustPopoverReader: Locator;
  readonly adjustPopoverMarkdown: Locator;
  readonly adjustDraftMessage: Locator;
  readonly adjustSend: Locator;
  readonly adjustLastReply: Locator;

  // Rules list
  readonly rulesListTrigger: Locator;
  readonly rulesListExpandToggle: Locator;
  readonly rulesListExplanation: Locator;
  readonly rulesListUndo: Locator;

  constructor(page: Page) {
    this.page = page;
    this.readerTab = page.getByTestId("format-view-reader");
    this.markdownTab = page.getByTestId("format-view-markdown");
    this.toggleAdjustReader = page.getByTestId("toggle-adjust-mode-reader");
    this.toggleAdjustMarkdown = page.getByTestId("toggle-adjust-mode-markdown");
    this.adjustGuideReader = page.getByTestId("adjustment-mode-guide-reader");
    this.adjustGuideMarkdown = page.getByTestId(
      "adjustment-mode-guide-markdown",
    );
    this.adjustPopoverReader = page.getByTestId("adjustment-popover-reader");
    this.adjustPopoverMarkdown = page.getByTestId(
      "adjustment-popover-markdown",
    );
    this.adjustDraftMessage = page.getByTestId("adjustment-draft-message");
    this.adjustSend = page.getByTestId("adjustment-send");
    this.adjustLastReply = page.getByTestId("adjustment-last-reply");
    this.rulesListTrigger = page.getByTestId("rules-list-trigger");
    this.rulesListExpandToggle = page.getByTestId("rules-list-expand-toggle");
    this.rulesListExplanation = page.getByTestId("rules-list-explanation");
    this.rulesListUndo = page.getByTestId("rules-list-undo");
  }

  readerBlock(messageId: string, blockIndex: number) {
    return this.page.getByTestId(`reader-block-${messageId}-${blockIndex}`);
  }

  markdownLine(lineNumber: number) {
    return this.page.getByTestId(`markdown-line-${lineNumber}`);
  }

  async switchToReader() {
    await this.readerTab.click();
  }

  async switchToMarkdown() {
    await this.markdownTab.click();
  }

  async enableAdjustMode(view: "reader" | "markdown") {
    if (view === "reader") {
      await this.toggleAdjustReader.click();
      await this.adjustGuideReader.waitFor();
    } else {
      await this.toggleAdjustMarkdown.click();
      await this.adjustGuideMarkdown.waitFor();
    }
  }

  async sendAdjustment(message: string) {
    await this.adjustDraftMessage.fill(message);
    await this.adjustSend.click();
  }

  async waitForReply() {
    await this.adjustLastReply.waitFor();
  }

  async cancelAdjustment(view: "reader" | "markdown") {
    const popover =
      view === "reader" ? this.adjustPopoverReader : this.adjustPopoverMarkdown;
    await popover.getByRole("button", { name: "Abbrechen" }).click();
  }

  async openRulesList() {
    await this.rulesListTrigger.click();
  }

  async expandFirstRule() {
    await this.rulesListExpandToggle.first().click();
  }

  async undoFirstRule() {
    await this.rulesListUndo.first().click();
  }
}
