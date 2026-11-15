import { ContactTier, ImportSummary, VaultContact } from '../types/vault';

/**
 * Decodes Quoted-Printable UTF-8 strings frequently produced by Android/iOS native VCF exports
 * especially for Arabic contact names (e.g. =D9=85=D8=AD=D9=85=D8=AF).
 */
export function decodeQuotedPrintableUtf8(input: string): string {
  if (!input.includes('=')) return input.trim();
  try {
    const cleaned = input.replace(/=\r?\n/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '=' && i + 2 < cleaned.length) {
        const hex = cleaned.substring(i + 1, i + 3);
        if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
          bytes.push(parseInt(hex, 16));
          i += 2;
          continue;
        }
      }
      bytes.push(cleaned.charCodeAt(i));
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes)).trim();
  } catch {
    return input.trim();
  }
}

/**
 * Converts Arabic-Indic and Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩) to standard ASCII digits
 * and normalizes phone numbers into WhatsApp-ready international format.
 */
export function normalizePhoneForWhatsApp(
  rawPhone: string,
  defaultCountryCode: string = '+967'
): { phone: string; wasNormalized: boolean } {
  const arabicDigitsMap: Record<string, string> = {
    '٠': '0',
    '١': '1',
    '٢': '2',
    '٣': '3',
    '٤': '4',
    '٥': '5',
    '٦': '6',
    '٧': '7',
    '٨': '8',
    '٩': '9',
    '۰': '0',
    '۱': '1',
    '۲': '2',
    '۳': '3',
    '۴': '4',
    '۵': '5',
    '۶': '6',
    '۷': '7',
    '۸': '8',
    '۹': '9',
  };

  let converted = '';
  for (const ch of rawPhone) {
    converted += arabicDigitsMap[ch] ?? ch;
  }

  let digitsAndPlus = converted.replace(/[^\d+]/g, '');
  let wasNormalized = false;

  const cleanDefaultCode = defaultCountryCode.startsWith('+')
    ? defaultCountryCode
    : `+${defaultCountryCode.replace(/\D/g, '') || '967'}`;

  if (digitsAndPlus.startsWith('00')) {
    digitsAndPlus = '+' + digitsAndPlus.slice(2);
    wasNormalized = true;
  } else if (digitsAndPlus.startsWith('0') && !digitsAndPlus.startsWith('00')) {
    digitsAndPlus = cleanDefaultCode + digitsAndPlus.slice(1);
    wasNormalized = true;
  } else if (!digitsAndPlus.startsWith('+')) {
    // Check if it already starts with the country code digits (e.g. 96777... or 9665...)
    const bareCode = cleanDefaultCode.slice(1);
    if (digitsAndPlus.startsWith(bareCode) && digitsAndPlus.length >= bareCode.length + 7) {
      digitsAndPlus = '+' + digitsAndPlus;
    } else {
      digitsAndPlus = cleanDefaultCode + digitsAndPlus;
    }
    wasNormalized = true;
  }

  // Ensure strict schema boundary (3..32 chars)
  const sanitized = digitsAndPlus.slice(0, 32);
  return { phone: sanitized, wasNormalized };
}

/**
 * Formats a normalized phone number into a clean digits-only string for `https://wa.me/`
 */
export function getWaMeDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Builds a direct WhatsApp deep link that bypasses WhatsApp's laggy native contact picker
 */
export function buildWhatsAppDirectUrl(
  phone: string,
  messageText?: string,
  useNativeProtocol: boolean = false
): string {
  const digits = getWaMeDigits(phone);
  const encodedMsg = messageText ? encodeURIComponent(messageText) : '';
  if (useNativeProtocol) {
    return `whatsapp://send?phone=${digits}${encodedMsg ? `&text=${encodedMsg}` : ''}`;
  }
  return `https://wa.me/${digits}${encodedMsg ? `?text=${encodedMsg}` : ''}`;
}

/**
 * High-speed VCF / CSV parser capable of parsing 40,000+ contacts in memory without blocking UI.
 */
