import React from "react";
import { usePluginData } from "@paperclipai/plugin-sdk/ui";

interface RecentPost {
  id: number;
  date: number;
  text: string;
  likes: number;
  comments: number;
  reposts: number;
  views: number;
}

export interface VkCommunitySummaryData {
  ok: boolean;
  error?: string;
  groupId?: number;
  name?: string;
  screenName?: string;
  photo?: string;
  membersCount?: number;
  requestsLast12Hours?: number | null;
  customerLastMessageCount?: number | null;
  activeDonutMembers?: number | null;
  postponedPostsCount?: number | null;
  nextPostTime?: number | null;
  lastScheduledPostTime?: number | null;
  recentPosts?: RecentPost[];
  eventTransport?: "callback" | "long_poll" | "disabled";
  refreshedAt?: string;
  nextRefreshAt?: string;
  cached?: boolean;
  stale?: boolean;
}

function formatDate(timestamp?: number | null, includeTime = true): string {
  if (!timestamp) return "—";
  return new Date(timestamp * 1000).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function formatNumber(value?: number | null): string {
  return value == null ? "—" : value.toLocaleString("ru-RU");
}

function postTitle(post: RecentPost): string {
  const text = post.text.replace(/\s+/g, " ").trim();
  return text || `Публикация №${post.id}`;
}

export function VkDashboardWidget({ companyId }: { companyId?: string }) {
  const { data, loading, error } = usePluginData<VkCommunitySummaryData>(
    "vk-community-summary",
    companyId ? { companyId } : {},
  );

  if (loading) {
    return (
      <div className="py-2 text-white/60 text-xs flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
        Загрузка данных сообщества...
      </div>
    );
  }

  if (error || !data?.ok) {
    return (
      <div className="py-2 text-red-400 text-xs flex flex-col gap-1">
        <div className="font-semibold text-red-300">Сообщество: ошибка подключения</div>
        <div className="text-white/50">{data?.error || error?.message || "Нет данных"}</div>
      </div>
    );
  }

  const recentPosts = Array.isArray(data.recentPosts) ? data.recentPosts : [];
  const transportLabel =
    data.eventTransport === "long_poll"
      ? "Long Poll"
      : data.eventTransport === "callback"
        ? "Callback"
        : "Выключен";

  return (
    <div className="flex flex-col gap-3 w-full text-white">
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
            title={data.cached ? "Данные из локального кэша, интервал 12 часов" : "Свежие данные"}
          >
            {data.stale ? "Устарело" : data.cached ? "Кэш 12 ч" : "Свежее"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
          <div className="text-[10px] text-white/40 uppercase font-medium">Подписчики</div>
          <div className="text-base font-bold tracking-tight mt-0.5 text-white/95">
            {formatNumber(data.membersCount)}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
          <div className="text-[10px] text-white/40 uppercase font-medium">Обращения за 12 часов</div>
          <div className="text-base font-bold tracking-tight mt-0.5 text-white/95">
            {formatNumber(data.requestsLast12Hours)}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
          <div className="text-[10px] text-white/40 uppercase font-medium">Последнее сообщение клиента</div>
          <div className="text-base font-bold tracking-tight mt-0.5 text-white/95">
            {formatNumber(data.customerLastMessageCount)}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
          <div className="text-[10px] text-white/40 uppercase font-medium">Активные подписчики VK Donut</div>
          <div className="text-base font-bold tracking-tight mt-0.5 text-white/95">
            {formatNumber(data.activeDonutMembers)}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5 col-span-2 sm:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] text-white/40 uppercase font-medium">Отложенные публикации</div>
              <div className="text-base font-bold tracking-tight mt-0.5 text-white/95">
                {formatNumber(data.postponedPostsCount)}
              </div>
            </div>
            <div className="text-right text-[10px] leading-4 text-white/45">
              <div>Ближайшая: <span className="text-white/70">{formatDate(data.nextPostTime)}</span></div>
              <div>Последняя: <span className="text-white/70">{formatDate(data.lastScheduledPostTime)}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-1.5 border-t border-white/5">
        <div className="text-[10px] uppercase font-semibold text-white/40 tracking-wider mb-1.5">
          Последние публикации
        </div>
        {recentPosts.length > 0 ? (
          <div className="space-y-1">
            {recentPosts.map((post) => (
              <a
                key={post.id}
                href={`https://vk.com/wall-${Math.abs(data.groupId ?? 0)}_${post.id}`}
                target="_blank"
                rel="noreferrer"
                className="block py-1.5 px-2 rounded bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/80 truncate text-[11px]">{postTitle(post)}</span>
                  <span className="text-[9px] text-white/35 flex-shrink-0">{formatDate(post.date, false)}</span>
                </div>
                <div className="text-[9px] text-white/40 mt-1 flex gap-3">
                  <span>{formatNumber(post.views)} просмотров</span>
                  <span>{post.likes} реакций</span>
                  <span>{post.comments} комментариев</span>
                  <span>{post.reposts} репостов</span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-white/35 py-1">Нет доступных публикаций</div>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-white/40 pt-0.5">
        <span>
          {data.refreshedAt
            ? `Обновлено: ${new Date(data.refreshedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
            : "Данные готовы"}
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
