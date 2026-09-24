import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryPoint = path.join(packageRoot, "src/ui/index.tsx");

if (!existsSync(entryPoint)) {
  console.log("Skipping src/ui/index.tsx: not created yet");
} else {
  await esbuild.build({
    entryPoints: [entryPoint],
    outfile: path.join(packageRoot, "dist/ui/index.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    sourcemap: true,
    external: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@paperclipai/plugin-sdk/ui",
    ],
    charset: "utf8",
    logLevel: "info",
  });
}
