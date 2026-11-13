import bundledSavedSources from '../data/savedEpisodeSources.json';
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
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, isVerifiedAdminUser, OperationType } from '../firebase.ts';

// Utilities for Google Drive direct streaming, multi-language VTT subtitles, and permanent Cloud + Server storage
export interface SubtitleTrack {
  id: string;
  lang: 'ar' | 'en' | string;
  label: string;
  src: string;
  default?: boolean;
}

export interface BackupDriveLink {
  id: string;
  url: string;
  accountLabel?: string;
}

const EPISODE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const EPISODE_SOURCES_COLLECTION = 'episodeSources';

/**
 * Extracts a Google Drive File ID from various link formats:
 * - https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 * - https://drive.google.com/file/d/FILE_ID/preview
 * - https://drive.google.com/open?id=FILE_ID
 * - https://drive.google.com/uc?id=FILE_ID&export=download
 * - Bare FILE_ID (alphanumeric string with _ or -)
 */
export function extractDriveFileId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Pattern 1: /file/d/FILE_ID
  const fileDMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{25,})/);
  if (fileDMatch && fileDMatch[1]) {
    return fileDMatch[1];
  }

  // Pattern 2: id=FILE_ID
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{25,})/);
  if (idParamMatch && idParamMatch[1]) {
    return idParamMatch[1];
  }

  // Pattern 3: /open?id=FILE_ID
  const openIdMatch = trimmed.match(/\/open\?id=([a-zA-Z0-9_-]{25,})/);
  if (openIdMatch && openIdMatch[1]) {
    return openIdMatch[1];
  }

  // Pattern 4: Bare ID (typically 28-44 chars of base64url characters)
  if (/^[a-zA-Z0-9_-]{25,50}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Returns true if the provided string or URL refers to Google Drive
 */
export function isGoogleDriveSource(urlOrId: string): boolean {
  if (!urlOrId) return false;
  return (
    urlOrId.includes('drive.google.com') ||
    urlOrId.includes('docs.google.com') ||
    Boolean(extractDriveFileId(urlOrId))
  );
}

/**
 * Normalizes any Google Drive link (including /view, /preview, ?usp=sharing, etc.)
 * directly into the uncompressed highest quality direct stream/download URL:
 * https://drive.google.com/uc?export=download&id=FILE_ID
 */
export function normalizeDriveDirectUrl(fileIdOrUrl: string): string {
  if (!fileIdOrUrl) return '';
  const fileId = extractDriveFileId(fileIdOrUrl);
  if (fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  return fileIdOrUrl.trim();
}

/**
 * Generates a direct stream/download URL for Google Drive files
 * Plays original uncompressed video file directly without Google's 360p/720p /view compression
 */
export function getDriveDirectStreamUrl(fileIdOrUrl: string): string {
  const fileId = extractDriveFileId(fileIdOrUrl) || fileIdOrUrl.trim();
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Generates an alternative streaming URL (docs.google.com)
 */
export function getDriveSecondaryStreamUrl(fileIdOrUrl: string): string {
  const fileId = extractDriveFileId(fileIdOrUrl) || fileIdOrUrl.trim();
  return `https://docs.google.com/uc?export=open&id=${fileId}`;
}

/**
 * Generates Google Drive's built-in preview URL as optional fallback
 */
export function getDrivePreviewUrl(fileIdOrUrl: string): string {
  const fileId = extractDriveFileId(fileIdOrUrl) || fileIdOrUrl.trim();
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

/**
 * Converts standard SubRip (.srt) text to WebVTT (.vtt) format
 */
export function convertSrtToVtt(srtContent: string): string {
  const vtt = 'WEBVTT\n\n';
  const normalized = srtContent
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

  return vtt + normalized;
}

/**
 * Creates a Data URL or Blob URL from subtitle text
 */
export function createVttBlobUrl(vttContent: string): string {
  const blob = new Blob([vttContent], { type: 'text/vtt;charset=utf-8' });
  return URL.createObjectURL(blob);
}

// Persistent Cloud (Firestore) + Server + Local Storage Manager for Episode Sources
export const CUSTOM_SOURCES_STORAGE_KEY = 'aniverse_custom_episode_sources_v1';
export const SOURCES_UPDATED_EVENT = 'aniverse_sources_updated';

export interface CustomEpisodeConfig {
  videoUrl?: string;
  driveLink?: string;
  accountLabel?: string;
  backupDriveLinks?: BackupDriveLink[];
  subtitles?: SubtitleTrack[];
  updatedAt?: string;
}

export interface SaveEpisodeResult {
  savedToServer: boolean;
  savedToCloud: boolean;
  cloudError?: string;
}

export interface ResolvedServerOption {
  id: string;
  label: string;
  url: string;
}

export function getAvailableDriveServers(
  config?: CustomEpisodeConfig | null,
  fallbackDriveLink?: string
): ResolvedServerOption[] {
  const servers: ResolvedServerOption[] = [];
  const primary = config?.driveLink || fallbackDriveLink || '';
  if (primary.trim()) {
    servers.push({
      id: 'primary',
      label: config?.accountLabel?.trim() ? `السيرفر 1 (${config.accountLabel.trim()})` : 'السيرفر الأساسي 1',
      url: normalizeDriveDirectUrl(primary),
    });
  }

  if (Array.isArray(config?.backupDriveLinks)) {
    config.backupDriveLinks.forEach((b, idx) => {
      if (b?.url && b.url.trim()) {
        servers.push({
          id: b.id || `backup-${idx + 2}`,
          label: b.accountLabel?.trim()
            ? `سيرفر ${idx + 2} (${b.accountLabel.trim()})`
            : `سيرفر احتياطي ${idx + 2}`,
          url: normalizeDriveDirectUrl(b.url),
        });
      }
    });
  }

  return servers;
}

function readLocalStorageSources(): Record<string, CustomEpisodeConfig> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CUSTOM_SOURCES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalStorageSources(data: Record<string, CustomEpisodeConfig>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_SOURCES_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to mirror episode sources to localStorage:', e);
  }
}

let inMemorySources: Record<string, CustomEpisodeConfig> = {
  ...(bundledSavedSources as Record<string, CustomEpisodeConfig>),
  ...readLocalStorageSources(),
};

function sanitizeEpisodeConfigForBlueprint(config: CustomEpisodeConfig): CustomEpisodeConfig {
  const driveLink = (config.driveLink ? normalizeDriveDirectUrl(config.driveLink) : '').slice(0, 1000);
  const videoUrl = (config.videoUrl ? normalizeDriveDirectUrl(config.videoUrl) : driveLink).slice(0, 1000);
  const accountLabel = (config.accountLabel || '').trim().slice(0, 120);

  const backupDriveLinks = Array.isArray(config.backupDriveLinks)
    ? config.backupDriveLinks
        .filter((b) => b && b.url && b.url.trim())
        .slice(0, 10)
        .map((b, i) => ({
          id: String(b.id || `backup-${Date.now()}-${i}`).slice(0, 80),
          url: normalizeDriveDirectUrl(b.url).slice(0, 1000),
          accountLabel: String(b.accountLabel || '').trim().slice(0, 120),
        }))
    : [];

  const subtitles = Array.isArray(config.subtitles)
    ? config.subtitles.slice(0, 10).map((s, i) => ({
        id: String(s.id || `sub-${i}`).slice(0, 60),
        lang: String(s.lang || 'ar').slice(0, 24),
        label: String(s.label || 'Subtitle').slice(0, 80),
        src: String(s.src || '').slice(0, 500),
        default: Boolean(s.default),
      }))
    : [];

  return {
    driveLink,
    videoUrl: videoUrl || driveLink,
    accountLabel,
    backupDriveLinks,
    subtitles,
    updatedAt: config.updatedAt || new Date().toISOString(),
  };
}

function docDataToCustomConfig(data: Record<string, unknown>): CustomEpisodeConfig {
  const rawUpdatedAt = data.updatedAt;
  let isoUpdatedAt: string | undefined;
  if (rawUpdatedAt instanceof Timestamp) {
    isoUpdatedAt = rawUpdatedAt.toDate().toISOString();
  } else if (typeof rawUpdatedAt === 'string') {
    isoUpdatedAt = rawUpdatedAt;
  }

  return {
    driveLink: typeof data.driveLink === 'string' ? data.driveLink : '',
    videoUrl: typeof data.videoUrl === 'string' ? data.videoUrl : '',
    accountLabel: typeof data.accountLabel === 'string' ? data.accountLabel : '',
    backupDriveLinks: Array.isArray(data.backupDriveLinks)
      ? (data.backupDriveLinks as BackupDriveLink[])
      : [],
    subtitles: Array.isArray(data.subtitles) ? (data.subtitles as SubtitleTrack[]) : [],
    updatedAt: isoUpdatedAt,
  };
}

/**
 * Fetch all public episode links from Firestore (available to every visitor).
 */
export async function fetchEpisodeSourcesFromCloud(): Promise<Record<string, CustomEpisodeConfig>> {
  const q = query(collection(db, EPISODE_SOURCES_COLLECTION), where('isPublic', '==', true));
  try {
    const snap = await getDocs(q);
    const cloudSources: Record<string, CustomEpisodeConfig> = {};
    snap.forEach((docSnap) => {
      cloudSources[docSnap.id] = docDataToCustomConfig(docSnap.data());
    });
    return cloudSources;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, EPISODE_SOURCES_COLLECTION);
  }
}

/**
 * Subscribe to real-time updates from Firestore (attached only when user is authenticated).
 */
export function attachRealtimeCloudListener(): () => void {
  const q = query(collection(db, EPISODE_SOURCES_COLLECTION), where('isPublic', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const cloudSources: Record<string, CustomEpisodeConfig> = {};
      snap.forEach((docSnap) => {
        cloudSources[docSnap.id] = docDataToCustomConfig(docSnap.data());
      });

      inMemorySources = {
        ...(bundledSavedSources as Record<string, CustomEpisodeConfig>),
        ...inMemorySources,
        ...cloudSources,
      };
      writeLocalStorageSources(inMemorySources);
      window.dispatchEvent(new CustomEvent(SOURCES_UPDATED_EVENT, { detail: { cloudSynced: true } }));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, EPISODE_SOURCES_COLLECTION);
    }
  );
}

/**
 * Syncs saved episode links from both backend disk API and Firestore cloud storage.
 */
export async function syncEpisodeSourcesFromServer(): Promise<Record<string, CustomEpisodeConfig>> {
  if (typeof window === 'undefined') return inMemorySources;

  let serverSources: Record<string, CustomEpisodeConfig> = {};
  try {
    const res = await fetch('/api/episode-sources', { cache: 'no-store' });
    if (res.ok) {
      const payload = await res.json();
      if (payload?.sources && typeof payload.sources === 'object') {
        serverSources = payload.sources;
      }
    }
  } catch {
    // Ignore transient local backend errors when running static preview
  }

  let cloudSources: Record<string, CustomEpisodeConfig> = {};
  try {
    cloudSources = await fetchEpisodeSourcesFromCloud();
  } catch (err) {
    console.warn('Cloud sync warning:', err);
  }

  const localSources = readLocalStorageSources();
  const localOnlyEntries: Record<string, CustomEpisodeConfig> = {};

  for (const [epId, cfg] of Object.entries(localSources)) {
    if (
      !serverSources[epId] &&
      (cfg?.driveLink || cfg?.videoUrl || (cfg?.backupDriveLinks && cfg.backupDriveLinks.length > 0))
    ) {
      localOnlyEntries[epId] = cfg;
    }
  }

  let merged: Record<string, CustomEpisodeConfig> = {
    ...(bundledSavedSources as Record<string, CustomEpisodeConfig>),
    ...localSources,
    ...serverSources,
    ...cloudSources,
  };

  if (Object.keys(localOnlyEntries).length > 0) {
    try {
      const pushRes = await fetch('/api/episode-sources/bulk/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'merge', sources: localOnlyEntries }),
      });
      if (pushRes.ok) {
        const pushData = await pushRes.json();
        if (pushData?.sources) {
          merged = { ...pushData.sources, ...cloudSources };
        }
      }
    } catch {
      // Ignore transient upload error
    }
  }

  inMemorySources = merged;
  writeLocalStorageSources(merged);
  window.dispatchEvent(new CustomEvent(SOURCES_UPDATED_EVENT, { detail: { synced: true } }));
  return inMemorySources;
}

