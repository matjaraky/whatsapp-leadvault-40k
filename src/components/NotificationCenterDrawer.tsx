import React, { useState } from 'react';
import {
  Bell,
  BellRing,
  CheckCheck,
  Send,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { NotificationChannel, VaultNotificationItem } from '../types/vault';
import { triggerSystemTrayNotification } from '../services/cloudVaultService';

interface NotificationCenterDrawerProps {
  isOpen: boolean;
  notifications: VaultNotificationItem[];
  onClose: () => void;
  onDispatchNotification: (payload: {
    title: string;
    body: string;
    channel: NotificationChannel;
  }) => Promise<void>;
  onMarkRead: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const NotificationCenterDrawer: React.FC<NotificationCenterDrawerProps> = ({
  isOpen,
  notifications,
  onClose,
  onDispatchNotification,
  onMarkRead,
  onDelete,
}) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState<NotificationChannel>('sync_alert');
  const [permissionState, setPermissionState] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );
  const [isSending, setIsSending] = useState(false);

  if (!isOpen) return null;

  const handleEnableSystemNotifications = async () => {
    const ok = await triggerSystemTrayNotification(
      'تم تفعيل الإشعارات الفورية بنجاح',
      'ستصلك تنبيهات الخزنة وتحديثات قوقل شيت مباشرة في شريط إشعارات الجوال والويب.'
    );
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionState(Notification.permission);
    }
    if (ok) {
      await onDispatchNotification({
        title: 'تفعيل قناة إشعارات الجوال والويب',
        body: 'تم ربط شريط الإشعارات المنبثق مع مزامنة Firestore الفورية بنجاح.',
        channel: 'sync_alert',
      });
    }
  };

  const handleSendAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setIsSending(true);
    try {
      await onDispatchNotification({
        title: title.trim(),
        body: body.trim(),
        channel,
      });
      await triggerSystemTrayNotification(title.trim(), body.trim());
      setTitle('');
      setBody('');
    } finally {
      setIsSending(false);
    }
  };

  const channelLabel = (ch: NotificationChannel) => {
    switch (ch) {
      case 'sheets_admin':
        return 'إدارة قوقل شيت';
      case 'status_rotation':
        return 'تدوير دفعات الستوري';
      case 'version_update':
        return 'تحديث الإصدار التلقائي';
      default:
        return 'مزامنة الخزنة الفورية';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between overflow-hidden">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BellRing className="w-5 h-5 text-emerald-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                مركز الإشعارات الفورية (الجوال والويب)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                مزامنة لحظية عبر Firestore + إشعار منبثق في شريط الهاتف
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
            aria-label="إغلاق نافذة الإشعارات"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* System Tray Permission Card */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <span>حالة إشعارات شريط الهاتف والنظام</span>
              </span>
              <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
                {permissionState === 'granted'
                  ? 'مفعّل (Granted)'
                  : permissionState === 'denied'
                  ? 'محظور من المتصفح'
                  : 'بانتظار التفعيل'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              عند التفعيل، سيصل كل تنبيه جديد من الخزنة أو من جدول Google Sheets الإداري كإشعار منبثق في شريط إشعارات أندرويد/الويب وفي هذه النافذة معاً.
            </p>
            <button
              type="button"
              onClick={handleEnableSystemNotifications}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>
                {permissionState === 'granted'
                  ? 'إرسال إشعار منبثق تجريبي لشريط الهاتف الآن'
                  : 'تفعيل إشعارات شريط الهاتف والويب'}
              </span>
            </button>
          </div>

          {/* Broadcast / Test Notification Form */}
          <form
            onSubmit={handleSendAlert}
            className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3"
          >
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              إرسال تنبيه فوري عبر قناة Firestore
            </h3>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان الإشعار (مثال: تم تجهيز دفعة الستوري الجديدة)"
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
            />
            <textarea
              rows={2}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="نص التنبيه الذي سيظهر في شريط الهاتف وداخل التطبيق..."
              className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
            />
            <div className="flex items-center gap-2">
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as NotificationChannel)}
                className="flex-1 px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              >
                <option value="sync_alert">قناة مزامنة الخزنة</option>
                <option value="sheets_admin">قناة إدارة قوقل شيت</option>
                <option value="status_rotation">قناة دفعات الستوري</option>
                <option value="version_update">قناة تحديث الإصدار</option>
              </select>
              <button
                type="submit"
                disabled={isSending}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSending ? 'جاري الإرسال...' : 'بث الإشعار'}</span>
              </button>
            </div>
          </form>

          {/* Notifications Stream List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>سجل الإشعارات الفورية ({notifications.length})</span>
              <span>مزامنة لحظية (onSnapshot)</span>
            </div>

            {notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                لا توجد إشعارات حالياً. اضغط على زر الإشعار التجريبي أعلاه لتجربة الإشعار المنبثق الفوري.
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3 rounded-xl border transition-colors space-y-1.5 ${
                      n.read
                        ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-75'
                        : 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {n.title}
                      </h4>
                      <div className="flex items-center gap-1 shrink-0">
                        {!n.read && (
                          <button
                            type="button"
                            onClick={() => onMarkRead(n.id)}
                            className="p-1 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded"
                            title="تعيين كمقروء"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDelete(n.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {n.body}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                      <span>{channelLabel(n.channel)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{new Date(n.createdAtIso).toLocaleTimeString('ar-SA')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
