import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "chat-preview.spec.ts",
  timeout: 15_000,
  use: {
    baseURL: "http://127.0.0.1:4181",
    browserName: "chromium",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4181",
    url: "http://127.0.0.1:4181/tests/visual/chat-preview.html",
    reuseExistingServer: true,
  },
});
