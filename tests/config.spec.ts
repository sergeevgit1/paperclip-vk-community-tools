import { describe, expect, it } from "vitest";
import { manifest, validateVkPluginConfig } from "../src/manifest.js";
import { PLUGIN_ID, PLUGIN_VERSION } from "../src/constants.js";

describe("manifest & configuration validator", () => {
  it("conforms to Paperclip V1 manifest structure", () => {
    expect(manifest.id).toBe(PLUGIN_ID);
    expect(manifest.version).toBe(PLUGIN_VERSION);
    expect(manifest.apiVersion).toBe(1);
    expect(manifest.categories).toContain("connector");
    expect(manifest.capabilities).toEqual(
      expect.arrayContaining([
        "agent.tools.register",
        "http.outbound",
        "secrets.read-ref",
        "instance.settings.register",
        "ui.dashboardWidget.register",
      ]),
    );
    expect(manifest.entrypoints.worker).toBe("./dist/worker.js");
    expect(manifest.entrypoints.ui).toBe("./dist/ui");
  });

  it("declares exactly 23 tools", () => {
    expect(manifest.tools).toBeDefined();
    expect(manifest.tools?.length).toBe(23);

    const toolNames = manifest.tools?.map((t) => t.name) ?? [];
    const expected = [
      "vk_group_get_details",
      "vk_group_is_member",
      "vk_wall_post",
      "vk_wall_edit",
      "vk_wall_delete",
      "vk_wall_get",
      "vk_wall_pin",
      "vk_wall_unpin",
      "vk_media_upload_photo",
      "vk_media_upload_document",
      "vk_media_upload_video",
      "vk_media_create_poll",
      "vk_comments_get",
      "vk_comments_create",
      "vk_comments_delete",
      "vk_members_ban",
      "vk_members_unban",
      "vk_messages_get_conversations",
      "vk_messages_get_history",
      "vk_messages_send",
      "vk_messages_mark_as_read",
      "vk_stats_get_summary",
      "vk_stats_get_post_reach",
    ];
    for (const name of expected) {
      expect(toolNames).toContain(name);
    }
  });

  it("declares both UI slots: companySettingsPage and dashboardWidget", () => {
    expect(manifest.ui?.slots).toBeDefined();
    const slotTypes = manifest.ui?.slots?.map((s) => s.type) ?? [];
    expect(slotTypes).toContain("companySettingsPage");
    expect(slotTypes).toContain("dashboardWidget");

    const settingsSlot = manifest.ui?.slots?.find(
      (s) => s.type === "companySettingsPage",
    );
    expect(settingsSlot?.exportName).toBe("VkCompanySettingsPage");

    const widgetSlot = manifest.ui?.slots?.find(
      (s) => s.type === "dashboardWidget",
    );
    expect(widgetSlot?.exportName).toBe("VkDashboardWidget");
  });

  describe("validateVkPluginConfig", () => {
    it("accepts valid config with string or secret_ref objects", () => {
      const valid1 = validateVkPluginConfig({
        groupId: 123456,
        userTokenRef: "sec-user-token",
        groupTokenRef: "sec-group-token",
      });
      expect(valid1.valid).toBe(true);
      expect(valid1.config?.groupId).toBe(123456);

      const valid2 = validateVkPluginConfig({
        groupId: 9999,
        userTokenRef: {
          type: "secret_ref",
          secretId: "sec-u1",
          version: "latest",
        },
        groupTokenRef: {
          type: "secret_ref",
          secretId: "sec-g1",
          version: 1,
        },
        apiVersion: "5.199",
        rateLimitRps: 5,
      });
      expect(valid2.valid).toBe(true);
    });

    it("rejects missing or invalid groupId", () => {
      expect(
        validateVkPluginConfig({
          userTokenRef: "sec-u",
          groupTokenRef: "sec-g",
        }).valid,
      ).toBe(false);

      expect(
        validateVkPluginConfig({
          groupId: 0,
          userTokenRef: "sec-u",
          groupTokenRef: "sec-g",
        }).valid,
      ).toBe(false);

      expect(
        validateVkPluginConfig({
          groupId: -10,
          userTokenRef: "sec-u",
          groupTokenRef: "sec-g",
        }).valid,
      ).toBe(false);
    });

    it("rejects missing userTokenRef or groupTokenRef", () => {
      expect(
        validateVkPluginConfig({
          groupId: 100,
          groupTokenRef: "sec-g",
        }).valid,
      ).toBe(false);

      expect(
        validateVkPluginConfig({
          groupId: 100,
          userTokenRef: "sec-u",
        }).valid,
      ).toBe(false);
    });

    it("rejects plaintext access tokens passed as token refs", () => {
      expect(
        validateVkPluginConfig({
          groupId: 100,
          userTokenRef: ["vk1", "a", "plaintexttokenthatshouldneverbeallowedhere1234567890"].join("."),
          groupTokenRef: "sec-g",
        }).valid,
      ).toBe(false);
    });
  });
});
