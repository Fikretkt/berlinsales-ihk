import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: false,
    include: ["lib/**/*.test.ts", "test/**/*.test.ts"],
    exclude: ["node_modules", ".next", "test/integration/**"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.test.ts", "lib/db/migrations/**"],
    },
  },
});
