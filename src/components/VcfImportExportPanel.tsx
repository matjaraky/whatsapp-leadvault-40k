import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FolderInput,
  Layers,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import { ImportSummary, VaultContact } from '../types/vault';
import {
  exportContactsToVcf,
  generateSyntheticLeadsBatch,
   getWaMeDigits,
  parseContactsFileContent,
} from '../utils/vcfEngine';

interface VcfImportExportPanelProps {
  contacts: VaultContact[];
  defaultCountryCode: string;
  onCountryCodeChange: (code: string) => void;
  onImportContacts: (newContacts: VaultContact[], replaceExisting: boolean) => void;
  onRotateBatchToActiveStatus: (batchIndex: number, batchSize: number) => void;
}

export const VcfImportExportPanel: React.FC<VcfImportExportPanelProps> = ({
  contacts,
  defaultCountryCode,
  onCountryCodeChange,
  onImportContacts,
  onRotateBatchToActiveStatus,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [initialActiveLimit, setInitialActiveLimit] = useState<number>(1000);
  const [defaultGroupLabel, setDefaultGroupLabel] = useState<string>('عملاء واتساب للأعمال');
  const [replaceExisting, setReplaceExisting] = useState<boolean>(false);
  const [lastSummary, setLastSummary] = useState<ImportSummary | null>(null);
  const [batchSizeForVcf, setBatchSizeForVcf] = useState<number>(1000);
  const [vcfPrefixTag, setVcfPrefixTag] = useState<string>('[ستوري نشط]');
  const [isParsing, setIsParsing] = useState<boolean>(false);

  const activeStatusContacts = contacts.filter((c) => c.tier === 'active_status');
  const archiveContacts = contacts.filter((c) => c.tier === 'archive_lead');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    try {
      const text = await file.text();
      const existingPhones = replaceExisting
        ? new Set<string>()
        : new Set(contacts.map((c) => getWaMeDigits(c.phone)));

      const { contacts: parsedContacts, summary } = parseContactsFileContent(
        text,
        file.name,
        {
          defaultCountryCode,
          initialActiveStatusLimit: initialActiveLimit,
          defaultGroupLabel,
          existingPhones,
        }
      );

      setLastSummary(summary);
      if (parsedContacts.length > 0) {
        onImportContacts(parsedContacts, replaceExisting);
      }
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGenerate40KSimulation = (count: number) => {
    setIsParsing(true);
    setTimeout(() => {
      const generated = generateSyntheticLeadsBatch(
        count,
        defaultCountryCode,
        initialActiveLimit
      );
      setLastSummary({
        totalParsed: count,
        validImported: generated.length,
        duplicatesRemoved: 0,
        normalizedCount: count,
        activeStatusAssigned: Math.min(count, initialActiveLimit),
        archiveAssigned: Math.max(0, count - initialActiveLimit),
      });
      onImportContacts(generated, true);
      setIsParsing(false);
    }, 50);
  };

  const triggerVcfDownload = (subset: VaultContact[], filename: string) => {
    if (subset.length === 0) return;
    const vcfString = exportContactsToVcf(subset, vcfPrefixTag.trim());
    const blob = new Blob([vcfString], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalRotationBatches = Math.ceil(contacts.length / batchSizeForVcf);

  return (
    <div className="space-y-6">
      {/* Top 2-Column Split: Import VCF/CSV vs Export Lightweight Status VCF */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Column 1: Bulk VCF / CSV Importer */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              01. استيراد وتنظيف الـ 40,000 جهة اتصال (VCF / CSV)
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              صدّر جهات اتصالك من تطبيق "جهات الاتصال" في جوالك بصيغة{' '}
              <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                .vcf
              </code>{' '}
              أو ملف إكسل{' '}
              <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                .csv
              </code>{' '}
              وارفعه هنا. سيقوم المحرك بفك ترميز الأسماء العربية، إزالة الأرقام المكررة، وفرزها تلقائياً.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                مفتاح الدولة الافتراضي
              </label>
              <input
                type="text"
                dir="ltr"
                value={defaultCountryCode}
                onChange={(e) => onCountryCodeChange(e.target.value)}
                placeholder="+967"
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 text-left"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                حجم قائمة الستوري النشطة
              </label>
              <input
                type="number"
                min={0}
                max={10000}
                step={100}
                value={initialActiveLimit}
                onChange={(e) => setInitialActiveLimit(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                اسم المجموعة الافتراضي
              </label>
              <input
                type="text"
                value={defaultGroupLabel}
                onChange={(e) => setDefaultGroupLabel(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>استبدال القائمة الحالية بالكامل بدلاً من الدمج معها</span>
          </label>

          <div className="space-y-3 pt-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".vcf,.csv,.txt,.tsv"
              onChange={handleFileUpload}
              className="hidden"
            />

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={isParsing}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>{isParsing ? 'جاري الفحص والفرز...' : 'رفع ملف جهات الاتصال (.VCF أو .CSV)'}</span>
              </button>

              <button
                type="button"
                disabled={isParsing}
                onClick={() => handleGenerate40KSimulation(40500)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>محاكاة فورية لـ 40,500 جهة اتصال</span>
              </button>
            </div>

            {lastSummary && (
              <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 rounded-lg text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>تمت معالجة وتنظيف الملف بنجاح!</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 tabular-nums">
                  تم استيراد{' '}
                  <strong>{lastSummary.validImported.toLocaleString('en-US')}</strong> رقم صافي ·
                  حذف <strong>{lastSummary.duplicatesRemoved.toLocaleString('en-US')}</strong> رقم
                  مكرر · تخصيص{' '}
                  <strong>{lastSummary.activeStatusAssigned.toLocaleString('en-US')}</strong> للستوري
                  النشط و{' '}
                  <strong>{lastSummary.archiveAssigned.toLocaleString('en-US')}</strong> للأرشيف
                  السحابي.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Active Status VCF Exporter & Phone Lag Eliminator */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              02. مُولّد ملف "قائمة الستوري النشطة" لتسريع الهاتف
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              السبب الحقيقي لتعليق واتساب للأعمال عند إعادة التوجيه هو وجود 40,000 رقم في ذاكرة الهاتف. بعد حفظ الـ 40,000 رقم هنا في السحابة، قم بتحميل ملف{' '}
              <strong>قائمة الستوري النشطة فقط</strong> لإبقائه في الهاتف، وستختفي مشكلة التعليق نهائياً!
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                بادئة تمييز الأسماء في الهاتف (اختياري)
              </label>
              <input
                type="text"
                value={vcfPrefixTag}
                onChange={(e) => setVcfPrefixTag(e.target.value)}
                placeholder="[ستوري نشط]"
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                حجم كل دفعة عند التقسيم (Batch Size)
              </label>
              <select
                value={batchSizeForVcf}
                onChange={(e) => setBatchSizeForVcf(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              >
                <option value={500}>500 جهة اتصال لكل ملف VCF</option>
                <option value={1000}>1,000 جهة اتصال لكل ملف VCF (موصى به)</option>
                <option value={2000}>2,000 جهة اتصال لكل ملف VCF</option>
                <option value={5000}>5,000 جهة اتصال لكل ملف VCF</option>
              </select>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">
                أرقام قائمة الستوري النشطة الجاهزة للهاتف:
              </span>
              <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {activeStatusContacts.length.toLocaleString('en-US')} رقم
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">
                أرقام الأرشيف السحابي (تُراسل بالروابط بدون إبطاء الهاتف):
              </span>
              <span className="font-mono font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                {archiveContacts.length.toLocaleString('en-US')} رقم
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={activeStatusContacts.length === 0}
              onClick={() =>
                triggerVcfDownload(
                  activeStatusContacts,
                  `whatsapp_active_status_${activeStatusContacts.length}.vcf`
                )
              }
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>
                تنزيل ملف الستوري النشط ({activeStatusContacts.length.toLocaleString('en-US')} رقم)
              </span>
            </button>

            <button
              type="button"
              disabled={contacts.length === 0}
              onClick={() =>
                triggerVcfDownload(
                  contacts,
                  `full_vault_backup_${contacts.length}.vcf`
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>نسخة احتياطية كاملة (.VCF)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Batch Rotation & VCF Splitter Grid */}
      {contacts.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                <span>03. مُقسّم ومُدوّر دفعات الستوري (Status Batch Rotation)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                قسّم الـ {contacts.length.toLocaleString('en-US')} عميل إلى دفعات صغيرة ({batchSizeForVcf.toLocaleString('en-US')} رقم لكل دفعة). يمكنك تفعيل أي دفعة لتكون هي "قائمة الستوري النشطة" أو تنزيل ملف VCF المستقل الخاص بها.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              إجمالي الدفعات: {totalRotationBatches.toLocaleString('en-US')} دفعة
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-80 overflow-y-auto pr-1">
            {Array.from({ length: totalRotationBatches }).map((_, batchIdx) => {
              const start = batchIdx * batchSizeForVcf;
              const end = Math.min(contacts.length, start + batchSizeForVcf);
              const slice = contacts.slice(start, end);
              const activeInSlice = slice.filter((c) => c.tier === 'active_status').length;
              const isMostlyActive = activeInSlice === slice.length && slice.length > 0;

              return (
                <div
                  key={batchIdx}
                  className={`p-3.5 rounded-lg border transition-colors flex flex-col justify-between gap-3 ${
                    isMostlyActive
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/25 border-emerald-300 dark:border-emerald-800'
                      : 'bg-slate-50/70 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-slate-100">
                      <span>الدفعة #{batchIdx + 1}</span>
                      <span className="font-mono text-slate-500 tabular-nums">
                        {(start + 1).toLocaleString('en-US')} – {end.toLocaleString('en-US')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      نشط بالستوري: {activeInSlice.toLocaleString('en-US')} /{' '}
                      {slice.length.toLocaleString('en-US')}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onRotateBatchToActiveStatus(batchIdx, batchSizeForVcf)}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-md hover:bg-emerald-50 transition-colors whitespace-nowrap shrink-0"
                    >
                      <FolderInput className="w-3 h-3" />
                      <span>تعيين كستوري نشط</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        triggerVcfDownload(
                          slice,
                          `batch_${batchIdx + 1}_${start + 1}_to_${end}.vcf`
                        )
                      }
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                      title="تنزيل ملف VCF لهذه الدفعة فقط"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Practical 3-Step Guide to Eliminating WhatsApp Lag */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            كيف تنهي تعليق واتساب للأعمال نهائياً في 3 خطوات عملية؟
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1">
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              1. ارفع الـ 40,000 رقم إلى الخزنة السحابية
            </p>
            <p>
              قم بتصدير جهات اتصالك من الهاتف إلى ملف VCF وارفعه هنا، ثم اضغط "مزامنة السحابة" ليتم حفظ الـ 40 ألف عميل بأمان في حسابك.
            </p>
          </div>
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1">
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              2. احتفظ فقط بقائمة الستوري النشطة في الهاتف
            </p>
            <p>
              فرّغ سجل الهاتف من الأرقام الخاملة، واستورد فقط ملف "قائمة الستوري النشطة" (مثلاً 1,000 عميل متفاعل). سيعود واتساب للأعمال سريعاً كالبرق عند مشاركة الحالات!
            </p>
          </div>
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1">
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              3. راسل وأعد التوجيه للـ 40,000 من داخل التطبيق
            </p>
            <p>
              عند رغبتك في إعادة إرسال رسالة أو عرض لأي عميل في الأرشيف، افتح "استوديو الإرسال السريع" واضغط إرسال ليفتح واتساب مباشرة بالرسالة الجاهزة دون تعليق.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
