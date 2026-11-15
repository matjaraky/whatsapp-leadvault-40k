import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  ContactChunkDoc,
  MessageTemplateItem,
  NotificationChannel,
  UserVaultMeta,
  VaultContact,
  VaultNotificationItem,
} from '../types/vault';

export const CONTACTS_PER_CHUNK = 500;

/**
 * Triggers a native Android / Web System Tray notification via ServiceWorkerRegistration
 * or Notification API whenever a new real-time notification arrives.
 */
export async function triggerSystemTrayNotification(
  title: string,
  body: string,
  tag: string = 'vault-notification'
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch {
      return false;
    }
  }

  if (permission !== 'granted') {
    return false;
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag,
          dir: 'rtl',
          lang: 'ar',
        });
        return true;
      }
    }
    new Notification(title, {
      body,
      icon: '/pwa-192x192.png',
      tag,
      dir: 'rtl',
      lang: 'ar',
    });
    return true;
  } catch {
    return false;
  }
}

export function sanitizeContactForFirestore(contact: VaultContact): VaultContact {
  const clean: VaultContact = {
    id: (contact.id || `c_${Date.now()}`).slice(0, 64),
    name: (contact.name || 'عميل محتمل').trim().slice(0, 120) || 'عميل محتمل',
    phone: (contact.phone || '+967770000000').trim().slice(0, 32),
    tier: contact.tier === 'active_status' ? 'active_status' : 'archive_lead',
    group: (contact.group || 'عام').trim().slice(0, 64) || 'عام',
  };
  if (contact.notes && contact.notes.trim()) {
    clean.notes = contact.notes.trim().slice(0, 300);
  }
  if (contact.lastContactedAt && contact.lastContactedAt.trim()) {
    clean.lastContactedAt = contact.lastContactedAt.trim().slice(0, 40);
  }
  return clean;
}

