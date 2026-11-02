import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../..", import.meta.url));

/** Run with: npx vitest run --config lib/ai/vitest.config.ts */
export default defineConfig({
  root,
  resolve: {
    alias: {
      // `server-only` throws outside React Server Components; it's a no-op in tests.
      "server-only": fileURLToPath(new URL("./__tests__/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["lib/ai/__tests__/**/*.test.ts", "components/**/__tests__/**/*.test.ts"],
    environment: "node",
    testTimeout: 90_000,
  },
});
