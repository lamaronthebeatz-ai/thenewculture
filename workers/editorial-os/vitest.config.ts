import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    coverage: {
      provider: "istanbul", // workerd has no node:inspector, so the v8 provider can't run here
      reporter: ["text", "text-summary"],
      include: ["src/**/*.ts"],
    },
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          kvNamespaces: ["EDITORIAL_KV"],
          r2Buckets: ["EDITORIAL_R2"],
        },
      },
    },
  },
});
