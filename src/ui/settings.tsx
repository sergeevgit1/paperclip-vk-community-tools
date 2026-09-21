import React, { useState } from "react";
import {
  useHostContext,
  usePluginAction,
  usePluginData,
  usePluginToast,
} from "@paperclipai/plugin-sdk/ui";

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
  checkedAt?: string;
}

export function VkCompanySettingsPage() {
  const { companyId } = useHostContext();
  const [testing, setTesting] = useState(false);
  const toast = usePluginToast();

  const { data, loading, error, refresh } = usePluginData<ConnectionStatus>(
    "vk-connection-status",
    companyId ? { companyId } : undefined,
  );
  const testConnection = usePluginAction("test-connection");

  const onTest = async () => {
    setTesting(true);
    try {
      await testConnection({ companyId });
      await refresh();
      toast({ title: "Соединение успешно проверено", tone: "success" });
    } catch (err: any) {
      await refresh();
      toast({ title: "Ошибка подключения к VK", body: err.message, tone: "error" });
    } finally {
      setTesting(false);
    }
  };

  const connected = data?.connected === true;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 text-slate-100">
      <div className="flex flex-col gap-2 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/20 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold tracking-tight">
            VK
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.04em] text-balance">Подключение VK сообщества</h1>
            <p className="text-sm text-white/50 mt-1">Публикации, сообщения, модерация и аналитика сообщества для агентов компании.</p>
          </div>
        </div>
      </div>

      <section className="rounded-[2rem] border border-white/10 bg-[#1b1b1b] shadow-black/30 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="text-xs uppercase text-white/40 tracking-wide font-semibold">Статус подключения</div>
            <div className="flex items-center gap-2 mt-2">
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`} />
              <span className="font-semibold text-white/90">
                {loading ? "Проверка..." : connected ? "Подключено" : "Не настроено или токены недействительны"}
              </span>
            </div>
            {(data?.error || error) && (
              <p className="text-xs text-red-400/90 mt-2 max-w-xl">{data?.error || error?.message}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onTest}
            disabled={testing}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold transition-colors shadow-lg shadow-blue-950/30"
          >
            {testing ? "Проверка..." : "Проверить подключение"}
          </button>
        </div>

        {connected && (
          <div className="flex items-center gap-4 pt-5 border-t border-white/5">
            {data?.photo && <img src={data.photo} alt="" className="w-14 h-14 rounded-2xl object-cover border border-white/10" />}
            <div>
              <div className="font-bold text-lg tracking-tight">
                {data?.groupName}{data?.verified ? <span className="ml-2 text-blue-400" title="Подтверждено VK">●</span> : null}
              </div>
              <div className="text-sm text-white/40">
                {data?.screenName ? `vk.com/${data.screenName}` : `club${data?.groupId}`} · {data?.membersCount?.toLocaleString("ru-RU")} подписчиков
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 mb-6">
        <div className="rounded-2xl border border-white/10 bg-[#1b1b1b] p-5">
          <div className="text-sm font-semibold text-white/90">Токен пользователя</div>
          <p className="text-xs text-white/45 leading-relaxed mt-2">
            Используется для публикаций на стене, загрузки фото/документов/видео и расширенной статистики. Нужны права: wall, photos, docs, video, stats, groups, offline.
          </p>
          <div className="mt-3 text-[11px] font-mono text-white/35">Настройка: userTokenRef (secret-ref)</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#1b1b1b] p-5">
          <div className="text-sm font-semibold text-white/90">Токен сообщества</div>
          <p className="text-xs text-white/45 leading-relaxed mt-2">
            Используется для сообщений сообщества и модерации. Нужны права: messages, photos, docs, manage.
          </p>
          <div className="mt-3 text-[11px] font-mono text-white/35">Настройка: groupTokenRef (secret-ref)</div>
        </div>
      </section>

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-sm text-amber-100/80">
        <strong className="text-amber-300">Безопасное хранение.</strong> Токены не вводятся на этой странице и не сохраняются в открытом виде. Создайте два секрета в хранилище Paperclip и выберите их в настройках экземпляра плагина. Числовой ID сообщества указывается без знака минус.
      </div>
    </div>
  );
}
