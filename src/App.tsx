/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  LogIn,
  LogOut,
  Moon,
  PhoneCall,
  RefreshCw,
  Send,
  Share2,
  Sun,
} from 'lucide-react';
import {
  getAccessToken,
  initAuth,
  logOutUser,
  signInWithGoogle,
  testFirestoreConnection,
} from './firebase';
import {
  ContactTier,
  MessageTemplateItem,
  NotificationChannel,
  VaultContact,
  VaultNotificationItem,
} from './types/vault';
import {
  buildWhatsAppDirectUrl,
  generateSyntheticLeadsBatch,
  normalizePhoneForWhatsApp,
} from './utils/vcfEngine';
import {
  CONTACTS_PER_CHUNK,
  deleteNotificationFromCloud,
  deleteTemplateFromCloud,
  dispatchVaultNotification,
  loadVaultFromCloud,
  markNotificationReadInCloud,
  saveTemplateToCloud,
  subscribeToVaultNotifications,
  syncAllContactsToCloud,
} from './services/cloudVaultService';
import {
  APP_VERSION,
  buildVersionedShareUrl,
  checkRemoteVersionManifest,
  enforceVersionQueryParam,
  performSilentCacheUpdate,
} from './utils/versionManager';
import { VirtualizedContactGrid } from './components/VirtualizedContactGrid';
import { VcfImportExportPanel } from './components/VcfImportExportPanel';
import { QuickForwardStudio } from './components/QuickForwardStudio';
import { GoogleSheetsAdminPanel } from './components/GoogleSheetsAdminPanel';
import { NotificationCenterDrawer } from './components/NotificationCenterDrawer';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';

type ActiveTab =
  | 'vault'
  | 'forward_studio'
  | 'vcf_manager'
  | 'direct_dialer'
  | 'sheets_admin';

