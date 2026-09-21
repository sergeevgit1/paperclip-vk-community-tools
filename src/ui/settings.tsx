import React, { useEffect, useState } from "react";
import {
  useHostContext,
  usePluginAction,
  usePluginData,
  usePluginToast,
} from "@paperclipai/plugin-sdk/ui";

const PLUGIN_ID = "zaruba.vk-community-tools";

interface ConnectionStatus {
  connected: boolean;
  error?: string;
  groupId?: number;
  groupName?: string;
  screenName?: string;
  photo?: string;
  membersCount?: number;
  verified?: boolean;
  apiVersion?: string;
  eventTransport?: "callback" | "long_poll" | "disabled";
  assignedAgents?: {
    supportAgentId?: string | null;
    moderationAgentId?: string | null;
    financeAgentId?: string | null;
  };
  automationSettings?: {
    emergencyKillSwitch?: boolean;
    maxRepliesPerHourPerUser?: number;
  };
  checkedAt?: string;
}

interface AgentItem {
  id: string;
  name: string;
  role?: string;
  status: string;
}

interface JournalEventRow {
  id: string;
  event_id: string;
  event_type: string;
  category: string;
  peer_id?: number | null;
  status: string;
  agent_id?: string | null;
  created_at: string;
}

async function hostFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function VkCompanySettingsPage() {
  const { companyId } = useHostContext();
  const toast = usePluginToast();

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Local config form state
  const [eventTransport, setEventTransport] = useState<"callback" | "long_poll" | "disabled">("disabled");
  const [supportAgentId, setSupportAgentId] = useState<string>("");
  const [moderationAgentId, setModerationAgentId] = useState<string>("");
  const [financeAgentId, setFinanceAgentId] = useState<string>("");
  const [emergencyKillSwitch, setEmergencyKillSwitch] = useState<boolean>(false);
  const [maxReplies, setMaxReplies] = useState<number>(10);
  const [callbackConfirmation, setCallbackConfirmation] = useState<string>("");

  const { data: statusData, loading: statusLoading, refresh: refreshStatus } =
    usePluginData<ConnectionStatus>(
      "vk-connection-status",
      companyId ? { companyId } : undefined,
    );

  const { data: agentsData } = usePluginData<AgentItem[]>(
    "company-agents",
    companyId ? { companyId } : undefined,
  );

  const { data: eventsData, refresh: refreshEvents } = usePluginData<JournalEventRow[]>(
    "vk-recent-events",
    companyId ? { companyId, limit: 10 } : undefined,
  );

  const testConnection = usePluginAction("test-connection");

  // Load existing instance config
  useEffect(() => {
    let cancelled = false;
    hostFetchJson<{ configJson?: Record<string, unknown> }>(`/api/plugins/${PLUGIN_ID}/config`)
      .then((res) => {
        if (cancelled || !res?.configJson) return;
        const cfg = res.configJson;
        if (cfg.eventTransport === "callback" || cfg.eventTransport === "long_poll") {
          setEventTransport(cfg.eventTransport);
        }
        if (typeof cfg.callbackConfirmationCode === "string") {
          setCallbackConfirmation(cfg.callbackConfirmationCode);
        }
        const assigned = (cfg.assignedAgents as Record<string, unknown>) ?? {};
        if (typeof assigned.supportAgentId === "string") setSupportAgentId(assigned.supportAgentId);
        if (typeof assigned.moderationAgentId === "string") setModerationAgentId(assigned.moderationAgentId);
        if (typeof assigned.financeAgentId === "string") setFinanceAgentId(assigned.financeAgentId);

        const auto = (cfg.automationSettings as Record<string, unknown>) ?? {};
        if (typeof auto.emergencyKillSwitch === "boolean") setEmergencyKillSwitch(auto.emergencyKillSwitch);
        if (typeof auto.maxRepliesPerHourPerUser === "number") setMaxReplies(auto.maxRepliesPerHourPerUser);
      })
      .catch(() => {
        // Soft fail if cannot read config via direct API
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const onTest = async () => {
    setTesting(true);
    try {
      await testConnection({ companyId });
      await refreshStatus();
      toast({ title: "Соединение успешно проверено", tone: "success" });
    } catch (err: any) {
      await refreshStatus();
      toast({ title: "Ошибка подключения к VK", body: err.message, tone: "error" });
    } finally {
      setTesting(false);
    }
  };

  const onSaveConfig = async () => {
    setSaving(true);
    try {
      // Read current base config first to preserve tokens and groupId
      const current = await hostFetchJson<{ configJson?: Record<string, unknown> }>(
        `/api/plugins/${PLUGIN_ID}/config`,
      );
      const currentCfg = current?.configJson ?? {};

      const nextConfig = {
        ...currentCfg,
        eventTransport,
        callbackConfirmationCode: callbackConfirmation.trim() || undefined,
        assignedAgents: {
          supportAgentId: supportAgentId.trim() || null,
          moderationAgentId: moderationAgentId.trim() || null,
          financeAgentId: financeAgentId.trim() || null,
        },
        automationSettings: {
          emergencyKillSwitch,
          maxRepliesPerHourPerUser: Number(maxReplies) || 10,
        },
      };

      await hostFetchJson(`/api/plugins/${PLUGIN_ID}/config`, {
        method: "POST",
        body: JSON.stringify({ configJson: nextConfig }),
      });

      await refreshStatus();
      await refreshEvents();
      toast({ title: "Настройки успешно сохранены", tone: "success" });
    } catch (err: any) {
      toast({ title: "Ошибка сохранения настроек", body: err.message, tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const connected = statusData?.connected === true;
  const activeAgents = Array.isArray(agentsData) ? agentsData : [];
  const recentEvents = Array.isArray(eventsData) ? eventsData : [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 text-slate-100">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/20 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold tracking-tight">
            VK
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.04em]">VK Сообщество и Автоматизация</h1>
            <p className="text-sm text-white/50 mt-1">
              Поддержка в личных сообщениях, модерация комментариев и обработка событий оплаты.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onSaveConfig}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-semibold transition-colors shadow-lg shadow-blue-950/30"
        >
          {saving ? "Сохранение..." : "Сохранить настройки"}
        </button>
      </div>

      {/* Emergency Kill Switch Banner */}
      <div className={`p-4 rounded-2xl border mb-6 flex items-center justify-between gap-4 transition-colors ${
        emergencyKillSwitch
          ? "bg-red-500/10 border-red-500/30 text-red-200"
          : "bg-white/[0.02] border-white/10 text-white/80"
      }`}>
        <div>
          <div className="font-semibold text-sm flex items-center gap-2">
            <span>Аварийная остановка (Emergency Kill Switch)</span>
            {emergencyKillSwitch && (
              <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                Активна
              </span>
            )}
          </div>
          <p className="text-xs text-white/50 mt-0.5">
            Принудительно блокирует любые исходящие автоматические ответы агентов в ВК.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={emergencyKillSwitch}
            onChange={(e) => setEmergencyKillSwitch(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
        </label>
      </div>

      {/* Connection Status Section */}
      <section className="rounded-[2rem] border border-white/10 bg-[#1b1b1b] p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="text-xs uppercase text-white/40 tracking-wide font-semibold">Статус подключения</div>
            <div className="flex items-center gap-2 mt-2">
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`} />
              <span className="font-semibold text-white/90">
                {statusLoading ? "Проверка..." : connected ? "Подключено" : "Не настроено"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onTest}
            disabled={testing}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold transition-colors"
          >
            {testing ? "Проверка..." : "Проверить API"}
          </button>
        </div>

        {connected && (
          <div className="flex items-center gap-4 pt-5 border-t border-white/5">
            {statusData?.photo && <img src={statusData.photo} alt="" className="w-12 h-12 rounded-2xl object-cover border border-white/10" />}
            <div>
              <div className="font-bold text-base tracking-tight">
                {statusData?.groupName}{statusData?.verified ? <span className="ml-2 text-blue-400">●</span> : null}
              </div>
              <div className="text-xs text-white/40">
                club{statusData?.groupId} · {statusData?.membersCount?.toLocaleString("ru-RU")} подписчиков
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Transport Selection */}
      <section className="rounded-[2rem] border border-white/10 bg-[#1b1b1b] p-6 mb-6">
        <h2 className="text-base font-bold tracking-tight mb-4">Способ приёма событий</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className={`p-4 rounded-xl border cursor-pointer flex flex-col justify-between transition-all ${
            eventTransport === "long_poll"
              ? "bg-blue-600/10 border-blue-500 text-white"
              : "bg-white/[0.02] border-white/10 text-white/60 hover:border-white/20"
          }`}>
            <div>
              <input
                type="radio"
                name="transport"
                value="long_poll"
                checked={eventTransport === "long_poll"}
                onChange={() => setEventTransport("long_poll")}
                className="sr-only"
              />
              <div className="font-semibold text-sm text-white">Bots Long Poll</div>
              <p className="text-xs text-white/45 mt-1 leading-relaxed">
                Фоновый опрос серверов ВК. Работает без внешних портов и белого IP.
              </p>
            </div>
            <span className="text-[10px] text-blue-400 font-medium mt-3">Рекомендуется</span>
          </label>

          <label className={`p-4 rounded-xl border cursor-pointer flex flex-col justify-between transition-all ${
            eventTransport === "callback"
              ? "bg-blue-600/10 border-blue-500 text-white"
              : "bg-white/[0.02] border-white/10 text-white/60 hover:border-white/20"
          }`}>
            <div>
              <input
                type="radio"
                name="transport"
                value="callback"
                checked={eventTransport === "callback"}
                onChange={() => setEventTransport("callback")}
                className="sr-only"
              />
              <div className="font-semibold text-sm text-white">Callback API</div>
              <p className="text-xs text-white/45 mt-1 leading-relaxed">
                Входящие вебхуки через прокси-шлюз для мгновенной доставки.
              </p>
            </div>
          </label>

          <label className={`p-4 rounded-xl border cursor-pointer flex flex-col justify-between transition-all ${
            eventTransport === "disabled"
              ? "bg-blue-600/10 border-blue-500 text-white"
              : "bg-white/[0.02] border-white/10 text-white/60 hover:border-white/20"
          }`}>
            <div>
              <input
                type="radio"
                name="transport"
                value="disabled"
                checked={eventTransport === "disabled"}
                onChange={() => setEventTransport("disabled")}
                className="sr-only"
              />
              <div className="font-semibold text-sm text-white">Выключено</div>
              <p className="text-xs text-white/45 mt-1 leading-relaxed">
                События не принимаются. Плагин работает только в режиме исходящих команд.
              </p>
            </div>
          </label>
        </div>

        {eventTransport === "callback" && (
          <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-2">
            <label className="text-xs font-semibold text-white/70">Строка подтверждения (confirmation_code)</label>
            <input
              type="text"
              value={callbackConfirmation}
              onChange={(e) => setCallbackConfirmation(e.target.value)}
              placeholder="Например: a1b2c3d4"
              className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-blue-500"
            />
            <p className="text-[11px] text-white/40">
              Код из настроек Callback API сообщества ВКонтакте.
            </p>
          </div>
        )}
      </section>

      {/* Agent Assignment Matrix */}
      <section className="rounded-[2rem] border border-white/10 bg-[#1b1b1b] p-6 mb-6">
        <h2 className="text-base font-bold tracking-tight mb-2">Назначение агентов</h2>
        <p className="text-xs text-white/50 mb-5 leading-relaxed">
          <strong className="text-white/80">Правило изоляции:</strong> если агент не назначен на направление, события сохраняются в журнал, но автоматические ответы и действия не выполняются.
        </p>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
            <div>
              <div className="text-xs font-semibold text-white/90">Поддержка (Диалоги и личные сообщения)</div>
              <div className="text-[11px] text-white/40 mt-0.5">События: message_new</div>
            </div>
            <select
              value={supportAgentId}
              onChange={(e) => setSupportAgentId(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-[#242424] border border-white/10 text-xs text-white focus:outline-none focus:border-blue-500 min-w-[200px]"
            >
              <option value="">(Не назначен — только журнал)</option>
              {activeAgents.map((ag) => (
                <option key={ag.id} value={ag.id}>{ag.name} ({ag.role || "agent"})</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
            <div>
              <div className="text-xs font-semibold text-white/90">Модерация стены и комментариев</div>
              <div className="text-[11px] text-white/40 mt-0.5">События: wall_reply_new, market_comment_new</div>
            </div>
            <select
              value={moderationAgentId}
              onChange={(e) => setModerationAgentId(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-[#242424] border border-white/10 text-xs text-white focus:outline-none focus:border-blue-500 min-w-[200px]"
            >
              <option value="">(Не назначен — только журнал)</option>
              {activeAgents.map((ag) => (
                <option key={ag.id} value={ag.id}>{ag.name} ({ag.role || "agent"})</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
            <div>
              <div className="text-xs font-semibold text-white/90">Оплаты, донаты и заказы</div>
              <div className="text-[11px] text-white/40 mt-0.5">События: donut_subscription_*, market_order_*</div>
            </div>
            <select
              value={financeAgentId}
              onChange={(e) => setFinanceAgentId(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-[#242424] border border-white/10 text-xs text-white focus:outline-none focus:border-blue-500 min-w-[200px]"
            >
              <option value="">(Не назначен — только журнал)</option>
              {activeAgents.map((ag) => (
                <option key={ag.id} value={ag.id}>{ag.name} ({ag.role || "agent"})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between gap-4">
          <span className="text-xs text-white/60">Максимум автоматических ответов одному пользователю в час:</span>
          <input
            type="number"
            min={1}
            max={50}
            value={maxReplies}
            onChange={(e) => setMaxReplies(Number(e.target.value))}
            className="w-20 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white text-center focus:outline-none focus:border-blue-500"
          />
        </div>
      </section>

      {/* Recent Events Feed */}
      <section className="rounded-[2rem] border border-white/10 bg-[#1b1b1b] p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold tracking-tight">Журнал входящих событий</h2>
          <button
            type="button"
            onClick={() => refreshEvents()}
            className="text-xs text-blue-400 hover:text-blue-300 font-medium"
          >
            Обновить ленту
          </button>
        </div>

        {recentEvents.length === 0 ? (
          <div className="text-xs text-white/40 py-4 text-center">
            События ещё не поступали или сбор отключен.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {recentEvents.map((evt) => (
              <div key={evt.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-medium text-white/90">{evt.event_type}</div>
                  <div className="text-[11px] text-white/40 mt-0.5">
                    Категория: {evt.category} · {new Date(evt.created_at).toLocaleTimeString("ru-RU")}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                  evt.status === "invoked"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : evt.status === "kill_switch"
                      ? "bg-red-500/10 text-red-400 border border-red-500/20"
                      : "bg-white/5 text-white/50 border border-white/10"
                }`}>
                  {evt.status === "invoked" ? "Агент вызван" : evt.status === "kill_switch" ? "Остановлено" : "Аудит"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