export async function upsertUserVaultMeta(
  uid: string,
  meta: Omit<UserVaultMeta, 'ownerId'>
): Promise<void> {
  const vaultPath = `users/${uid}`;
  const vaultRef = doc(db, 'users', uid);

  const safeCode = /^\+?[0-9]{1,6}$/.test(meta.defaultCountryCode)
    ? meta.defaultCountryCode.slice(0, 8)
    : '+967';

  const basePayload: Record<string, unknown> = {
    totalContacts: Math.max(0, Math.min(250000, Math.floor(meta.totalContacts))),
    activeStatusCount: Math.max(0, Math.min(250000, Math.floor(meta.activeStatusCount))),
    archiveLeadCount: Math.max(0, Math.min(250000, Math.floor(meta.archiveLeadCount))),
    chunkCount: Math.max(0, Math.min(500, Math.floor(meta.chunkCount))),
    defaultCountryCode: safeCode,
    updatedAt: serverTimestamp(),
  };

  if (typeof meta.linkedSheetId === 'string') {
    basePayload.linkedSheetId = meta.linkedSheetId.trim().slice(0, 128);
  }

  try {
    const existingSnap = await getDoc(vaultRef);
    if (!existingSnap.exists()) {
      await setDoc(vaultRef, {
        ownerId: uid,
        ...basePayload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(vaultRef, basePayload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, vaultPath);
  }
}

export async function syncAllContactsToCloud(
  uid: string,
  contacts: VaultContact[],
  defaultCountryCode: string,
  onProgress?: (completedChunks: number, totalChunks: number) => void,
  linkedSheetId?: string
): Promise<void> {
  const sanitized = contacts.map(sanitizeContactForFirestore);
  const activeStatusCount = sanitized.filter((c) => c.tier === 'active_status').length;
  const archiveLeadCount = sanitized.length - activeStatusCount;

  const chunks: VaultContact[][] = [];
  for (let i = 0; i < sanitized.length; i += CONTACTS_PER_CHUNK) {
    chunks.push(sanitized.slice(i, i + CONTACTS_PER_CHUNK));
  }

  await upsertUserVaultMeta(uid, {
    totalContacts: sanitized.length,
    activeStatusCount,
    archiveLeadCount,
    chunkCount: chunks.length,
    defaultCountryCode,
    linkedSheetId,
  });

  const chunksColPath = `users/${uid}/contactChunks`;
  const chunksColRef = collection(db, 'users', uid, 'contactChunks');
  let existingChunkIds = new Set<string>();
  try {
    const q = query(chunksColRef, where('ownerId', '==', uid));
    const snap = await getDocs(q);
    existingChunkIds = new Set(snap.docs.map((d) => d.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, chunksColPath);
  }

  const totalChunks = Math.max(1, chunks.length);
  for (let i = 0; i < chunks.length; i++) {
    const chunkId = `chunk_${i}`;
    const chunkDocPath = `users/${uid}/contactChunks/${chunkId}`;
    const chunkRef = doc(db, 'users', uid, 'contactChunks', chunkId);
    const batchContacts = chunks[i];
    const batchLabel = `الحزمة السحابية #${i + 1} (${batchContacts.length} رقم)`.slice(0, 100);

    try {
      if (existingChunkIds.has(chunkId)) {
        await updateDoc(chunkRef, {
          batchLabel,
          contactCount: batchContacts.length,
          contacts: batchContacts,
          updatedAt: serverTimestamp(),
        });
        existingChunkIds.delete(chunkId);
      } else {
        await setDoc(chunkRef, {
          ownerId: uid,
          chunkIndex: i,
          batchLabel,
          contactCount: batchContacts.length,
          contacts: batchContacts,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      onProgress?.(i + 1, totalChunks);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, chunkDocPath);
    }
  }

  for (const leftoverId of existingChunkIds) {
    const leftoverPath = `users/${uid}/contactChunks/${leftoverId}`;
    try {
      await deleteDoc(doc(db, 'users', uid, 'contactChunks', leftoverId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, leftoverPath);
    }
  }
}

export async function loadVaultFromCloud(uid: string): Promise<{
  meta: UserVaultMeta | null;
  contacts: VaultContact[];
  templates: MessageTemplateItem[];
}> {
  const vaultPath = `users/${uid}`;
  let meta: UserVaultMeta | null = null;

  try {
    const vaultSnap = await getDoc(doc(db, 'users', uid));
    if (vaultSnap.exists()) {
      const data = vaultSnap.data();
      meta = {
        ownerId: data.ownerId,
        totalContacts: data.totalContacts ?? 0,
        activeStatusCount: data.activeStatusCount ?? 0,
        archiveLeadCount: data.archiveLeadCount ?? 0,
        chunkCount: data.chunkCount ?? 0,
        defaultCountryCode: data.defaultCountryCode ?? '+967',
        linkedSheetId: data.linkedSheetId ?? '',
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, vaultPath);
  }

  const contacts: VaultContact[] = [];
  if (meta) {
    const chunksColPath = `users/${uid}/contactChunks`;
    try {
      const chunksQuery = query(
        collection(db, 'users', uid, 'contactChunks'),
        where('ownerId', '==', uid)
      );
      const chunksSnap = await getDocs(chunksQuery);
      const sortedChunks: ContactChunkDoc[] = chunksSnap.docs
        .map((d) => d.data() as ContactChunkDoc)
        .sort((a, b) => a.chunkIndex - b.chunkIndex);

      for (const ch of sortedChunks) {
        if (Array.isArray(ch.contacts)) {
          contacts.push(...ch.contacts);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, chunksColPath);
    }
  }

  const templates: MessageTemplateItem[] = [];
  if (meta) {
    const templatesColPath = `users/${uid}/templates`;
    try {
      const tplQuery = query(
        collection(db, 'users', uid, 'templates'),
        where('ownerId', '==', uid)
      );
      const tplSnap = await getDocs(tplQuery);
      for (const docSnap of tplSnap.docs) {
        const d = docSnap.data();
        templates.push({
          id: docSnap.id,
          ownerId: d.ownerId,
          title: d.title,
          category: d.category,
          content: d.content,
          usageCount: d.usageCount ?? 0,
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, templatesColPath);
    }
  }

  return { meta, contacts, templates };
}

export async function saveTemplateToCloud(
  uid: string,
  template: MessageTemplateItem,
  isNew: boolean
): Promise<void> {
  const safeId = template.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || `tpl_${Date.now()}`;
  const path = `users/${uid}/templates/${safeId}`;
  const ref = doc(db, 'users', uid, 'templates', safeId);

  const safeTitle = (template.title || 'قالب رسالة').trim().slice(0, 100);
  const safeCategory = (template.category || 'عام').trim().slice(0, 50);
  const safeContent = (template.content || 'مرحباً').trim().slice(0, 2000);
  const safeUsage = Math.max(0, Math.min(10000000, Math.floor(template.usageCount || 0)));

  try {
    if (isNew) {
      await setDoc(ref, {
        ownerId: uid,
        title: safeTitle,
        category: safeCategory,
        content: safeContent,
        usageCount: safeUsage,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        title: safeTitle,
        category: safeCategory,
        content: safeContent,
        usageCount: safeUsage,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteTemplateFromCloud(uid: string, templateId: string): Promise<void> {
  const path = `users/${uid}/templates/${templateId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'templates', templateId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Real-time listener (`onSnapshot`) for `/users/{uid}/notifications`.
 * Fires OS/Android/Web pop-up tray notifications when new unread alerts arrive.
 */
export function subscribeToVaultNotifications(
  uid: string,
  onUpdate: (items: VaultNotificationItem[]) => void,
  onNewAlert?: (item: VaultNotificationItem) => void
): () => void {
  const path = `users/${uid}/notifications`;
  const q = query(
    collection(db, 'users', uid, 'notifications'),
    where('ownerId', '==', uid)
  );

  const knownIds = new Set<string>();
  let isInitialSnapshot = true;

  return onSnapshot(
    q,
    (snapshot) => {
      const items: VaultNotificationItem[] = [];
      for (const docSnap of snapshot.docs) {
        const d = docSnap.data();
        const createdAtIso =
          d.createdAt && typeof d.createdAt.toDate === 'function'
            ? d.createdAt.toDate().toISOString()
            : new Date().toISOString();

        const item: VaultNotificationItem = {
          id: docSnap.id,
          ownerId: d.ownerId,
          title: d.title || 'إشعار جديد',
          body: d.body || '',
          channel: (d.channel as NotificationChannel) || 'sync_alert',
          read: Boolean(d.read),
          source: d.source || 'firestore_realtime',
          createdAtIso,
        };
        items.push(item);

        if (!isInitialSnapshot && !knownIds.has(item.id) && !item.read) {
          triggerSystemTrayNotification(item.title, item.body, item.id);
          onNewAlert?.(item);
        }
        knownIds.add(item.id);
      }

      isInitialSnapshot = false;
      items.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function dispatchVaultNotification(
  uid: string,
  payload: {
    title: string;
    body: string;
    channel: NotificationChannel;
    source: string;
  }
): Promise<void> {
  const notifId = `notif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const path = `users/${uid}/notifications/${notifId}`;
  const ref = doc(db, 'users', uid, 'notifications', notifId);

  const allowedChannels: NotificationChannel[] = [
    'sync_alert',
    'sheets_admin',
    'status_rotation',
    'version_update',
  ];
  const safeChannel: NotificationChannel = allowedChannels.includes(payload.channel)
    ? payload.channel
    : 'sync_alert';

  try {
    await setDoc(ref, {
      ownerId: uid,
      title: (payload.title || 'تنبيه الخزنة').trim().slice(0, 120),
      body: (payload.body || 'تم تحديث بيانات الخزنة السحابية.').trim().slice(0, 600),
      channel: safeChannel,
      read: false,
      source: (payload.source || 'firestore_realtime').trim().slice(0, 40),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function markNotificationReadInCloud(
  uid: string,
  notificationId: string
): Promise<void> {
  const path = `users/${uid}/notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'notifications', notificationId), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteNotificationFromCloud(
  uid: string,
  notificationId: string
): Promise<void> {
  const path = `users/${uid}/notifications/${notificationId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'notifications', notificationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
