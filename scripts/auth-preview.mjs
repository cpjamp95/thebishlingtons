import { spawnSync } from "node:child_process";
const result = spawnSync(
  process.execPath,
  ["node_modules/astro/bin/astro.mjs", "dev", "--host", "127.0.0.1"],
  {
    env: {
      ...process.env,
      PUBLIC_ONBOARDING_PREVIEW: "false",
      PUBLIC_SUPABASE_URL: "https://wedding-test.supabase.co",
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    },
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
