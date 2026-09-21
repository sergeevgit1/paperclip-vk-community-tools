import esbuild from "esbuild";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

const presets = createPluginBundlerPresets();
const workerCtx = await esbuild.context(presets.esbuild.worker);
const manifestCtx = await esbuild.context(presets.esbuild.manifest);

await Promise.all([workerCtx.rebuild(), manifestCtx.rebuild()]);
await Promise.all([workerCtx.dispose(), manifestCtx.dispose()]);
