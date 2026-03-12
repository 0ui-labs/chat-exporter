import type { Locator, Page } from "@playwright/test";

export class HomePage {
  readonly page: Page;
  readonly urlInput: Locator;
  readonly importButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.urlInput = page.getByLabel("Freigabelink");
    this.importButton = page.getByRole("button", { name: "Importieren" });
  }

  async goto() {
    await this.page.goto("/");
  }

  async gotoImport(importId: string) {
    await this.page.goto(`/?import=${importId}`);
  }

  async submitUrl(url: string) {
    await this.urlInput.fill(url);
    await this.importButton.click();
  }
}
