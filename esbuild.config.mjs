import { existsSync } from "node:fs";
import { build } from "esbuild";

const entries = ["worker", "manifest"];

for (const entry of entries) {
  const entryPoint = `src/${entry}.ts`;
  if (!existsSync(entryPoint)) {
    console.log(`Skipping ${entryPoint}: not created yet`);
    continue;
  }

  await build({
    entryPoints: [entryPoint],
    outfile: `dist/${entry}.js`,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    sourcemap: true,
    external: ["@paperclipai/plugin-sdk"],
    logLevel: "info",
  });
}