export function getAllCustomEpisodeSources(): Record<string, CustomEpisodeConfig> {
  if (typeof window === 'undefined') return inMemorySources;
  const local = readLocalStorageSources();
  inMemorySources = {
    ...(bundledSavedSources as Record<string, CustomEpisodeConfig>),
    ...inMemorySources,
    ...local,
  };
  return inMemorySources;
}

export function getCustomEpisodeSource(episodeId: string): CustomEpisodeConfig | null {
  const all = getAllCustomEpisodeSources();
  return all[episodeId] || null;
}

async function upsertEpisodeSourceInCloud(
  episodeId: string,
  entry: CustomEpisodeConfig
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !isVerifiedAdminUser(user)) {
    throw new Error('ADMIN_AUTH_REQUIRED');
  }
  if (!EPISODE_ID_PATTERN.test(episodeId) || episodeId.length > 128) {
    throw new Error(`Invalid episodeId for Firestore: ${episodeId}`);
  }

  const sanitized = sanitizeEpisodeConfigForBlueprint(entry);
  const docPath = `${EPISODE_SOURCES_COLLECTION}/${episodeId}`;
  const docRef = doc(db, EPISODE_SOURCES_COLLECTION, episodeId);

  let existsOnCloud = false;
  try {
    const existingSnap = await getDoc(docRef);
    existsOnCloud = existingSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }

  if (existsOnCloud) {
    try {
      await updateDoc(docRef, {
        driveLink: sanitized.driveLink || '',
        videoUrl: sanitized.videoUrl || sanitized.driveLink || '',
        accountLabel: sanitized.accountLabel || '',
        backupDriveLinks: sanitized.backupDriveLinks || [],
        subtitles: sanitized.subtitles || [],
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
  } else {
    try {
      await setDoc(docRef, {
        episodeId,
        driveLink: sanitized.driveLink || '',
        videoUrl: sanitized.videoUrl || sanitized.driveLink || '',
        accountLabel: sanitized.accountLabel || '',
        backupDriveLinks: sanitized.backupDriveLinks || [],
        subtitles: sanitized.subtitles || [],
        isPublic: true,
        updatedByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    }
  }
}

/**
 * Syncs all existing local/server episode sources to Firebase Firestore once signed in as admin.
 */
export async function syncAllLocalSourcesToCloud(): Promise<{ syncedCount: number }> {
  const user = auth.currentUser;
  if (!user || !isVerifiedAdminUser(user)) {
    return { syncedCount: 0 };
  }

  const allLocal = getAllCustomEpisodeSources();
  const cloudExisting = await fetchEpisodeSourcesFromCloud();

  let syncedCount = 0;
  for (const [epId, cfg] of Object.entries(allLocal)) {
    if (!cloudExisting[epId] && EPISODE_ID_PATTERN.test(epId)) {
      await upsertEpisodeSourceInCloud(epId, cfg);
      syncedCount += 1;
    }
  }
  return { syncedCount };
}

export async function saveCustomEpisodeSource(
  episodeId: string,
  config: CustomEpisodeConfig
): Promise<SaveEpisodeResult> {
  if (typeof window === 'undefined') {
    return { savedToServer: false, savedToCloud: false };
  }

  const sanitized = sanitizeEpisodeConfigForBlueprint({
    ...inMemorySources[episodeId],
    ...config,
    updatedAt: new Date().toISOString(),
  });

  inMemorySources = {
    ...getAllCustomEpisodeSources(),
    [episodeId]: sanitized,
  };

  writeLocalStorageSources(inMemorySources);
  window.dispatchEvent(new CustomEvent(SOURCES_UPDATED_EVENT, { detail: { episodeId } }));

  let savedToServer = false;
  try {
    const res = await fetch(`/api/episode-sources/${encodeURIComponent(episodeId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sanitized),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.sources) {
        inMemorySources = { ...data.sources, [episodeId]: sanitized };
        writeLocalStorageSources(inMemorySources);
      }
      savedToServer = true;
    }
  } catch (e) {
    console.error('Failed to persist episode source to server:', e);
  }

  let savedToCloud = false;
  let cloudError: string | undefined;
  if (auth.currentUser && isVerifiedAdminUser(auth.currentUser)) {
    try {
      await upsertEpisodeSourceInCloud(episodeId, sanitized);
      savedToCloud = true;
    } catch (err) {
      cloudError = err instanceof Error ? err.message : String(err);
    }
  } else {
    cloudError = 'ADMIN_AUTH_REQUIRED';
  }

  return { savedToServer, savedToCloud, cloudError };
}

export async function removeCustomEpisodeSource(episodeId: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const all = { ...getAllCustomEpisodeSources() };
  delete all[episodeId];
  inMemorySources = all;
  writeLocalStorageSources(inMemorySources);
  window.dispatchEvent(new CustomEvent(SOURCES_UPDATED_EVENT, { detail: { episodeId } }));

  let serverOk = false;
  try {
    const res = await fetch(`/api/episode-sources/${encodeURIComponent(episodeId)}`, {
      method: 'DELETE',
    });
    serverOk = res.ok;
  } catch (e) {
    console.error('Failed to delete episode source on server:', e);
  }

  if (auth.currentUser && isVerifiedAdminUser(auth.currentUser) && EPISODE_ID_PATTERN.test(episodeId)) {
    const docPath = `${EPISODE_SOURCES_COLLECTION}/${episodeId}`;
    try {
      await deleteDoc(doc(db, EPISODE_SOURCES_COLLECTION, episodeId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    }
  }

  return serverOk;
}

export function exportCustomSourcesBackup(): string {
  const all = getAllCustomEpisodeSources();
  return JSON.stringify(all, null, 2);
}

export function downloadEpisodeSourcesBackupFile(): void {
  if (typeof window === 'undefined') return;
  const json = exportCustomSourcesBackup();
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `aniverse-links-backup-${dateStamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importCustomSourcesBackup(
  jsonString: string,
  mode: 'merge' | 'replace' = 'merge'
): Promise<boolean> {
  try {
    const parsed = JSON.parse(jsonString);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const next =
        mode === 'replace'
          ? parsed
          : {
              ...getAllCustomEpisodeSources(),
              ...parsed,
            };

      inMemorySources = next;
      writeLocalStorageSources(next);
      window.dispatchEvent(new CustomEvent(SOURCES_UPDATED_EVENT, { detail: { imported: true } }));

      try {
        const res = await fetch('/api/episode-sources/bulk/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, sources: parsed }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.sources) {
            inMemorySources = data.sources;
            writeLocalStorageSources(inMemorySources);
          }
        }
      } catch {
        // Keep local copy even if offline
      }

      if (auth.currentUser && isVerifiedAdminUser(auth.currentUser)) {
        for (const [epId, cfg] of Object.entries(parsed as Record<string, CustomEpisodeConfig>)) {
          if (EPISODE_ID_PATTERN.test(epId) && cfg && typeof cfg === 'object') {
            await upsertEpisodeSourceInCloud(epId, cfg);
          }
        }
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Default multi-language VTT subtitle tracks ready to test
export const DEFAULT_SUBTITLE_TRACKS: SubtitleTrack[] = [
  {
    id: 'sub-ar',
    lang: 'ar',
    label: 'العربية (Arabic)',
    src: '/subtitles/arabic.vtt',
    default: true,
  },
  {
    id: 'sub-en',
    lang: 'en',
    label: 'English (الإنجليزية)',
    src: '/subtitles/english.vtt',
    default: false,
  },
];
