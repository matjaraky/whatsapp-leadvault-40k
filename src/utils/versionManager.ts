import { AppVersionManifest } from '../types/vault';

export const APP_VERSION = '2.5.0';
export const DIRECT_APK_DOWNLOAD_URL =
  'https://github.com/matjaraky/whatsapp-leadvault-40k/releases/latest/download/LeadVault40K.apk';
export const GITHUB_REPO_URL =
  'https://github.com/matjaraky/whatsapp-leadvault-40k';
export const PUBLIC_WEB_APP_URL =
  'https://ais-pre-myageze46dqsrsenypx7mj-463441635866.europe-west2.run.app/?v=2.5.0';

const UPDATED_VERSION_GUARD_KEY = 'leadvault_silent_update_applied_version';

/**
 * Ensures the browser address bar and any shared URLs include `?v=APP_VERSION`
 * without triggering any page reload or navigation flicker.
 */
export function enforceVersionQueryParam(version: string = APP_VERSION): void {
  if (typeof window === 'undefined') return;
  try {
    // Do not rewrite URL inside native Capacitor Android WebView if protocol is custom
    if (
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:'
    ) {
      return;
    }
    const url = new URL(window.location.href);
    const currentParam = url.searchParams.get('v');
    if (currentParam !== version) {
      url.searchParams.set('v', version);
      window.history.replaceState(window.history.state, '', url.toString());
    }
  } catch {
    // Ignore history API errors inside restricted frames
  }
}

/**
 * Generates a cache-busted shareable link containing `?v=APP_VERSION`.
 */
export function buildVersionedShareUrl(version: string = APP_VERSION): string {
  if (typeof window === 'undefined') return `${PUBLIC_WEB_APP_URL}`;
  try {
    if (
      window.location.hostname === 'localhost' ||
      window.location.protocol === 'capacitor:'
    ) {
      return PUBLIC_WEB_APP_URL;
    }
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('v', version);
    return url.toString();
  } catch {
    return PUBLIC_WEB_APP_URL;
  }
}

/**
 * Purges outdated Service Worker caches and reloads ONCE per target version.
 * Protected by sessionStorage and URL query parameter guards so it NEVER causes a reload loop.
 */
export async function performSilentCacheUpdate(
  targetVersion: string,
  forceManual: boolean = false
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    if (!forceManual) {
      const alreadyApplied = sessionStorage.getItem(UPDATED_VERSION_GUARD_KEY);
      const urlParam = new URL(window.location.href).searchParams.get('v');
      if (alreadyApplied === targetVersion || urlParam === targetVersion) {
        return;
      }
      sessionStorage.setItem(UPDATED_VERSION_GUARD_KEY, targetVersion);
    }

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.update()));
    }
  } catch {
    // Ignore cache API errors
  }

  try {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('v', targetVersion);
    window.location.replace(nextUrl.toString());
  } catch {
    window.location.reload();
  }
}

/**
 * Fetches `/version.json` bypassing all HTTP caches to detect new releases safely.
 */
export async function checkRemoteVersionManifest(): Promise<{
  manifest: AppVersionManifest | null;
  isNewerAvailable: boolean;
}> {
  try {
    const res = await fetch(`/version.json?_cb=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    if (!res.ok) return { manifest: null, isNewerAvailable: false };
    const manifest = (await res.json()) as AppVersionManifest;

    const alreadyApplied =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(UPDATED_VERSION_GUARD_KEY)
        : null;

    const isNewerAvailable =
      Boolean(manifest.version) &&
      manifest.version !== APP_VERSION &&
      alreadyApplied !== manifest.version;

    return { manifest, isNewerAvailable };
  } catch {
    return { manifest: null, isNewerAvailable: false };
  }
}
