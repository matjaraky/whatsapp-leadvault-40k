import React, { useMemo, useRef, useState } from 'react';
import {
  Archive,
  CheckSquare,
  ExternalLink,
  MessageSquareShare,
  Phone,
  Search,
  Square,
  Star,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { ContactTier, VaultContact } from '../types/vault';
import { buildWhatsAppDirectUrl } from '../utils/vcfEngine';

interface VirtualizedContactGridProps {
  contacts: VaultContact[];
  selectedIds: Set<string>;
  activeTemplateContent: string;
  useNativeProtocol: boolean;
  onToggleSelect: (id: string) => void;
  onSelectAllFiltered: (filteredIds: string[], select: boolean) => void;
  onChangeTier: (ids: string[], newTier: ContactTier) => void;
  onDeleteContacts: (ids: string[]) => void;
  onMarkContacted: (id: string) => void;
  onAddSingleContact: (contact: Omit<VaultContact, 'id'>) => void;
}

const ROW_HEIGHT = 48;
const VIEWPORT_HEIGHT = 560;
const OVERSCAN = 8;

export const VirtualizedContactGrid: React.FC<VirtualizedContactGridProps> = ({
  contacts,
  selectedIds,
  activeTemplateContent,
  useNativeProtocol,
  onToggleSelect,
  onSelectAllFiltered,
  onChangeTier,
  onDeleteContacts,
  onMarkContacted,
  onAddSingleContact,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | ContactTier>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [scrollTop, setScrollTop] = useState(0);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTier, setNewTier] = useState<ContactTier>('active_status');
  const [newGroup, setNewGroup] = useState('عملاء VIP');

  const containerRef = useRef<HTMLDivElement>(null);

  const availableGroups = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < contacts.length; i++) {
      if (contacts[i].group) set.add(contacts[i].group);
    }
    return Array.from(set);
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return contacts.filter((c) => {
      if (tierFilter !== 'all' && c.tier !== tierFilter) return false;
      if (groupFilter !== 'all' && c.group !== groupFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q)
      );
    });
  }, [contacts, searchQuery, tierFilter, groupFilter]);

  const totalRows = filteredContacts.length;
  const totalHeight = totalRows * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    totalRows,
    Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN
  );
  const visibleRows = filteredContacts.slice(startIndex, endIndex);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const allFilteredSelected =
    filteredContacts.length > 0 &&
    filteredContacts.every((c) => selectedIds.has(c.id));

  const handleSelectAllClick = () => {
    const ids = filteredContacts.map((c) => c.id);
    onSelectAllFiltered(ids, !allFilteredSelected);
  };

  const handleQuickAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;
    onAddSingleContact({
      name: newName.trim(),
      phone: newPhone.trim(),
      tier: newTier,
      group: newGroup.trim() || 'عام',
    });
    setNewName('');
    setNewPhone('');
    setShowQuickAdd(false);
  };

  const formatPersonalizedMessage = (contactName: string) => {
    if (!activeTemplateContent.trim()) return undefined;
    return activeTemplateContent.replace(/\{الاسم\}|\{name\}/gi, contactName);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      {/* Top Filter & Bulk Action Toolbar */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setScrollTop(0);
              }}
              placeholder="ابحث بالاسم أو الرقم أو المجموعة وسط 40,000+ جهة اتصال فوراً..."
              className="w-full pr-10 pl-4 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          {/* Interactive Segmented Tier Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setTierFilter('all');
                setScrollTop(0);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                tierFilter === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              الكل ({contacts.length.toLocaleString('en-US')})
            </button>
            <button
              type="button"
              onClick={() => {
                setTierFilter('active_status');
                setScrollTop(0);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                tierFilter === 'active_status'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              قائمة الستوري النشطة
            </button>
            <button
              type="button"
              onClick={() => {
                setTierFilter('archive_lead');
                setScrollTop(0);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                tierFilter === 'archive_lead'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              أرشيف العملاء المحتملين
            </button>
          </div>

          {/* Group Selector */}
          <select
            value={groupFilter}
            onChange={(e) => {
              setGroupFilter(e.target.value);
              setScrollTop(0);
            }}
            aria-label="تصفية حسب المجموعة"
            className="px-3 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="all">كل المجموعات ({availableGroups.length})</option>
            {availableGroups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowQuickAdd((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>إضافة رقم سريع</span>
          </button>
        </div>

        {/* Quick Add Single Contact Row */}
        {showQuickAdd && (
          <form
            onSubmit={handleQuickAddSubmit}
            className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800"
          >
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="اسم العميل..."
              className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              required
              dir="ltr"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="+967770000000"
              className="px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 text-left"
            />
            <input
              type="text"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              placeholder="المجموعة (مثال: عملاء جملة)"
              className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
            />
            <select
              value={newTier}
              onChange={(e) => setNewTier(e.target.value as ContactTier)}
              className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
            >
              <option value="active_status">قائمة الستوري النشطة (للهاتف)</option>
              <option value="archive_lead">أرشيف العملاء المحتملين (سحابي)</option>
            </select>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              حفظ في الخزنة
            </button>
          </form>
        )}

        {/* Bulk Selection Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSelectAllClick}
              className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 hover:text-emerald-600 font-medium whitespace-nowrap shrink-0"
            >
              {allFilteredSelected ? (
                <CheckSquare className="w-4 h-4 text-emerald-600" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              <span>
                تحديد نتائج البحث ({filteredContacts.length.toLocaleString('en-US')})
              </span>
            </button>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              المحدد حالياً: {selectedIds.size.toLocaleString('en-US')} رقم
            </span>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onChangeTier(Array.from(selectedIds), 'active_status')
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-md hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0"
              >
                <Star className="w-3.5 h-3.5" />
                <span>ترقية لقائمة الستوري النشطة</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeTier(Array.from(selectedIds), 'archive_lead')
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-md hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>نقل لأرشيف العملاء السحابي</span>
              </button>
              <button
                type="button"
                onClick={() => onDeleteContacts(Array.from(selectedIds))}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف المحدد</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table Column Header */}
      <div className="grid grid-cols-12 items-center px-4 py-2.5 bg-slate-100/80 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400">
        <div className="col-span-4 sm:col-span-3">الاسم والعميل</div>
        <div className="col-span-3 sm:col-span-3 text-left" dir="ltr">
          رقم الواتساب
        </div>
        <div className="hidden sm:block sm:col-span-3">القائمة والمجموعة</div>
        <div className="col-span-5 sm:col-span-3 text-left">
          مراسلة فورية بدون حفظ بالهاتف
        </div>
      </div>

      {/* Virtualized Viewport */}
      {filteredContacts.length === 0 ? (
        <div className="py-16 px-4 text-center space-y-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            لا توجد جهات اتصال مطابقة لبحثك الحالي
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            يمكنك استيراد ملف جهات اتصالك الكامل (VCF أو CSV) أو توليد دفعة تجريبية من 40,000 عميل لاختبار السرعة الفورية.
          </p>
        </div>
      ) : (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          style={{ height: VIEWPORT_HEIGHT }}
          className="overflow-y-auto relative divide-y divide-slate-100 dark:divide-slate-800/60"
        >
          <div style={{ height: totalHeight, position: 'relative' }}>
            {visibleRows.map((contact, idx) => {
              const actualIndex = startIndex + idx;
              const topOffset = actualIndex * ROW_HEIGHT;
              const isSelected = selectedIds.has(contact.id);
              const directChatUrl = buildWhatsAppDirectUrl(
                contact.phone,
                undefined,
                useNativeProtocol
              );
              const templateChatUrl = buildWhatsAppDirectUrl(
                contact.phone,
                formatPersonalizedMessage(contact.name),
                useNativeProtocol
              );

              return (
                <div
                  key={contact.id}
                  style={{
                    position: 'absolute',
                    top: topOffset,
                    left: 0,
                    right: 0,
                    height: ROW_HEIGHT,
                  }}
                  className={`grid grid-cols-12 items-center px-4 text-sm transition-colors ${
                    isSelected
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  {/* Name + Checkbox */}
                  <div className="col-span-4 sm:col-span-3 flex items-center gap-2.5 min-w-0 pr-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(contact.id)}
                      aria-label={`تحديد ${contact.name}`}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                    />
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {contact.name}
                    </span>
                  </div>

                  {/* Phone Number (Tabular Monospace) */}
                  <div
                    className="col-span-3 sm:col-span-3 text-left font-mono text-xs text-slate-700 dark:text-slate-300 truncate"
                    dir="ltr"
                  >
                    {contact.phone}
                  </div>

                  {/* Unboxed Metadata: Tier + Group (Zero-Pill Discipline) */}
                  <div className="hidden sm:flex sm:col-span-3 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                    <button
                      type="button"
                      onClick={() =>
                        onChangeTier(
                          [contact.id],
                          contact.tier === 'active_status'
                            ? 'archive_lead'
                            : 'active_status'
                        )
                      }
                      title="اضغط للتبديل بين قائمة الستوري والأرشيف"
                      className={`font-medium hover:underline whitespace-nowrap shrink-0 ${
                        contact.tier === 'active_status'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {contact.tier === 'active_status'
                        ? 'ستوري نشط'
                        : 'أرشيف سحابي'}
                    </button>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{contact.group}</span>
                  </div>

                  {/* Direct WhatsApp Actions */}
                  <div className="col-span-5 sm:col-span-3 flex items-center justify-end gap-1.5">
                    <a
                      href={directChatUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onMarkContacted(contact.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors whitespace-nowrap shrink-0"
                      title="فتح محادثة واتساب مباشرة بدون حفظ الرقم في الهاتف"
                    >
                      <Phone className="w-3 h-3" />
                      <span>محادثة</span>
                    </a>

                    <a
                      href={templateChatUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onMarkContacted(contact.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
                      title="إعادة توجيه القالب النشط مباشرة إلى هذا العميل"
                    >
                      <MessageSquareShare className="w-3 h-3" />
                      <span>إرسال العرض</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
