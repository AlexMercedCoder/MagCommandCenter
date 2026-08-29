import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2020",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: [
      "tests/e2e/**",
      "node_modules/**",
      "dist/**",
      "src-tauri/target/**",
    ],
    coverage: {
      reporter: ["text", "html"],
      thresholds: { statements: 50, branches: 50, functions: 55, lines: 50 },
      include: ["src/lib/**/*.ts", "src/features/**/*.ts", "src/magent.ts"],
      exclude: ["**/*.test.ts", "src/lib/types.ts", "src/lib/constants.ts"],
    },
  },
});
