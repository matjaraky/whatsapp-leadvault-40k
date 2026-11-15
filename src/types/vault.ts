export type ContactTier = 'active_status' | 'archive_lead';

export type NotificationChannel =
  | 'sync_alert'
  | 'sheets_admin'
  | 'status_rotation'
  | 'version_update';

export interface VaultContact {
  id: string;
  name: string;
  phone: string;
  tier: ContactTier;
  group: string;
  notes?: string;
  lastContactedAt?: string;
}

export interface UserVaultMeta {
  ownerId: string;
  totalContacts: number;
  activeStatusCount: number;
  archiveLeadCount: number;
  chunkCount: number;
  defaultCountryCode: string;
  linkedSheetId?: string;
}

export interface ContactChunkDoc {
  ownerId: string;
  chunkIndex: number;
  batchLabel: string;
  contactCount: number;
  contacts: VaultContact[];
}

export interface MessageTemplateItem {
  id: string;
  ownerId: string;
  title: string;
  category: string;
  content: string;
  usageCount: number;
}

export interface VaultNotificationItem {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  read: boolean;
  source: string;
  createdAtIso: string;
}

export interface ImportSummary {
  totalParsed: number;
  validImported: number;
  duplicatesRemoved: number;
  normalizedCount: number;
  activeStatusAssigned: number;
  archiveAssigned: number;
}

export interface AppVersionManifest {
  version: string;
  buildNumber: number;
  releasedAt: string;
  channel: string;
  forceSilentRefresh: boolean;
  apkBuildWorkflow: string;
  notes: string;
}
