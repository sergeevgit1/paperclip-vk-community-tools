import React from "react";
import { usePluginData } from "@paperclipai/plugin-sdk/ui";

export interface VkCommunitySummaryData {
  ok: boolean;
  error?: string;
  groupId?: number;
  name?: string;
  screenName?: string;
  photo?: string;
  membersCount?: number;
  unansweredMessages?: number;
  latestPostTime?: number | null;
  eventTransport?: "callback" | "long_poll" | "disabled";
  refreshedAt?: string;
  nextRefreshAt?: string;
  cached?: boolean;
  stale?: boolean;
}

interface JournalEventRow {
  id: string;
  event_type: string;
  category: string;
  status: string;
  created_at: string;
}

export function VkDashboardWidget({ companyId }: { companyId?: string }) {
  const { data, loading, error } = usePluginData<VkCommunitySummaryData>(
    "vk-community-summary",
    companyId ? { companyId } : {},
  );

  const { data: recentEvents } = usePluginData<JournalEventRow[]>(
    "vk-recent-events",
    companyId ? { companyId, limit: 3 } : {},
  );

  if (loading) {
    return (
      <div className="py-2 text-white/60 text-xs flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
        Загрузка данных VK сообщества...
      </div>
    );
  }

  if (error || !data?.ok) {
    return (
      <div className="py-2 text-red-400 text-xs flex flex-col gap-1">
        <div className="font-semibold text-red-300">VK Сообщество: Ошибка подключения</div>
        <div className="text-white/50">{data?.error || error?.message || "Нет данных"}</div>
      </div>
    );
  }

  const postDate = data.latestPostTime
    ? new Date(data.latestPostTime * 1000).toLocaleString("ru-RU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Нет постов";

  const events = Array.isArray(recentEvents) ? recentEvents : [];
  const transportLabel =
    data.eventTransport === "long_poll"
      ? "Long Poll"
      : data.eventTransport === "callback"
        ? "Callback"
        : "Выключен";

  return (
    <div className="flex flex-col gap-3 w-full text-white">
      {/* Header: чистый ряд без вложенной рамки карточки */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {data.photo ? (
            <img
              src={data.photo}
              alt={data.name}
              className="w-8 h-8 rounded-full border border-white/10 object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
              VK
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-xs tracking-[-0.01em] leading-tight text-white/90 truncate">
              {data.name}
            </div>
            <div className="text-[11px] text-white/40 truncate">
              {data.screenName ? `@${data.screenName}` : `club${data.groupId}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            {transportLabel}
          </span>
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/5 text-white/60 border border-white/10"
            title={data.cached ? "Данные из локального кэша (интервал 12ч)" : "Свежие данные"}
          >
            {data.cached ? "Кэш 12ч" : "Свежее"}
          </span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
          <div className="text-[10px] text-white/40 uppercase font-medium">Подписчики</div>
          <div className="text-base font-bold tracking-tight mt-0.5 text-white/95">
            {data.membersCount?.toLocaleString("ru-RU") ?? 0}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
          <div className="text-[10px] text-white/40 uppercase font-medium">Диалоги</div>
          <div className="text-base font-bold tracking-tight mt-0.5 text-white/95">
            {data.unansweredMessages ?? 0}
            <span className="text-[9px] text-white/30 ml-1 font-normal">без ответа</span>
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
          <div className="text-[10px] text-white/40 uppercase font-medium">Стена</div>
          <div className="text-xs font-semibold tracking-tight mt-1 text-white/80 truncate">
            {postDate}
          </div>
        </div>
      </div>

      {/* Recent Activity Micro-Feed */}
      {events.length > 0 && (
        <div className="pt-1.5 border-t border-white/5">
          <div className="text-[10px] uppercase font-semibold text-white/40 tracking-wider mb-1.5">
            Последние события
          </div>
          <div className="space-y-1">
            {events.slice(0, 3).map((evt) => (
              <div
                key={evt.id}
                className="flex items-center justify-between text-xs py-1 px-2 rounded bg-white/[0.02]"
              >
                <span className="text-white/80 truncate text-[11px]">{evt.event_type}</span>
                <span className="text-[9px] text-white/40 font-mono">
                  {evt.status === "invoked" ? "Агент" : "Аудит"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer Link */}
      <div className="flex items-center justify-between text-[10px] text-white/40 pt-0.5">
        <span>
          {data.refreshedAt
            ? `Обновлено: ${new Date(data.refreshedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
            : "VK готов"}
        </span>
        <a
          href={`https://vk.com/${data.screenName || `club${data.groupId}`}`}
          target="_blank"
          rel="noreferrer"
          className="text-blue-400 hover:text-blue-300 transition-colors"
        >
          Открыть в VK &rarr;
        </a>
      </div>
    </div>
  );
}
