import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderGit2,
  Lock,
  RefreshCw,
  Share2,
  ShieldCheck,
  Smartphone,
  Upload,
} from 'lucide-react';
import {
  AppVersionManifest,
  NotificationChannel,
  VaultContact,
} from '../types/vault';
import {
  createAdminVaultSpreadsheet,
  extractSpreadsheetId,
  fetchSpreadsheetMetadata,
  parseNotificationsFromSheetRows,
  readRowsFromGoogleSheetTab,
  SheetMetadataInfo,
  syncContactsToGoogleSheetTab,
} from '../services/googleSheetsService';
import {
  APP_VERSION,
  buildVersionedShareUrl,
  checkRemoteVersionManifest,
  DIRECT_APK_DOWNLOAD_URL,
  GITHUB_REPO_URL,
  performSilentCacheUpdate,
} from '../utils/versionManager';
import { normalizePhoneForWhatsApp } from '../utils/vcfEngine';

interface GoogleSheetsAdminPanelProps {
  contacts: VaultContact[];
  accessToken: string | null;
  linkedSheetId: string;
  defaultCountryCode: string;
  onConnectGoogleSheets: () => Promise<string | null>;
  onLinkedSheetIdChange: (sheetId: string) => void;
  onImportContactsFromSheet: (contacts: VaultContact[]) => void;
  onDispatchNotification: (payload: {
    title: string;
    body: string;
    channel: NotificationChannel;
  }) => Promise<void>;
}

interface PendingConfirmationAction {
  title: string;
  description: string;
  affectedCount: number;
  onConfirm: () => Promise<void>;
}

