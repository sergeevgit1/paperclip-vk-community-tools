import { describe, expect, it } from "vitest";
import manifest from "../src/manifest.js";

const RUSSIAN_CHAR_REGEX = /[а-яА-ЯёЁ]/;

describe("манифест инструментов VK на русском языке", () => {
  it("содержит 23 инструмента с техническими именами vk_*", () => {
    const tools = manifest.tools ?? [];
    expect(tools.length).toBe(23);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^vk_[a-z0-9_]+$/);
    }
  });

  it("все отображаемые имена displayName содержат русский текст", () => {
    const tools = manifest.tools ?? [];
    for (const tool of tools) {
      expect(
        RUSSIAN_CHAR_REGEX.test(tool.displayName),
        `Инструмент ${tool.name} должен иметь русский displayName, получено: "${tool.displayName}"`,
      ).toBe(true);
    }
  });

  it("все описания инструментов description содержат русский текст", () => {
    const tools = manifest.tools ?? [];
    for (const tool of tools) {
      expect(
        RUSSIAN_CHAR_REGEX.test(tool.description),
        `Инструмент ${tool.name} должен иметь русский description, получено: "${tool.description}"`,
      ).toBe(true);
    }
  });

  it("манифест плагина имеет русское название и описание", () => {
    expect(RUSSIAN_CHAR_REGEX.test(manifest.displayName)).toBe(true);
    expect(RUSSIAN_CHAR_REGEX.test(manifest.description)).toBe(true);
  });
});