export function parseContactsFileContent(
  content: string,
  fileName: string,
  options: {
    defaultCountryCode: string;
    initialActiveStatusLimit: number;
    defaultGroupLabel: string;
    existingPhones?: Set<string>;
  }
): { contacts: VaultContact[]; summary: ImportSummary } {
  const isVcf =
    fileName.toLowerCase().endsWith('.vcf') || content.includes('BEGIN:VCARD');

  const seenPhones = new Set<string>(options.existingPhones || []);
  const contacts: VaultContact[] = [];
  let totalParsed = 0;
  let duplicatesRemoved = 0;
  let normalizedCount = 0;
  let activeStatusAssigned = 0;
  let archiveAssigned = 0;

  const sanitizeString = (val: string, maxLen: number, fallback: string): string => {
    const trimmed = val.replace(/\s+/g, ' ').trim();
    if (!trimmed) return fallback;
    return trimmed.slice(0, maxLen);
  };

  if (isVcf) {
    // Unfold multi-line Quoted-Printable or folded lines in VCF
    const unfolded = content.replace(/=\r?\n/g, '').replace(/\r?\n[ \t]/g, '');
    const cards = unfolded.split(/BEGIN:VCARD/i);

    for (let i = 1; i < cards.length; i++) {
      const cardBlock = cards[i];
      const lines = cardBlock.split(/\r?\n/);
      let rawName = '';
      const rawPhones: string[] = [];
      let rawOrgOrNote = '';

      for (const line of lines) {
        const upper = line.toUpperCase();
        if (upper.startsWith('FN:') || upper.startsWith('FN;')) {
          const valPart = line.substring(line.indexOf(':') + 1);
          rawName = upper.includes('QUOTED-PRINTABLE')
            ? decodeQuotedPrintableUtf8(valPart)
            : valPart.trim();
        } else if (!rawName && (upper.startsWith('N:') || upper.startsWith('N;'))) {
          const valPart = line.substring(line.indexOf(':') + 1);
          const decoded = upper.includes('QUOTED-PRINTABLE')
            ? decodeQuotedPrintableUtf8(valPart)
            : valPart;
          const parts = decoded
            .split(';')
            .map((p) => p.trim())
            .filter(Boolean);
          rawName = parts.reverse().join(' ');
        } else if (upper.startsWith('TEL:') || upper.startsWith('TEL;')) {
          const telVal = line.substring(line.indexOf(':') + 1).trim();
          if (telVal) rawPhones.push(telVal);
        } else if (upper.startsWith('ORG:') || upper.startsWith('CATEGORIES:')) {
          const orgVal = line.substring(line.indexOf(':') + 1).trim();
          if (orgVal) rawOrgOrNote = decodeQuotedPrintableUtf8(orgVal).replace(/;/g, ' ');
        }
      }

      for (const rawPhone of rawPhones) {
        totalParsed++;
        const { phone, wasNormalized } = normalizePhoneForWhatsApp(
          rawPhone,
          options.defaultCountryCode
        );
        const digitsOnly = getWaMeDigits(phone);
        if (digitsOnly.length < 7) continue;

        if (seenPhones.has(digitsOnly)) {
          duplicatesRemoved++;
          continue;
        }
        seenPhones.add(digitsOnly);
        if (wasNormalized) normalizedCount++;

        const isStatusTier = activeStatusAssigned < options.initialActiveStatusLimit;
        const tier: ContactTier = isStatusTier ? 'active_status' : 'archive_lead';
        if (isStatusTier) activeStatusAssigned++;
        else archiveAssigned++;

        const cleanName = sanitizeString(
          rawName || `عميل محتمل #${contacts.length + 1}`,
          120,
          `عميل محتمل #${contacts.length + 1}`
        );
        const cleanGroup = sanitizeString(
          rawOrgOrNote || options.defaultGroupLabel || 'دفعة مستوردة',
          64,
          'دفعة مستوردة'
        );

        contacts.push({
          id: `c_${Date.now().toString(36)}_${contacts.length}`,
          name: cleanName,
          phone,
          tier,
          group: cleanGroup,
        });
      }
    }
  } else {
    // CSV / TSV / Line-separated numbers or Name,Phone pairs
    const lines = content.split(/\r?\n/);
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx].trim();
      if (!line) continue;
      // Skip common CSV header row
      if (
        idx === 0 &&
        /phone|mobile|name|الاسم|الرقم|الجوال|هاتف/i.test(line) &&
        !/\d{6,}/.test(line)
      ) {
        continue;
      }

      totalParsed++;
      const parts = line.split(/[,;\t|]/).map((s) => s.replace(/^["']|["']$/g, '').trim());
      let candidatePhone = '';
      let candidateName = '';
      let candidateGroup = options.defaultGroupLabel || 'دفعة CSV';

      for (const part of parts) {
        const digitCount = (part.match(/\d/g) || []).length;
        if (!candidatePhone && digitCount >= 7) {
          candidatePhone = part;
        } else if (!candidateName && part.length > 0 && digitCount < 7) {
          candidateName = part;
        } else if (candidateName && candidatePhone && part.length > 0) {
          candidateGroup = part;
        }
      }

      if (!candidatePhone && (line.match(/\d/g) || []).length >= 7) {
        candidatePhone = line;
      }
      if (!candidatePhone) continue;

      const { phone, wasNormalized } = normalizePhoneForWhatsApp(
        candidatePhone,
        options.defaultCountryCode
      );
      const digitsOnly = getWaMeDigits(phone);
      if (digitsOnly.length < 7) continue;

      if (seenPhones.has(digitsOnly)) {
        duplicatesRemoved++;
        continue;
      }
      seenPhones.add(digitsOnly);
      if (wasNormalized) normalizedCount++;

      const isStatusTier = activeStatusAssigned < options.initialActiveStatusLimit;
      const tier: ContactTier = isStatusTier ? 'active_status' : 'archive_lead';
      if (isStatusTier) activeStatusAssigned++;
      else archiveAssigned++;

      contacts.push({
        id: `c_${Date.now().toString(36)}_${contacts.length}`,
        name: sanitizeString(
          candidateName || `عميل محتمل #${contacts.length + 1}`,
          120,
          `عميل محتمل #${contacts.length + 1}`
        ),
        phone,
        tier,
        group: sanitizeString(candidateGroup, 64, 'دفعة CSV'),
      });
    }
  }

  return {
    contacts,
    summary: {
      totalParsed,
      validImported: contacts.length,
      duplicatesRemoved,
      normalizedCount,
      activeStatusAssigned,
      archiveAssigned,
    },
  };
}

/**
 * Generates a clean vCard 3.0 (.vcf) file for exporting only the Active Status list
 * or specific rotated batches back to the phone's address book.
 */
export function exportContactsToVcf(
  contacts: VaultContact[],
  prefixTag: string = ''
): string {
  const lines: string[] = [];
  for (const contact of contacts) {
    const displayName = prefixTag ? `${prefixTag} ${contact.name}`.trim() : contact.name;
    lines.push('BEGIN:VCARD');
    lines.push('VERSION:3.0');
    lines.push(`FN:${displayName}`);
    lines.push(`N:;${displayName};;;`);
    lines.push(`TEL;TYPE=CELL:${contact.phone}`);
    if (contact.group) {
      lines.push(`CATEGORIES:${contact.group}`);
    }
    lines.push('END:VCARD');
  }
  return lines.join('\r\n');
}

/**
 * Generates realistic sample bulk leads (e.g., 5,000 or 40,000 contacts) for testing
 * the virtualized grid and batch splitting speed immediately.
 */
export function generateSyntheticLeadsBatch(
  count: number,
  defaultCountryCode: string = '+967',
  activeLimit: number = 1000
): VaultContact[] {
  const firstNames = [
    'أحمد', 'محمد', 'عبدالله', 'خالد', 'صالح', 'عمر', 'ياسر', 'إبراهيم', 'فهد', 'سلطان',
    'ماجد', 'طارق', 'زياد', 'وليد', 'بندر', 'سامي', 'نبيل', 'فيصل', 'عادل', 'مروان',
    'سارة', 'نورة', 'مريم', 'فاطمة', 'ريم', 'هدى', 'أمل', 'لطيفة', 'منال', 'سمية'
  ];
  const lastNames = [
    'العولقي', 'الحربي', 'القحطاني', 'اليافعي', 'الشمري', 'العتيبي', 'الحضرمي', 'الدوسري',
    'المالكي', 'الزهراني', 'الغامدي', 'البكري', 'السقاف', 'العمري', 'باوزير', 'المطيري'
  ];
  const groups = [
    'عملاء جملة - نشط',
    'استفسارات عروض المواسم',
    'عملاء محتملون - الدفعة 1',
    'عملاء محتملون - الدفعة 2',
    'عملاء محتملون - الدفعة 3',
    'طلبات المتجر الإلكتروني',
    'قائمة VIP للستوري'
  ];

  const cleanCode = defaultCountryCode.startsWith('+')
    ? defaultCountryCode
    : `+${defaultCountryCode.replace(/\D/g, '') || '967'}`;

  const result: VaultContact[] = new Array(count);
  const baseTimestamp = Date.now().toString(36);

  for (let i = 0; i < count; i++) {
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[(i * 7) % lastNames.length];
    const group = i < activeLimit ? 'قائمة VIP للستوري' : groups[(i % (groups.length - 1)) + 1];
    const subscriberNum = (770000000 + i).toString();
    const tier: ContactTier = i < activeLimit ? 'active_status' : 'archive_lead';

    result[i] = {
      id: `lead_${baseTimestamp}_${i}`,
      name: `${fn} ${ln} #${i + 1}`,
      phone: `${cleanCode}${subscriberNum}`,
      tier,
      group,
    };
  }

  return result;
}
