import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

describe("UI bundle", () => {
  it("builds dist/ui/index.js and exports both Paperclip slots", async () => {
    execFileSync(process.execPath, ["scripts/build-ui.mjs"], {
      cwd: root,
      stdio: "pipe",
    });

    const output = path.join(root, "dist/ui/index.js");
    expect(existsSync(output)).toBe(true);

    const module = await import(`${pathToFileURL(output).href}?t=${Date.now()}`);
    expect(module.VkDashboardWidget).toBeTypeOf("function");
    expect(module.VkCompanySettingsPage).toBeTypeOf("function");
  });
});
