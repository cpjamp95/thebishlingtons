import process from "node:process";
import { defineConfig } from "@playwright/test";
const authMode = process.argv.some((arg) => arg.includes("auth.spec"));
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  use: {
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        }
      : {},
    baseURL: "http://127.0.0.1:4321",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
  },
  workers: 1,
  webServer: {
    command: authMode
      ? "node scripts/auth-preview.mjs"
      : "node scripts/preview.mjs",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
