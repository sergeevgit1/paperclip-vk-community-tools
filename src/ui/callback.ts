export interface BuildCallbackUrlOptions {
  baseUrl?: string;
  groupId?: number;
  confirmationCode?: string;
  secret?: string;
}

export interface CallbackGatewayStatus {
  groupId: number;
  eventType: string;
  timestamp: string;
  confirmed: boolean;
  forwarded: boolean;
  status: "success" | "forward_error" | string;
  error?: string | null;
}

export interface CallbackStatusDescription {
  tone: "neutral" | "success" | "warn" | "error";
  title: string;
  details?: string;
}

export function buildVkCallbackUrl(options: BuildCallbackUrlOptions): string {
  const { baseUrl = "https://vk.openser.ru", groupId, confirmationCode, secret } = options;

  if (!groupId || typeof groupId !== "number" || groupId <= 0) {
    return "";
  }

  const cleanBase = baseUrl.replace(/\/+$/, "");
  const url = new URL(`${cleanBase}/callback/${groupId}`);

  if (confirmationCode && confirmationCode.trim().length > 0) {
    url.searchParams.set("confirmation", confirmationCode.trim());
  }

  if (secret && secret.trim().length > 0) {
    url.searchParams.set("secret", secret.trim());
  }

  return url.toString();
}

export function describeCallbackStatus(
  status: CallbackGatewayStatus | null | undefined,
): CallbackStatusDescription {
  if (!status || !status.eventType) {
    return {
      tone: "neutral",
      title: "Ожидание тестового запроса от ВКонтакте",
      details: "После сохранения адреса в настройках группы ВК отправит тестовый запрос подтверждения.",
    };
  }

  const timeStr = status.timestamp ? new Date(status.timestamp).toLocaleTimeString("ru-RU") : "";

  if (status.status === "forward_error" || status.error) {
    return {
      tone: "error",
      title: "Ошибка доставки события",
      details: `${timeStr ? `[${timeStr}] ` : ""}${status.error || "Не удалось переслать событие в Paperclip"}`,
    };
  }

  if (status.confirmed) {
    return {
      tone: "success",
      title: "Тестовый запрос успешно получен",
      details: `${timeStr ? `[${timeStr}] ` : ""}Сервер ВКонтакте успешно подтвердил адрес (тип: ${status.eventType}).`,
    };
  }

  if (status.forwarded) {
    return {
      tone: "success",
      title: "События успешно принимаются",
      details: `${timeStr ? `[${timeStr}] ` : ""}Последнее событие: ${status.eventType}.`,
    };
  }

  return {
    tone: "neutral",
    title: "Статус обновлён",
    details: `${timeStr ? `[${timeStr}] ` : ""}Событие: ${status.eventType}.`,
  };
}
