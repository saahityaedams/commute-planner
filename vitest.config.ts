import { defineConfig } from "vitest/config";

// Core logic is runtime-agnostic: test it in plain Node without the Cloudflare/React Router plugins.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { include: ["app/**/*.test.ts"], environment: "node" },
});
