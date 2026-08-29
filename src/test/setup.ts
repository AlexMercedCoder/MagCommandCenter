import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

Object.defineProperty(window, "__TAURI_INTERNALS__", {
  value: {},
  configurable: true,
});

afterEach(cleanup);
