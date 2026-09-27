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
      "tests/visual/**",
      "node_modules/**",
      "dist/**",
      "src-tauri/target/**",
    ],
    coverage: {
      reporter: ["text", "html"],
      thresholds: { statements: 60, branches: 55, functions: 65, lines: 65 },
      // Logic modules only; components are covered by component tests and the
      // browser suites rather than this line-coverage floor.
      include: [
        "src/lib/**/*.ts",
        "src/features/**/*.ts",
        "src/stores/**/*.ts",
        "src/magent.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.tsx",
        "src/lib/types.ts",
        "src/lib/constants.ts",
      ],
    },
  },
});
