import { describe, expect, it } from "vitest";
import {
  buildVkCallbackUrl,
  describeCallbackStatus,
  type CallbackGatewayStatus,
} from "../src/ui/callback.js";

describe("генератор ссылки и статус Callback API", () => {
  it("формирует полный URL для ВКонтакте с confirmation и secret", () => {
    const url = buildVkCallbackUrl({
      baseUrl: "https://vk.openser.ru",
      groupId: 123456,
      confirmationCode: "abcd1234",
      secret: "my-secret-key",
    });

    expect(url).toBe(
      "https://vk.openser.ru/callback/123456?confirmation=abcd1234&secret=my-secret-key",
    );
  });

  it("экранирует специальные символы в параметрах", () => {
    const url = buildVkCallbackUrl({
      baseUrl: "https://vk.openser.ru",
      groupId: 789,
      confirmationCode: "code+1&2",
      secret: "pass phrase?",
    });

    expect(url).toBe(
      "https://vk.openser.ru/callback/789?confirmation=code%2B1%262&secret=pass+phrase%3F",
    );
  });

  it("возвращает пустую строку, если groupId не задан", () => {
    const url = buildVkCallbackUrl({
      baseUrl: "https://vk.openser.ru",
      groupId: 0,
      confirmationCode: "code",
    });

    expect(url).toBe("");
  });

  it("корректно формирует русский статус для разных состояний", () => {
    expect(describeCallbackStatus(null)).toMatchObject({
      tone: "neutral",
      title: "Ожидание тестового запроса от ВКонтакте",
    });

    const confirmed: CallbackGatewayStatus = {
      groupId: 123,
      eventType: "confirmation",
      confirmed: true,
      forwarded: false,
      timestamp: "2026-09-21T10:00:00.000Z",
      status: "success",
    };
    expect(describeCallbackStatus(confirmed)).toMatchObject({
      tone: "success",
      title: "Тестовый запрос успешно получен",
    });

    const forwarded: CallbackGatewayStatus = {
      groupId: 123,
      eventType: "message_new",
      confirmed: false,
      forwarded: true,
      timestamp: "2026-09-21T10:05:00.000Z",
      status: "success",
    };
    expect(describeCallbackStatus(forwarded)).toMatchObject({
      tone: "success",
      title: "События успешно принимаются",
    });

    const errorState: CallbackGatewayStatus = {
      groupId: 123,
      eventType: "message_new",
      confirmed: false,
      forwarded: false,
      timestamp: "2026-09-21T10:06:00.000Z",
      status: "forward_error",
      error: "Paperclip недоступен",
    };
    expect(describeCallbackStatus(errorState)).toMatchObject({
      tone: "error",
      title: "Ошибка доставки события",
    });
  });
});
