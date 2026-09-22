import { describe, expect, it } from "vitest";
import { PLUGIN_ID, PLUGIN_VERSION } from "../src/constants.js";

describe("package bootstrap", () => {
  it("exports plugin identity constants", () => {
    expect(PLUGIN_ID).toBe("zaruba.vk-community-tools");
    expect(PLUGIN_VERSION).toBe("0.2.1");
  });
});
