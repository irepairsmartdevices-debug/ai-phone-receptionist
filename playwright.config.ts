import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch:
    process.env.TEST_MODE === "adaptive"
      ? "adaptive-flow.spec.ts"
      : process.env.TEST_MODE === "knowledge"
        ? "knowledge.spec.ts"
        : process.env.TEST_MODE === "demo"
          ? "demo.spec.ts"
          : process.env.TEST_MODE === "connected"
            ? "connected.spec.ts"
            : "dashboard.spec.ts",
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  workers: 1,
  reporter: "list",
});
