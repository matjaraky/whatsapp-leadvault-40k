import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  FastForward,
  MessageSquarePlus,
  Send,
  Trash2,
} from 'lucide-react';
import { ContactTier, MessageTemplateItem, VaultContact } from '../types/vault';
import { buildWhatsAppDirectUrl } from '../utils/vcfEngine';

interface QuickForwardStudioProps {
  contacts: VaultContact[];
  templates: MessageTemplateItem[];
  activeTemplateId: string;
  customMessage: string;
  useNativeProtocol: boolean;
  onSelectTemplate: (id: string, content: string) => void;
  onCustomMessageChange: (content: string) => void;
  onSaveTemplate: (title: string, category: string, content: string) => void;
  onDeleteTemplate: (id: string) => void;
  onMarkContacted: (contactId: string) => void;
}

export const QuickForwardStudio: React.FC<QuickForwardStudioProps> = ({
  contacts,
  templates,
  activeTemplateId,
  customMessage,
  useNativeProtocol,
  onSelectTemplate,
  onCustomMessageChange,
  onSaveTemplate,
  onDeleteTemplate,
  onMarkContacted,
}) => {
  const [newTplTitle, setNewTplTitle] = useState('');
  const [newTplCategory, setNewTplCategory] = useState('عروض وتخفيضات');
  const [queueFilterTier, setQueueFilterTier] = useState<'all' | ContactTier>('all');
  const [queueSearch, setQueueSearch] = useState('');
  const [queueCursor, setQueueCursor] = useState(0);
  const [sentIdsInSession, setSentIdsInSession] = useState<Set<string>>(new Set());
  const [copiedFeedback, setCopiedFeedback] = useState(false);

  const queueContacts = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    return contacts.filter((c) => {
      if (queueFilterTier !== 'all' && c.tier !== queueFilterTier) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q)
      );
    });
  }, [contacts, queueFilterTier, queueSearch]);

  const currentQueueContact = queueContacts[queueCursor] || null;
  const visibleQueueSlice = queueContacts.slice(queueCursor, queueCursor + 12);

  const renderMessageForContact = (contact: VaultContact) => {
    const base = customMessage.trim() || 'مرحباً {الاسم}، لدينا عرض جديد ومميز لك اليوم.';
    return base.replace(/\{الاسم\}|\{name\}/gi, contact.name);
  };

  const handleSaveCurrentAsTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTplTitle.trim() || !customMessage.trim()) return;
    onSaveTemplate(newTplTitle.trim(), newTplCategory.trim(), customMessage.trim());
    setNewTplTitle('');
  };

  const handleMarkAndAdvance = (contact: VaultContact) => {
    onMarkContacted(contact.id);
    setSentIdsInSession((prev) => {
      const next = new Set(prev);
      next.add(contact.id);
      return next;
    });
    if (queueCursor < queueContacts.length - 1) {
      setQueueCursor((c) => c + 1);
    }
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(customMessage);
      setCopiedFeedback(true);
      setTimeout(() => setCopiedFeedback(false), 1800);
    } catch {
      // Ignore clipboard permission errors in restricted frames
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Right Column (RTL): Message Composer & Saved Templates (5 cols) */}
      <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            01. محرر الرسائل وإعادة التوجيه الفوري
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            اكتب الرسالة أو العرض الذي تريد إعادة إرساله لعملائك. يمكنك استخدام{' '}
            <code className="font-mono text-emerald-700 dark:text-emerald-400">{'{الاسم}'}</code>{' '}
            ليتم استبداله باسم كل عميل تلقائياً عند فتح واتساب.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              نص الرسالة الجاهزة للإرسال
            </span>
            <button
              type="button"
              onClick={() =>
                onCustomMessageChange(`${customMessage} {الاسم}`.trim())
              }
              className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
            >
              + إدراج متغير {'{الاسم}'}
            </button>
          </div>
          <textarea
            rows={5}
            value={customMessage}
            onChange={(e) => onCustomMessageChange(e.target.value)}
            placeholder="أهلاً بك يا {الاسم}، يسعدنا مشاركة أحدث عروضنا الخاصة بك..."
            className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600 leading-relaxed"
          />
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="tabular-nums">{customMessage.length} / 2000 حرف</span>
            <button
              type="button"
              onClick={handleCopyMessage}
              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-slate-900"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedFeedback ? 'تم النسخ!' : 'نسخ النص'}</span>
            </button>
          </div>
        </div>

        {/* Save as Template Form */}
        <form
          onSubmit={handleSaveCurrentAsTemplate}
          className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5"
        >
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            حفظ الرسالة كقالب سريع في السحابة
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={newTplTitle}
              onChange={(e) => setNewTplTitle(e.target.value)}
              placeholder="عنوان القالب (مثال: عرض الجمعة)"
              className="sm:col-span-2 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              value={newTplCategory}
              onChange={(e) => setNewTplCategory(e.target.value)}
              placeholder="التصنيف"
              className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            <span>حفظ القالب للاستخدام المتكرر</span>
          </button>
        </form>

        {/* Saved Templates List */}
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            القوالب المحفوظة ({templates.length})
          </p>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {templates.map((tpl) => {
              const isSelected = tpl.id === activeTemplateId;
              return (
                <div
                  key={tpl.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    isSelected
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <button
                      type="button"
                      onClick={() => onSelectTemplate(tpl.id, tpl.content)}
                      className="text-xs font-semibold text-slate-900 dark:text-slate-100 hover:text-emerald-600 text-right truncate"
                    >
                      {tpl.title}{' '}
                      <span className="font-normal text-slate-400">· {tpl.category}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTemplate(tpl.id)}
                      className="text-slate-400 hover:text-red-600 p-1"
                      title="حذف القالب"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p
                    onClick={() => onSelectTemplate(tpl.id, tpl.content)}
                    className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 cursor-pointer"
                  >
                    {tpl.content}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Left Column (RTL): Rapid Sequential Forwarding Queue (7 cols) */}
      <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              02. طابور الإرسال المتتابع السريع (بديل شاشة إعادة التوجيه)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              أرسل رسالتك لعشرات العملاء واحداً تلو الآخر بضغطة زر واحدة دون فتح قائمة جهات اتصال واتساب الثقيلة.
            </p>
          </div>
          <div className="text-xs font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
            تم الإرسال في هذه الجلسة: {sentIdsInSession.size.toLocaleString('en-US')}
          </div>
        </div>

        {/* Queue Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <input
            type="text"
            value={queueSearch}
            onChange={(e) => {
              setQueueSearch(e.target.value);
              setQueueCursor(0);
            }}
            placeholder="تصفية الطابور بالاسم أو المجموعة..."
            className="sm:col-span-2 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
          />
          <select
            value={queueFilterTier}
            onChange={(e) => {
              setQueueFilterTier(e.target.value as 'all' | ContactTier);
              setQueueCursor(0);
            }}
            className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
          >
            <option value="all">كل الخزنة ({contacts.length.toLocaleString('en-US')})</option>
            <option value="archive_lead">أرشيف العملاء المحتملين فقط</option>
            <option value="active_status">قائمة الستوري النشطة فقط</option>
          </select>
        </div>

        {/* Spotlight Active Lead in Queue */}
        {currentQueueContact ? (
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  العميل الحالي في الطابور ({(queueCursor + 1).toLocaleString('en-US')} من{' '}
                  {queueContacts.length.toLocaleString('en-US')})
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {currentQueueContact.name}
                </h3>
                <p className="text-xs font-mono text-slate-600 dark:text-slate-400" dir="ltr">
                  {currentQueueContact.phone} · {currentQueueContact.group}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={buildWhatsAppDirectUrl(
                    currentQueueContact.phone,
                    renderMessageForContact(currentQueueContact),
                    useNativeProtocol
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleMarkAndAdvance(currentQueueContact)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>إرسال عبر واتساب والانتقال للتالي</span>
                  <ExternalLink className="w-3 h-3 opacity-75" />
                </a>

                <button
                  type="button"
                  onClick={() =>
                    setQueueCursor((c) => Math.min(queueContacts.length - 1, c + 1))
                  }
                  className="inline-flex items-center gap-1 px-3 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                >
                  <FastForward className="w-3.5 h-3.5" />
                  <span>تخطي</span>
                </button>
              </div>
            </div>

            <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-700 dark:text-slate-300">
              <span className="text-slate-400 block mb-1">معاينة الرسالة المخصصة لهذا العميل:</span>
              {renderMessageForContact(currentQueueContact)}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-500">
            لا توجد جهات اتصال في الطابور الحالي.
          </div>
        )}

        {/* Upcoming Queue List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>العملاء القادمون في الطابور السريع</span>
            {queueCursor > 0 && (
              <button
                type="button"
                onClick={() => setQueueCursor(0)}
                className="text-emerald-600 hover:underline"
              >
                العودة لأول الطابور
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            {visibleQueueSlice.map((item, idx) => {
              const absoluteIdx = queueCursor + idx;
              const wasSent = sentIdsInSession.has(item.id);
              const url = buildWhatsAppDirectUrl(
                item.phone,
                renderMessageForContact(item),
                useNativeProtocol
              );

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono text-slate-400 tabular-nums w-8 shrink-0">
                      #{absoluteIdx + 1}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {item.name}
                    </span>
                    <span className="font-mono text-slate-500 shrink-0" dir="ltr">
                      {item.phone}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {wasSent && (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>تم الإرسال</span>
                      </span>
                    )}
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleMarkAndAdvance(item)}
                      className="px-2.5 py-1 font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded hover:bg-emerald-100 transition-colors"
                    >
                      إرسال فوري
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