const DEFAULT_TEMPLATES: MessageTemplateItem[] = [
  {
    id: 'tpl_offer_1',
    ownerId: 'local',
    title: 'عرض خاص للعملاء',
    category: 'عروض',
    content:
      'أهلاً بك يا {الاسم}، يسعدنا إبلاغك بتوفر الدفعة الجديدة من منتجاتنا بأسعار خاصة لعملائنا المميزين. هل ترغب في إرسال الكتالوج؟',
    usageCount: 0,
  },
  {
    id: 'tpl_followup_2',
    ownerId: 'local',
    title: 'متابعة استفسار سابق',
    category: 'متابعة',
    content:
      'مرحباً {الاسم}، تواصلت معنا سابقاً بخصوص عروضنا. حبيت أبلغك أن العرض الحالي متاح حتى نهاية الأسبوع.',
    usageCount: 0,
  },
  {
    id: 'tpl_status_invite',
    ownerId: 'local',
    title: 'تنبيه لمشاهدة الحالات (الستوري)',
    category: 'ستوري',
    content:
      'حياك الله يا {الاسم}، قمنا بنشر عروض وتصفيات يومية حصرية في حالات الواتساب اليوم، يسعدنا اطلاعك عليها!',
    usageCount: 0,
  },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [oauthAccessToken, setOauthAccessToken] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('vault');
  const [darkMode, setDarkMode] = useState(false);

  // Core Vault State
  const [contacts, setContacts] = useState<VaultContact[]>(() =>
    generateSyntheticLeadsBatch(2500, '+967', 500)
  );
  const [templates, setTemplates] = useState<MessageTemplateItem[]>(DEFAULT_TEMPLATES);
  const [activeTemplateId, setActiveTemplateId] = useState<string>(DEFAULT_TEMPLATES[0].id);
  const [customMessage, setCustomMessage] = useState<string>(DEFAULT_TEMPLATES[0].content);
  const [defaultCountryCode, setDefaultCountryCode] = useState<string>('+967');
  const [linkedSheetId, setLinkedSheetId] = useState<string>('');
  const [useNativeProtocol, setUseNativeProtocol] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Real-time Notifications State
  const [notifications, setNotifications] = useState<VaultNotificationItem[]>([
    {
      id: 'local_welcome_1',
      ownerId: 'local',
      title: `تم تشغيل الإصدار v${APP_VERSION} بنجاح`,
      body: 'مزامنة الإشعارات الفورية والتحديث الصامت عبر (?v=APP_VERSION) وإدارة Google Sheets جاهزة للعمل.',
      channel: 'version_update',
      read: false,
      source: 'system',
      createdAtIso: new Date().toISOString(),
    },
  ]);
  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState(false);

  // Cloud Sync State
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [copiedShareLink, setCopiedShareLink] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Direct Dialer State
  const [directPhoneInput, setDirectPhoneInput] = useState<string>('');
  const [directMessageInput, setDirectMessageInput] = useState<string>('');
  const [bulkPasteNumbers, setBulkPasteNumbers] = useState<string>('');

  // Enforce `?v=APP_VERSION` in URL & check `/version.json` for silent auto-updates
  useEffect(() => {
    enforceVersionQueryParam(APP_VERSION);

    const runSilentVersionCheck = async () => {
      const { manifest, isNewerAvailable } = await checkRemoteVersionManifest();
      if (isNewerAvailable && manifest?.version) {
        await performSilentCacheUpdate(manifest.version);
      }
    };

    runSilentVersionCheck();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        runSilentVersionCheck();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    testFirestoreConnection();
    const unsub = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        if (token) setOauthAccessToken(token);
        setIsAuthReady(true);
      },
      () => {
        setUser(null);
        setOauthAccessToken(null);
        setIsAuthReady(true);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Load user's cloud vault & attach real-time notifications listener upon sign-in
  useEffect(() => {
    if (!isAuthReady || !user) return;
    let cancelled = false;

    async function fetchCloudVault() {
      setIsSyncing(true);
      try {
        const { meta, contacts: cloudContacts, templates: cloudTemplates } =
          await loadVaultFromCloud(user!.uid);
        if (cancelled) return;

        if (meta) {
          setDefaultCountryCode(meta.defaultCountryCode || '+967');
          if (meta.linkedSheetId) setLinkedSheetId(meta.linkedSheetId);
        }

        if (meta && cloudContacts.length > 0) {
          setContacts(cloudContacts);
          setHasUnsavedChanges(false);
          setStatusBanner({
            type: 'success',
            message: `تم استرجاع ${cloudContacts.length.toLocaleString('en-US')} جهة اتصال من خزنتك السحابية بنجاح.`,
          });
        } else {
          setStatusBanner({
            type: 'info',
            message:
              'تم تسجيل الدخول! يمكنك الآن رفع ملف جهات اتصالك (VCF) والضغط على "مزامنة السحابة" أو ربط جدول Google Sheets.',
          });
        }

        if (cloudTemplates.length > 0) {
          setTemplates(cloudTemplates);
          setActiveTemplateId(cloudTemplates[0].id);
          setCustomMessage(cloudTemplates[0].content);
        }
      } catch (err) {
        if (!cancelled) {
          setStatusBanner({
            type: 'error',
            message:
              err instanceof Error
                ? `تعذر تحميل البيانات السحابية: ${err.message}`
                : 'حدث خطأ أثناء الاتصال بالسحابة.',
          });
        }
      } finally {
        if (!cancelled) setIsSyncing(false);
      }
    }

    fetchCloudVault();

    const unsubNotifications = subscribeToVaultNotifications(
      user.uid,
      (cloudNotifs) => {
        if (!cancelled && cloudNotifs.length > 0) {
          setNotifications(cloudNotifs);
        }
      },
      (newAlert) => {
        if (!cancelled) {
          setStatusBanner({
            type: 'info',
            message: `إشعار فوري جديد: ${newAlert.title} — ${newAlert.body}`,
          });
        }
      }
    );

    return () => {
      cancelled = true;
      unsubNotifications();
    };
  }, [isAuthReady, user]);

  // Derived Statistics
  const stats = useMemo(() => {
    let activeStatus = 0;
    let archiveLeads = 0;
    for (let i = 0; i < contacts.length; i++) {
      if (contacts[i].tier === 'active_status') activeStatus++;
      else archiveLeads++;
    }
    const chunkCount = Math.ceil(contacts.length / CONTACTS_PER_CHUNK);
    return {
      total: contacts.length,
      activeStatus,
      archiveLeads,
      chunkCount,
    };
  }, [contacts]);

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  // Handlers
  const handleConnectGoogleAndSheets = async (): Promise<string | null> => {
    try {
      const result = await signInWithGoogle();
      setUser(result.user);
      setOauthAccessToken(result.accessToken);
      return result.accessToken;
    } catch (err) {
      setStatusBanner({
        type: 'error',
        message:
          err instanceof Error
            ? `تعذر تسجيل الدخول: ${err.message}`
            : 'تم إلغاء نافذة تسجيل الدخول.',
      });
      return null;
    }
  };

  const handleCloudSyncOrSignIn = async () => {
    if (!user) {
      await handleConnectGoogleAndSheets();
      return;
    }

    setIsSyncing(true);
    setSyncProgress({ done: 0, total: Math.max(1, stats.chunkCount) });
    try {
      await syncAllContactsToCloud(
        user.uid,
        contacts,
        defaultCountryCode,
        (done, total) => setSyncProgress({ done, total }),
        linkedSheetId
      );
      await dispatchVaultNotification(user.uid, {
        title: 'اكتملت مزامنة الخزنة السحابية',
        body: `تم حفظ ${contacts.length.toLocaleString('en-US')} جهة اتصال في ${stats.chunkCount} حزمة سحابية بنجاح.`,
        channel: 'sync_alert',
        source: 'firestore_realtime',
      });
      setHasUnsavedChanges(false);
      setStatusBanner({
        type: 'success',
        message: `تم حفظ ومزامنة ${contacts.length.toLocaleString('en-US')} جهة اتصال في السحابة عبر ${stats.chunkCount} حزمة مضغوطة بنجاح!`,
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        message:
          err instanceof Error
            ? `خطأ أثناء المزامنة السحابية: ${err.message}`
            : 'فشلت عملية المزامنة السحابية.',
      });
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleDispatchNotification = async (payload: {
    title: string;
    body: string;
    channel: NotificationChannel;
  }) => {
    if (user) {
      await dispatchVaultNotification(user.uid, {
        ...payload,
        source: 'firestore_realtime',
      });
    } else {
      const localItem: VaultNotificationItem = {
        id: `local_${Date.now()}`,
        ownerId: 'local',
        title: payload.title,
        body: payload.body,
        channel: payload.channel,
        read: false,
        source: 'local',
        createdAtIso: new Date().toISOString(),
      };
      setNotifications((prev) => [localItem, ...prev]);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    if (user && !id.startsWith('local_')) {
      await markNotificationReadInCloud(user.uid, id);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (user && !id.startsWith('local_')) {
      await deleteNotificationFromCloud(user.uid, id);
    }
  };

  const handleShareVersionedLink = async () => {
    const shareUrl = buildVersionedShareUrl(APP_VERSION);
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'خزنة العملاء ومُسرّع واتساب للأعمال 40K',
          text: `الإصدار المحدث v${APP_VERSION}`,
          url: shareUrl,
        });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2000);
    } catch {
      // Ignore user cancellation
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllFiltered = (filteredIds: string[], select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of filteredIds) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const handleChangeTier = (ids: string[], newTier: ContactTier) => {
    const idSet = new Set(ids);
    setContacts((prev) =>
      prev.map((c) => (idSet.has(c.id) ? { ...c, tier: newTier } : c))
    );
    setHasUnsavedChanges(true);
    setSelectedIds(new Set());
    setStatusBanner({
      type: 'success',
      message: `تم تحديث تصنيف ${ids.length.toLocaleString('en-US')} جهة اتصال إلى "${
        newTier === 'active_status' ? 'قائمة الستوري النشطة' : 'أرشيف العملاء المحتملين'
      }".`,
    });
  };

  const handleDeleteContacts = (ids: string[]) => {
    const idSet = new Set(ids);
    setContacts((prev) => prev.filter((c) => !idSet.has(c.id)));
    setSelectedIds(new Set());
    setHasUnsavedChanges(true);
    setStatusBanner({
      type: 'info',
      message: `تم إزالة ${ids.length.toLocaleString('en-US')} رقم من القائمة الحالية.`,
    });
  };

  const handleMarkContacted = (id: string) => {
    const nowIso = new Date().toISOString();
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, lastContactedAt: nowIso } : c))
    );
  };

  const handleAddSingleContact = (newContact: Omit<VaultContact, 'id'>) => {
    const { phone } = normalizePhoneForWhatsApp(
      newContact.phone,
      defaultCountryCode
    );
    const created: VaultContact = {
      ...newContact,
      id: `c_${Date.now().toString(36)}`,
      phone,
    };
    setContacts((prev) => [created, ...prev]);
    setHasUnsavedChanges(true);
  };

  const handleImportContacts = (
    imported: VaultContact[],
    replaceExisting: boolean
  ) => {
    setContacts((prev) => (replaceExisting ? imported : [...imported, ...prev]));
    setSelectedIds(new Set());
    setHasUnsavedChanges(true);
    setStatusBanner({
      type: 'success',
      message: `تم استيراد ${imported.length.toLocaleString('en-US')} جهة اتصال بنجاح! اضغط على "مزامنة السحابة" لحفظها.`,
    });
  };

  const handleRotateBatchToActiveStatus = (batchIndex: number, batchSize: number) => {
    const start = batchIndex * batchSize;
    const end = start + batchSize;
    setContacts((prev) =>
      prev.map((c, idx) => ({
        ...c,
        tier: idx >= start && idx < end ? 'active_status' : 'archive_lead',
      }))
    );
    setHasUnsavedChanges(true);
    handleDispatchNotification({
      title: `تم تفعيل الدفعة #${batchIndex + 1} للستوري`,
      body: `تم تحويل الأرقام من ${(start + 1).toLocaleString('en-US')} إلى ${Math.min(
        contacts.length,
        end
      ).toLocaleString('en-US')} إلى قائمة الستوري النشطة.`,
      channel: 'status_rotation',
    });
  };

  const handleSaveTemplate = async (
    title: string,
    category: string,
    content: string
  ) => {
    const newTpl: MessageTemplateItem = {
      id: `tpl_${Date.now().toString(36)}`,
      ownerId: user?.uid || 'local',
      title,
      category,
      content,
      usageCount: 0,
    };
    setTemplates((prev) => [newTpl, ...prev]);
    setActiveTemplateId(newTpl.id);
    if (user) {
      try {
        await saveTemplateToCloud(user.uid, newTpl, true);
      } catch {
        // Handled by handleFirestoreError
      }
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    if (user) {
      try {
        await deleteTemplateFromCloud(user.uid, id);
      } catch {
        // Handled
      }
    }
  };

  const parsedBulkNumbers = useMemo(() => {
    if (!bulkPasteNumbers.trim()) return [];
    const rawLines = bulkPasteNumbers
      .split(/[\r\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const results: { raw: string; normalized: string }[] = [];
    for (const item of rawLines) {
      const { phone } = normalizePhoneForWhatsApp(item, defaultCountryCode);
      if (phone.replace(/\D/g, '').length >= 7) {
        results.push({ raw: item, normalized: phone });
      }
    }
    return results;
  }, [bulkPasteNumbers, defaultCountryCode]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <OfflineIndicator />

      <NotificationCenterDrawer
        isOpen={isNotifDrawerOpen}
        notifications={notifications}
        onClose={() => setIsNotifDrawerOpen(false)}
        onDispatchNotification={handleDispatchNotification}
        onMarkRead={handleMarkNotificationRead}
        onDelete={handleDeleteNotification}
      />

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href={`/?v=${APP_VERSION}`}
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('vault');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          خزنة واتساب 40K
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <button
            type="button"
            onClick={() => setActiveTab('vault')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'vault'
                ? 'text-emerald-600 dark:text-emerald-400 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            خزنة العملاء
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('forward_studio')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'forward_studio'
                ? 'text-emerald-600 dark:text-emerald-400 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            الإرسال السريع
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('vcf_manager')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'vcf_manager'
                ? 'text-emerald-600 dark:text-emerald-400 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            فرز الستوري
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('direct_dialer')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'direct_dialer'
                ? 'text-emerald-600 dark:text-emerald-400 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            مراسلة بدون حفظ
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sheets_admin')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'sheets_admin'
                ? 'text-emerald-600 dark:text-emerald-400 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            قوقل شيت والتطبيق
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            disabled={isSyncing}
            onClick={handleCloudSyncOrSignIn}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>
                  {syncProgress
                    ? `مزامنة ${syncProgress.done}/${syncProgress.total}`
                    : 'جاري المزامنة...'}
                </span>
              </>
            ) : user ? (
              <>
                <CloudUpload className="w-3.5 h-3.5" />
                <span>
                  {hasUnsavedChanges ? 'حفظ التعديلات بالسحابة' : 'مزامنة السحابة'}
                </span>
              </>
            ) : (
              <>
                <LogIn className="w-3.5 h-3.5" />
                <span>ربط الخزنة السحابية</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Workspace Utility & PWA / Notification / Version Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
          {/* Mobile / Tablet Navigation Bar */}
          <div className="flex md:hidden items-center gap-1 overflow-x-auto w-full pb-2 border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('vault')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                activeTab === 'vault'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              خزنة العملاء
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('forward_studio')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                activeTab === 'forward_studio'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              الإرسال السريع
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('vcf_manager')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                activeTab === 'vcf_manager'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              فرز الستوري
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('direct_dialer')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                activeTab === 'direct_dialer'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              مراسلة بدون حفظ
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sheets_admin')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                activeTab === 'sheets_admin'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              قوقل شيت والتطبيق
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
            <span>
              وضع الروابط:{' '}
              <button
                type="button"
                onClick={() => setUseNativeProtocol((v) => !v)}
                className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                {useNativeProtocol
                  ? 'تطبيق واتساب المباشر (whatsapp://)'
                  : 'رابط واتساب العالمي (wa.me)'}
              </button>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">الإصدار النشط: v{APP_VERSION}</span>
          </div>

          {/* Right Utility Controls: PWA Install, Share (?v=APP_VERSION), Notification Center, Account, Theme */}
          <div className="flex flex-wrap items-center gap-2">
            <PWAInstallButton />

            <button
              type="button"
              onClick={handleShareVersionedLink}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              title="مشاركة رابط التطبيق برقم الإصدار الحالي لمنع الكاش القديم"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                {copiedShareLink
                  ? 'تم نسخ الرابط المحدث!'
                  : `مشاركة (?v=${APP_VERSION})`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsNotifDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Bell className="w-3.5 h-3.5 text-emerald-600" />
              <span>الإشعارات ({unreadNotificationsCount})</span>
            </button>

            {user && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="truncate max-w-[140px]">{user.email}</span>
                <button
                  type="button"
                  onClick={() => logOutUser()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3 h-3" />
                  <span>خروج</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              aria-label="تبديل المظهر الليلي والنهاري"
            >
              {darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>نهاري</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  <span>ليلي</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Status Feedback Banner */}
        {statusBanner && (
          <div
            className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-xs ${
              statusBanner.type === 'error'
                ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                : statusBanner.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusBanner.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              )}
              <span>{statusBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-xs font-medium underline shrink-0"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* 4-Column Full-Width KPI Metrics Strip */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              إجمالي العملاء المحفوظين بالخزنة
            </span>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {stats.total.toLocaleString('en-US')}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              محفوظون بالكامل دون حذف أي عميل محتمل
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              قائمة الستوري النشطة (للهاتف)
            </span>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {stats.activeStatus.toLocaleString('en-US')}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              قائمة خفيفة لمشاركة الحالات بسرعة فائقة
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              أرشيف العملاء المحتملين (سحابي)
            </span>
            <div className="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
              {stats.archiveLeads.toLocaleString('en-US')}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              مراسلة وإعادة إرسال فورية عبر الروابط المباشرة
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              الحزم السحابية المضغوطة (Firebase)
            </span>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {stats.chunkCount.toLocaleString('en-US')} حزمة
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              مزامنة فورية + ربط إداري مع Google Sheets
            </p>
          </div>
        </section>

        {/* Active View Content */}
        {activeTab === 'vault' && (
          <VirtualizedContactGrid
            contacts={contacts}
            selectedIds={selectedIds}
            activeTemplateContent={customMessage}
            useNativeProtocol={useNativeProtocol}
            onToggleSelect={handleToggleSelect}
            onSelectAllFiltered={handleSelectAllFiltered}
            onChangeTier={handleChangeTier}
            onDeleteContacts={handleDeleteContacts}
            onMarkContacted={handleMarkContacted}
            onAddSingleContact={handleAddSingleContact}
          />
        )}

        {activeTab === 'forward_studio' && (
          <QuickForwardStudio
            contacts={contacts}
            templates={templates}
            activeTemplateId={activeTemplateId}
            customMessage={customMessage}
            useNativeProtocol={useNativeProtocol}
            onSelectTemplate={(id, content) => {
              setActiveTemplateId(id);
              setCustomMessage(content);
            }}
            onCustomMessageChange={setCustomMessage}
            onSaveTemplate={handleSaveTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onMarkContacted={handleMarkContacted}
          />
        )}

        {activeTab === 'vcf_manager' && (
          <VcfImportExportPanel
            contacts={contacts}
            defaultCountryCode={defaultCountryCode}
            onCountryCodeChange={setDefaultCountryCode}
            onImportContacts={handleImportContacts}
            onRotateBatchToActiveStatus={handleRotateBatchToActiveStatus}
          />
        )}

        {activeTab === 'sheets_admin' && (
          <GoogleSheetsAdminPanel
            contacts={contacts}
            accessToken={oauthAccessToken}
            linkedSheetId={linkedSheetId}
            defaultCountryCode={defaultCountryCode}
            onConnectGoogleSheets={async () => {
              const existing = await getAccessToken();
              if (existing) {
                setOauthAccessToken(existing);
                return existing;
              }
              return handleConnectGoogleAndSheets();
            }}
            onLinkedSheetIdChange={setLinkedSheetId}
            onImportContactsFromSheet={(sheetContacts) =>
              handleImportContacts(sheetContacts, false)
            }
            onDispatchNotification={handleDispatchNotification}
          />
        )}

        {activeTab === 'direct_dialer' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <PhoneCall className="w-4 h-4 text-emerald-600" />
                  <span>01. فتح محادثة واتساب لأي رقم فوراً بدون حفظه</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  أدخل أي رقم عميل جديد لفتح محادثته أو إرسال عرض له مباشرة دون إضافته لسجل الهاتف.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    رقم الهاتف (مع أو بدون مفتاح الدولة {defaultCountryCode})
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={directPhoneInput}
                    onChange={(e) => setDirectPhoneInput(e.target.value)}
                    placeholder="+967 770 000 000"
                    className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 text-left"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    الرسالة المرفقة (اختياري)
                  </label>
                  <textarea
                    rows={3}
                    value={directMessageInput}
                    onChange={(e) => setDirectMessageInput(e.target.value)}
                    placeholder="اكتب رسالتك هنا أو اتركها فارغة لفتح المحادثة فقط..."
                    className="w-full p-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <a
                    href={
                      directPhoneInput.trim()
                        ? buildWhatsAppDirectUrl(
                            normalizePhoneForWhatsApp(
                              directPhoneInput,
                              defaultCountryCode
                            ).phone,
                            directMessageInput.trim() || undefined,
                            useNativeProtocol
                          )
                        : '#direct'
                    }
                    target={directPhoneInput.trim() ? '_blank' : undefined}
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>فتح المحادثة في واتساب الآن</span>
                    <ExternalLink className="w-3 h-3 opacity-75" />
                  </a>

                  <button
                    type="button"
                    onClick={() => {
                      if (!directPhoneInput.trim()) return;
                      handleAddSingleContact({
                        name: `عميل مباشر (${directPhoneInput.trim()})`,
                        phone: directPhoneInput.trim(),
                        tier: 'archive_lead',
                        group: 'مراسلة سريعة',
                      });
                      setStatusBanner({
                        type: 'success',
                        message: 'تمت إضافة الرقم إلى أرشيف الخزنة السحابية.',
                      });
                    }}
                    className="px-3.5 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    + حفظ في أرشيف الخزنة
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  02. لصق مجموعة أرقام للإرسال الفوري المتتالي
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  الصق أي قائمة أرقام (من الواتساب أو الملاحظات) وسيتم توليد أزرار إرسال فورية لها دون حفظها في جوالك.
                </p>
              </div>

              <textarea
                rows={4}
                dir="ltr"
                value={bulkPasteNumbers}
                onChange={(e) => setBulkPasteNumbers(e.target.value)}
                placeholder={'771234567\n772345678\n+966501234567'}
                className="w-full p-3 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 text-left"
              />

              {parsedBulkNumbers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      الأرقام الجاهزة للإرسال ({parsedBulkNumbers.length.toLocaleString('en-US')})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const newItems: VaultContact[] = parsedBulkNumbers.map(
                          (item, idx) => ({
                            id: `pasted_${Date.now()}_${idx}`,
                            name: `عميل مضاف #${idx + 1}`,
                            phone: item.normalized,
                            tier: 'archive_lead',
                            group: 'دفعة ملصقة',
                          })
                        );
                        handleImportContacts(newItems, false);
                        setBulkPasteNumbers('');
                      }}
                      className="text-emerald-600 hover:underline font-medium"
                    >
                      + حفظ الكل في أرشيف الخزنة
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                    {parsedBulkNumbers.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between px-3 py-2 text-xs"
                      >
                        <span className="font-mono text-slate-700 dark:text-slate-300" dir="ltr">
                          {item.normalized}
                        </span>
                        <a
                          href={buildWhatsAppDirectUrl(
                            item.normalized,
                            customMessage,
                            useNativeProtocol
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded transition-colors"
                        >
                          إرسال العرض الآن
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-4 px-6 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-[1360px] mx-auto flex flex-wrap items-center justify-between gap-2">
          <span>
            خزنة العملاء ومُسرّع واتساب للأعمال — PWA & Android APK Auto-Build · الإصدار v{APP_VERSION}
          </span>
          <span className="font-mono tabular-nums">
            سعة الحزمة السحابية: {CONTACTS_PER_CHUNK} جهة اتصال / وثيقة · ?v={APP_VERSION}
          </span>
        </div>
      </footer>
    </div>
  );
}
