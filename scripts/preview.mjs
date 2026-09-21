import { spawnSync } from "node:child_process";
const result = spawnSync(
  process.execPath,
  ["node_modules/astro/bin/astro.mjs", "dev", "--host", "127.0.0.1"],
  {
    env: { ...process.env, PUBLIC_ONBOARDING_PREVIEW: "true" },
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
