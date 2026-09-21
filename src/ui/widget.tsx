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
  refreshedAt?: string;
}

export function VkDashboardWidget({ companyId }: { companyId?: string }) {
  const { data, loading, error } = usePluginData<VkCommunitySummaryData>(
    "vk-community-summary",
    companyId ? { companyId } : {},
  );

  if (loading) {
    return (
      <div className="p-4 rounded-2xl bg-[#1b1b1b] border border-white/10 text-white/60 text-sm">
        Загрузка данных VK сообщества...
      </div>
    );
  }

  if (error || !data?.ok) {
    return (
      <div className="p-4 rounded-2xl bg-[#1b1b1b] border border-red-500/20 text-red-400 text-sm">
        <div className="font-semibold text-red-300">VK Сообщество: Ошибка подключения</div>
        <div className="text-xs mt-1 text-white/50">{data?.error || error?.message || "Нет данных"}</div>
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

  return (
    <div className="p-5 rounded-2xl bg-[#1b1b1b] border border-white/10 shadow-black/30 text-white flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-3">
          {data.photo ? (
            <img src={data.photo} alt={data.name} className="w-10 h-10 rounded-full border border-white/10 object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold">
              VK
            </div>
          )}
          <div>
            <div className="font-semibold text-sm tracking-[-0.02em] leading-tight text-white/90">
              {data.name}
            </div>
            <div className="text-xs text-white/40">
              {data.screenName ? `@${data.screenName}` : `club${data.groupId}`}
            </div>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Активно
        </span>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
          <div className="text-[11px] text-white/40 uppercase font-medium">Подписчики</div>
          <div className="text-lg font-bold tracking-tight mt-1 text-white/95">
            {data.membersCount?.toLocaleString("ru-RU") ?? 0}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
          <div className="text-[11px] text-white/40 uppercase font-medium">Диалоги</div>
          <div className="text-lg font-bold tracking-tight mt-1 text-white/95">
            {data.unansweredMessages ?? 0}
            <span className="text-[10px] text-white/30 ml-1 font-normal">без ответа</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
          <div className="text-[11px] text-white/40 uppercase font-medium">Стена</div>
          <div className="text-xs font-semibold tracking-tight mt-2 text-white/80 truncate">
            {postDate}
          </div>
        </div>
      </div>

      {/* Footer Link */}
      <div className="flex items-center justify-between text-[11px] text-white/40 pt-1">
        <span>Обновлено: {new Date(data.refreshedAt ?? Date.now()).toLocaleTimeString("ru-RU")}</span>
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
