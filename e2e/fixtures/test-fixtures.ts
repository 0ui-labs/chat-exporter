import { test as base } from "@playwright/test";
import { FormatWorkspacePage } from "../pages/format-workspace.page";
import { HomePage } from "../pages/home.page";

/**
 * Import ID used by the smoke test database seeder.
 * Must match the value in apps/server/src/scripts/format-adjustments-smoke.ts.
 */
export const FIXTURE_IMPORT_ID = "smoke-format-adjustments-v1";

type TestFixtures = {
  homePage: HomePage;
  workspace: FormatWorkspacePage;
};

export const test = base.extend<TestFixtures>({
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  workspace: async ({ page }, use) => {
    await use(new FormatWorkspacePage(page));
  },
});

export { expect } from "@playwright/test";
