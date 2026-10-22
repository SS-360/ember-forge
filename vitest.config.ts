import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/**/*.test.ts",
      "apps/**/*.test.ts",
      "vendor/meterless/hmem/reference/test/**/*.test.ts"
    ],
    environment: "node",
    restoreMocks: true
  }
});

