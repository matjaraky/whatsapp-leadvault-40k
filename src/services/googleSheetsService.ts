import { VaultContact, VaultNotificationItem } from '../types/vault';

export interface SheetMetadataInfo {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheetTabs: string[];
}

/**
 * Extracts a clean Google Spreadsheet ID from either a full Google Sheets URL or a raw ID string.
 */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed.replace(/[^a-zA-Z0-9-_]/g, '');
}

/**
 * Fetches spreadsheet metadata dynamically to inspect actual tab names (never hardcoding "Sheet1").
 */
export async function fetchSpreadsheetMetadata(
  accessToken: string,
  rawSpreadsheetId: string
): Promise<SheetMetadataInfo> {
  const spreadsheetId = extractSpreadsheetId(rawSpreadsheetId);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`تعذر الوصول لملف Google Sheets (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const sheetTabs: string[] = Array.isArray(data.sheets)
    ? data.sheets
        .map((s: { properties?: { title?: string } }) => s.properties?.title)
        .filter(Boolean)
    : [];

  return {
    spreadsheetId: data.spreadsheetId || spreadsheetId,
    title: data.properties?.title || 'جدول إدارة خزنة واتساب',
    spreadsheetUrl:
      data.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    sheetTabs,
  };
}

/**
 * Creates a brand-new administrative Google Spreadsheet pre-configured with tabs for:
 * 1) Active Status Contacts & Summary
 * 2) Admin Broadcast Notifications
 */
export async function createAdminVaultSpreadsheet(
  accessToken: string,
  title: string = 'إدارة خزنة واتساب 40K والإشعارات الإدارية'
): Promise<SheetMetadataInfo> {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title,
        locale: 'ar_SA',
      },
      sheets: [
        {
          properties: {
            title: 'جهات_الاتصال_النشطة',
            gridProperties: {
              rowCount: 2500,
              columnCount: 6,
              frozenRowCount: 1,
            },
          },
        },
        {
          properties: {
            title: 'الإشعارات_الإدارية',
            gridProperties: {
              rowCount: 500,
              columnCount: 5,
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`فشل إنشاء ملف Google Sheets جديد (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const sheetTabs: string[] = Array.isArray(data.sheets)
    ? data.sheets.map((s: { properties?: { title?: string } }) => s.properties?.title).filter(Boolean)
    : ['جهات_الاتصال_النشطة', 'الإشعارات_الإدارية'];

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || title,
    spreadsheetUrl:
      data.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
    sheetTabs,
  };
}

/**
 * Pushes (syncs) the Active Status Contacts and Vault Summary to the selected tab in Google Sheets.
 * Must be called AFTER explicit user confirmation modal per workspace-integration rules.
 */
export async function syncContactsToGoogleSheetTab(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  contacts: VaultContact[],
  maxRows: number = 1000
): Promise<{ updatedRows: number }> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const subset = contacts.slice(0, maxRows);

  const rows: string[][] = [
    ['المعرف (ID)', 'اسم العميل', 'رقم الواتساب', 'القائمة (Tier)', 'المجموعة', 'آخر تواصل'],
    ...subset.map((c) => [
      c.id,
      c.name,
      c.phone,
      c.tier === 'active_status' ? 'ستوري نشط' : 'أرشيف سحابي',
      c.group,
      c.lastContactedAt || '-',
    ]),
  ];

  const encodedRange = encodeURIComponent(`${tabName}!A1:F${rows.length}`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `${tabName}!A1:F${rows.length}`,
        majorDimension: 'ROWS',
        values: rows,
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`فشل تحديث بيانات الجدول (${res.status}): ${errText}`);
  }

  return { updatedRows: subset.length };
}

/**
 * Appends a notification log row to the Google Sheet and returns confirmation.
 * Must be called AFTER explicit user confirmation modal.
 */
export async function appendNotificationToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  notification: { title: string; body: string; channel: string }
): Promise<void> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const encodedRange = encodeURIComponent(`${tabName}!A1:E1`);

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: [
          [
            `notif_${Date.now()}`,
            notification.title,
            notification.body,
            notification.channel,
            new Date().toISOString(),
          ],
        ],
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`تعذر ترحيل الإشعار إلى Google Sheets (${res.status}): ${errText}`);
  }
}

/**
 * Reads administrative rows (either contacts or notifications) from the selected tab in Google Sheets.
 */
export async function readRowsFromGoogleSheetTab(
  accessToken: string,
  spreadsheetId: string,
  tabName: string
): Promise<string[][]> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const encodedRange = encodeURIComponent(`${tabName}!A1:F1000`);

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodedRange}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`تعذر قراءة البيانات من Google Sheets (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return Array.isArray(data.values) ? (data.values as string[][]) : [];
}

/**
 * Converts rows read from a Google Sheet notifications tab into notification payloads.
 */
export function parseNotificationsFromSheetRows(
  rows: string[][]
): Array<Pick<VaultNotificationItem, 'title' | 'body' | 'channel'>> {
  const results: Array<Pick<VaultNotificationItem, 'title' | 'body' | 'channel'>> = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    // Skip header row if present
    if (i === 0 && /عنوان|title|المعرف|id/i.test(row.join(' '))) continue;

    const title = (row[1] || row[0] || '').trim();
    const body = (row[2] || row[1] || '').trim();
    if (!title || !body) continue;

    results.push({
      title: title.slice(0, 120),
      body: body.slice(0, 600),
      channel: 'sheets_admin',
    });
  }
  return results;
}