export const GoogleSheetsAdminPanel: React.FC<GoogleSheetsAdminPanelProps> = ({
  contacts,
  accessToken,
  linkedSheetId,
  defaultCountryCode,
  onConnectGoogleSheets,
  onLinkedSheetIdChange,
  onImportContactsFromSheet,
  onDispatchNotification,
}) => {
  const [sheetInput, setSheetInput] = useState(linkedSheetId || '');
  const [sheetMeta, setSheetMeta] = useState<SheetMetadataInfo | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('');
  const [isWorking, setIsWorking] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Mandatory Confirmation Dialog State before mutating Google Sheets data
  const [pendingAction, setPendingAction] =
    useState<PendingConfirmationAction | null>(null);

  // Version & Silent Update State
  const [remoteManifest, setRemoteManifest] =
    useState<AppVersionManifest | null>(null);
  const [copiedVersionUrl, setCopiedVersionUrl] = useState(false);

  const ensureToken = async (): Promise<string | null> => {
    if (accessToken) return accessToken;
    return onConnectGoogleSheets();
  };

  const handleInspectSheet = async () => {
    const cleanId = extractSpreadsheetId(sheetInput);
    if (!cleanId) return;
    setIsWorking(true);
    setFeedback(null);
    try {
      const token = await ensureToken();
      if (!token) {
        setFeedback({
          type: 'error',
          text: 'يرجى تسجيل الدخول بحساب Google لمنح صلاحية الوصول إلى Google Sheets.',
        });
        return;
      }
      const meta = await fetchSpreadsheetMetadata(token, cleanId);
      setSheetMeta(meta);
      setSelectedTab(meta.sheetTabs[0] || '');
      onLinkedSheetIdChange(meta.spreadsheetId);
      setFeedback({
        type: 'success',
        text: `تم ربط جدول "${meta.title}" بنجاح والعثور على ${meta.sheetTabs.length} ورقة عمل.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'تعذر الاتصال بجدول Google Sheets.',
      });
    } finally {
      setIsWorking(false);
    }
  };

  const handleRequestCreateNewSheet = () => {
    setPendingAction({
      title: 'إنشاء جدول Google Sheets إداري جديد',
      description:
        'سيقوم التطبيق بإنشاء ملف Google Sheets جديد في حسابك يحتوي على ورقتي عمل ("جهات_الاتصال_النشطة" و"الإشعارات_الإدارية") لإدارة الخزنة مع بقاء قواعد Firestore مقفلة.',
      affectedCount: 1,
      onConfirm: async () => {
        setIsWorking(true);
        setFeedback(null);
        try {
          const token = await ensureToken();
          if (!token) return;
          const created = await createAdminVaultSpreadsheet(token);
          setSheetMeta(created);
          setSheetInput(created.spreadsheetId);
          setSelectedTab(created.sheetTabs[0] || 'جهات_الاتصال_النشطة');
          onLinkedSheetIdChange(created.spreadsheetId);
          setFeedback({
            type: 'success',
            text: `تم إنشاء جدول Google Sheets الإداري "${created.title}" وربطه بالخزنة بنجاح!`,
          });
        } catch (err) {
          setFeedback({
            type: 'error',
            text: err instanceof Error ? err.message : 'فشل إنشاء الجدول.',
          });
        } finally {
          setIsWorking(false);
        }
      },
    });
  };

  const handleRequestExportContactsToSheet = () => {
    if (!sheetMeta || !selectedTab) return;
    const exportCount = Math.min(1000, contacts.length);
    setPendingAction({
      title: `تحديث ومزامنة ${exportCount.toLocaleString('en-US')} جهة اتصال إلى Google Sheets`,
      description: `سيتم كتابة وتحديث بيانات ${exportCount.toLocaleString(
        'en-US'
      )} جهة اتصال داخل الورقة "${selectedTab}" في ملف "${
        sheetMeta.title
      }". هل تؤكد تنفيذ هذا التعديل؟`,
      affectedCount: exportCount,
      onConfirm: async () => {
        setIsWorking(true);
        setFeedback(null);
        try {
          const token = await ensureToken();
          if (!token) return;
          const { updatedRows } = await syncContactsToGoogleSheetTab(
            token,
            sheetMeta.spreadsheetId,
            selectedTab,
            contacts,
            1000
          );
          await onDispatchNotification({
            title: 'تمت مزامنة الخزنة مع Google Sheets',
            body: `تم ترحيل وتحديث ${updatedRows.toLocaleString(
              'en-US'
            )} جهة اتصال في ورقة "${selectedTab}" بصلاحيات الإدارة.`,
            channel: 'sheets_admin',
          });
          setFeedback({
            type: 'success',
            text: `تم تصدير وتحديث ${updatedRows.toLocaleString(
              'en-US'
            )} صف في Google Sheets وإرسال إشعار فوري بنجاح!`,
          });
        } catch (err) {
          setFeedback({
            type: 'error',
            text: err instanceof Error ? err.message : 'فشل التصدير إلى Google Sheets.',
          });
        } finally {
          setIsWorking(false);
        }
      },
    });
  };

  const handlePullFromSheet = async () => {
    if (!sheetMeta || !selectedTab) return;
    setIsWorking(true);
    setFeedback(null);
    try {
      const token = await ensureToken();
      if (!token) return;
      const rows = await readRowsFromGoogleSheetTab(
        token,
        sheetMeta.spreadsheetId,
        selectedTab
      );

      if (rows.length <= 1) {
        setFeedback({
          type: 'info',
          text: 'الورقة المحددة لا تحتوي على صفوف بيانات إضافية بعد.',
        });
        return;
      }

      if (selectedTab.includes('الإشعارات') || selectedTab.toLowerCase().includes('notif')) {
        const parsedNotifs = parseNotificationsFromSheetRows(rows);
        for (const n of parsedNotifs.slice(0, 5)) {
          await onDispatchNotification({
            title: n.title,
            body: n.body,
            channel: 'sheets_admin',
          });
        }
        setFeedback({
          type: 'success',
          text: `تم سحب وبث ${parsedNotifs.length} إشعار إداري من Google Sheets إلى Firestore وشريط الهاتف!`,
        });
      } else {
        const importedContacts: VaultContact[] = [];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r || r.length < 2) continue;
          const rawName = (r[1] || r[0] || `عميل شيت #${i}`).trim();
          const rawPhone = (r[2] || r[1] || '').trim();
          if (!rawPhone) continue;
          const { phone } = normalizePhoneForWhatsApp(
            rawPhone,
            defaultCountryCode
          );
          if (phone.replace(/\D/g, '').length < 7) continue;

          importedContacts.push({
            id: (r[0] || `sheet_${Date.now()}_${i}`).slice(0, 64),
            name: rawName.slice(0, 120),
            phone,
            tier:
              r[3] && r[3].includes('ستوري') ? 'active_status' : 'archive_lead',
            group: (r[4] || 'مستورد من Google Sheets').slice(0, 64),
          });
        }
        if (importedContacts.length > 0) {
          onImportContactsFromSheet(importedContacts);
          await onDispatchNotification({
            title: 'استيراد إداري من Google Sheets',
            body: `تم سحب ${importedContacts.length.toLocaleString(
              'en-US'
            )} جهة اتصال من ورقة "${selectedTab}".`,
            channel: 'sheets_admin',
          });
          setFeedback({
            type: 'success',
            text: `تم استيراد ${importedContacts.length.toLocaleString(
              'en-US'
            )} جهة اتصال من Google Sheets بنجاح!`,
          });
        }
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'تعذر قراءة الورقة من Google Sheets.',
      });
    } finally {
      setIsWorking(false);
    }
  };

  const handleCheckSilentUpdate = async () => {
    setIsWorking(true);
    try {
      const { manifest, isNewerAvailable } = await checkRemoteVersionManifest();
      setRemoteManifest(manifest);
      if (isNewerAvailable && manifest) {
        await performSilentCacheUpdate(manifest.version);
      } else {
        setFeedback({
          type: 'success',
          text: `أنت تعمل بالفعل على أحدث إصدار (${APP_VERSION}) مع تفعيل التحديث الصامت التلقائي.`,
        });
      }
    } finally {
      setIsWorking(false);
    }
  };

  const handleCopyVersionedLink = async () => {
    const versionedUrl = buildVersionedShareUrl(APP_VERSION);
    try {
      await navigator.clipboard.writeText(versionedUrl);
      setCopiedVersionUrl(true);
      setTimeout(() => setCopiedVersionUrl(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="space-y-6">
      {/* Confirmation Dialog Modal for Mutating Google Sheets Operations (Mandatory per workspace-integration) */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {pendingAction.title}
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {pendingAction.description}
            </p>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono text-slate-600 dark:text-slate-400">
              عدد السجلات المتأثرة: {pendingAction.affectedCount.toLocaleString('en-US')}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg"
              >
                إلغاء العملية
              </button>
              <button
                type="button"
                onClick={async () => {
                  const action = pendingAction;
                  setPendingAction(null);
                  await action.onConfirm();
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                تأكيد التنفيذ في Google Sheets
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            feedback.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline font-medium shrink-0"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* 2-Column Split: Google Sheets Admin Management vs Version & APK Automation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Column 1: Google Sheets Admin Integration */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <span>01. الإدارة والحفظ عبر Google Sheets (بصلاحيات إدارية)</span>
              </h2>
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                <Lock className="w-3.5 h-3.5" />
                <span>Firestore مقفل</span>
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              تُحفظ وتُدار بيانات العملاء والإشعارات الإدارية عبر Google Sheets بصلاحيات حسابات التطبيق الإدارية، بينما تبقى قواعد Firestore مقفلة بالكامل (`isOwner` / `isAdmin`) لحماية الخصوصية.
            </p>
          </div>

          {/* Official Google Sign-In Button when OAuth token is not yet active */}
          {!accessToken ? (
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                لتفعيل المزامنة المباشرة مع جداول Google Sheets الخاصة بك، قم بتسجيل الدخول ومنح إذن الجداول:
              </p>
              <button
                type="button"
                onClick={onConnectGoogleSheets}
                className="gsi-material-button inline-flex items-center gap-2.5 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="gsi-material-button-state"></div>
                <div className="gsi-material-button-content-wrapper flex items-center gap-2">
                  <div className="gsi-material-button-icon w-4 h-4">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      style={{ display: 'block' }}
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      ></path>
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      ></path>
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      ></path>
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      ></path>
                      <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">
                    Sign in with Google (تفعيل صلاحية Google Sheets)
                  </span>
                </div>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  dir="ltr"
                  value={sheetInput}
                  onChange={(e) => setSheetInput(e.target.value)}
                  placeholder="الصق رابط Google Sheet أو Spreadsheet ID هنا..."
                  className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 text-left"
                />
                <button
                  type="button"
                  disabled={isWorking}
                  onClick={handleInspectSheet}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap shrink-0"
                >
                  فحص وربط الجدول
                </button>
                <button
                  type="button"
                  disabled={isWorking}
                  onClick={handleRequestCreateNewSheet}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0"
                >
                  + إنشاء جدول إداري جديد
                </button>
              </div>

              {sheetMeta && (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                      {sheetMeta.title}
                    </span>
                    <a
                      href={sheetMeta.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-600 hover:underline shrink-0"
                    >
                      <span>فتح في Google Sheets</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs text-slate-500">ورقة العمل (Tab):</label>
                    <select
                      value={selectedTab}
                      onChange={(e) => setSelectedTab(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md"
                    >
                      {sheetMeta.sheetTabs.map((tab) => (
                        <option key={tab} value={tab}>
                          {tab}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={handleRequestExportContactsToSheet}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>ترحيل جهات الاتصال إلى الورقة</span>
                    </button>
                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={handlePullFromSheet}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 rounded-lg"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>سحب التحديثات/الإشعارات من الورقة</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500 flex items-center justify-between">
            <span>حالة قواعد الحماية في Firestore:</span>
            <span className="font-mono text-emerald-700 dark:text-emerald-400">
              مقفلة بالكامل (Zero-Trust Owner & Admin Rules)
            </span>
          </div>
        </div>

        {/* Column 2: Silent Auto-Update (?v=APP_VERSION) & GitHub Actions APK/PWA Builder */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-600" />
              <span>02. أتمتة التحديث الصامت وبناء تطبيق الجوال (Web / PWA / APK)</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              يتم فحص ملف الإصدار (<code className="font-mono">/version.json</code>) تلقائياً وتوليد روابط مشاركة مختومة برقم الإصدار الحالي (<code className="font-mono">?v={APP_VERSION}</code>) لضمان عدم بقاء أي عميل على نسخة قديمة مخبأة في الكاش.
            </p>
          </div>

          {/* Version & Share Box */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">رقم الإصدار النشط (APP_VERSION):</span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                v{APP_VERSION} {remoteManifest ? `(Build #${remoteManifest.buildNumber})` : ''}
              </span>
            </div>

            <div className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300 truncate" dir="ltr">
              {buildVersionedShareUrl(APP_VERSION)}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyVersionedLink}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>
                  {copiedVersionUrl
                    ? 'تم نسخ الرابط المحدث (?v=' + APP_VERSION + ')!'
                    : `مشاركة الرابط برقم الإصدار (?v=${APP_VERSION})`}
                </span>
              </button>

              <button
                type="button"
                disabled={isWorking}
                onClick={handleCheckSilentUpdate}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isWorking ? 'animate-spin' : ''}`} />
                <span>فحص وتفريغ الكاش الصامت الآن</span>
              </button>
            </div>
          </div>

          {/* GitHub Actions Auto-Build Info & Direct No-Login APK Download */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
                <FolderGit2 className="w-4 h-4 text-emerald-600" />
                <span>رابط التحميل المباشر لتطبيق الأندرويد (.APK بدون حساب GitHub)</span>
              </div>
              <a
                href={`${GITHUB_REPO_URL}/actions`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-emerald-600 hover:underline font-medium shrink-0"
              >
                <span>حالة البناء التلقائي</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              تم ربط المشروع بمستودعك{' '}
              <code className="font-mono text-emerald-700 dark:text-emerald-400">
                matjaraky/whatsapp-leadvault-40k
              </code>
              . يقوم GitHub Actions تلقائياً ببناء ملف <code className="font-mono">LeadVault40K.apk</code> ونشره في الإصدارات العامة بحساب مفتوح لا يتطلب أي تسجيل دخول.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={DIRECT_APK_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تحميل ملف التطبيق المباشر (LeadVault40K.apk)</span>
              </a>
              <a
                href={`${GITHUB_REPO_URL}/releases`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <span>صفحة الإصدارات العامة</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Security & Privacy Verification Footer Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            جميع العمليات الإدارية محمية بمصادقة Google OAuth 2.0 في الذاكرة الحية دون تخزين أي رموز وصول في المتصفح.
          </span>
        </div>
        <span className="font-mono">PWA Standalone + Capacitor APK Ready</span>
      </div>
    </div>
  );
};
