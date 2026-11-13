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
 * Only http(s) URLs and same-site paths are allowed as media/subtitle links. Anything else
 * (e.g. "javascript:" or "data:text/html") becomes '' so it can never reach a <video>/<iframe> src.
 */
export function safeMediaUrl(value: unknown, maxLength = 1000): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().slice(0, maxLength);
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  // In-tab subtitle previews created by the admin dashboard
  if (trimmed.startsWith('blob:')) return trimmed;
  return '';
}

function sanitizeLoadedConfig(cfg: unknown): CustomEpisodeConfig | null {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return null;
  const c = cfg as CustomEpisodeConfig;
  return {
    ...c,
    videoUrl: safeMediaUrl(c.videoUrl),
    driveLink: safeMediaUrl(c.driveLink),
    backupDriveLinks: Array.isArray(c.backupDriveLinks)
      ? c.backupDriveLinks
          .filter((b) => b && typeof b === 'object')
          .map((b) => ({ ...b, url: safeMediaUrl(b.url) }))
          .filter((b) => b.url)
      : [],
    subtitles: Array.isArray(c.subtitles)
      ? c.subtitles
          .filter((s) => s && typeof s === 'object')
          .map((s) => ({ ...s, src: safeMediaUrl(s.src, 500) }))
          .filter((s) => s.src)
      : [],
  };
}

/** Applies sanitizeLoadedConfig to every entry of a sources map coming from the server, cloud or cache. */
function sanitizeLoadedSources(map: unknown): Record<string, CustomEpisodeConfig> {
  const out: Record<string, CustomEpisodeConfig> = {};
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
  for (const [id, cfg] of Object.entries(map as Record<string, unknown>)) {
    if (id === '__proto__' || id === 'constructor' || id === 'prototype') continue;
    const clean = sanitizeLoadedConfig(cfg);
    if (clean) out[id] = clean;
  }
  return out;
}

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
    return sanitizeLoadedSources(raw ? JSON.parse(raw) : {});
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

// Episode IDs edited in this browser that have not reached the server or Firestore yet.
// They are kept on top of fresh remote data and retried on the next sync, instead of being lost.
const PENDING_SOURCES_STORAGE_KEY = 'aniverse_pending_episode_sources_v1';

function readPendingEpisodeIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_SOURCES_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function setEpisodePending(episodeId: string, pending: boolean): void {
  if (typeof window === 'undefined') return;
  const ids = new Set(readPendingEpisodeIds());
  if (pending) ids.add(episodeId);
  else ids.delete(episodeId);
  try {
    if (ids.size > 0) localStorage.setItem(PENDING_SOURCES_STORAGE_KEY, JSON.stringify([...ids]));
    else localStorage.removeItem(PENDING_SOURCES_STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode / quota) — nothing else to do
  }
}

/**
 * Authorization header for the server's write endpoints (they require the verified admin's Firebase ID token).
 * Returns null when no admin is signed in, so callers can skip requests that would be rejected anyway.
 */
async function getAdminAuthHeaders(): Promise<Record<string, string> | null> {
  const user = auth.currentUser;
  if (!user || !isVerifiedAdminUser(user)) return null;
  try {
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  } catch {
    return null;
  }
}

let inMemorySources: Record<string, CustomEpisodeConfig> = {
  ...sanitizeLoadedSources(bundledSavedSources),
  ...readLocalStorageSources(),
};

// IDs present in the last Firestore snapshot, so deletions made by the admin also disappear for visitors
let lastCloudEpisodeIds = new Set<string>();

function sanitizeEpisodeConfigForBlueprint(config: CustomEpisodeConfig): CustomEpisodeConfig {
  const driveLink = safeMediaUrl(config.driveLink ? normalizeDriveDirectUrl(config.driveLink) : '');
  const videoUrl = safeMediaUrl(config.videoUrl ? normalizeDriveDirectUrl(config.videoUrl) : driveLink);
  const accountLabel = (config.accountLabel || '').trim().slice(0, 120);

  const backupDriveLinks = Array.isArray(config.backupDriveLinks)
    ? config.backupDriveLinks
        .filter((b) => b && b.url && b.url.trim())
        .slice(0, 10)
        .map((b, i) => ({
          id: String(b.id || `backup-${Date.now()}-${i}`).slice(0, 80),
          url: safeMediaUrl(normalizeDriveDirectUrl(b.url)),
          accountLabel: String(b.accountLabel || '').trim().slice(0, 120),
        }))
        .filter((b) => b.url)
    : [];

  const subtitles = Array.isArray(config.subtitles)
    ? config.subtitles.slice(0, 10).map((s, i) => ({
        id: String(s.id || `sub-${i}`).slice(0, 60),
        lang: String(s.lang || 'ar').slice(0, 24),
        label: String(s.label || 'Subtitle').slice(0, 80),
        src: safeMediaUrl(s.src, 500),
        default: Boolean(s.default),
      }))
      .filter((s) => s.src)
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

  return (
    sanitizeLoadedConfig({
      driveLink: typeof data.driveLink === 'string' ? data.driveLink : '',
      videoUrl: typeof data.videoUrl === 'string' ? data.videoUrl : '',
      accountLabel: typeof data.accountLabel === 'string' ? data.accountLabel : '',
      backupDriveLinks: Array.isArray(data.backupDriveLinks)
        ? (data.backupDriveLinks as BackupDriveLink[])
        : [],
      subtitles: Array.isArray(data.subtitles) ? (data.subtitles as SubtitleTrack[]) : [],
      updatedAt: isoUpdatedAt,
    }) || {}
  );
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

      // Drop entries that were deleted from Firestore since the previous snapshot
      const pendingIds = new Set(readPendingEpisodeIds());
      const next = { ...inMemorySources };
      for (const id of lastCloudEpisodeIds) {
        if (!(id in cloudSources) && !pendingIds.has(id)) delete next[id];
      }
      lastCloudEpisodeIds = new Set(Object.keys(cloudSources));

      inMemorySources = { ...next, ...cloudSources };
      writeLocalStorageSources(inMemorySources);
      window.dispatchEvent(new CustomEvent(SOURCES_UPDATED_EVENT, { detail: { cloudSynced: true } }));
    },
    (error) => {
      // Don't throw from inside the listener callback (it would surface as an uncaught error)
      console.warn('Realtime episode-sources listener error:', error);
    }
  );
}

/**
 * Sends one episode source to the server (disk) and to Firestore. Never throws.
 */
async function persistEpisodeSourceRemotely(
  episodeId: string,
  sanitized: CustomEpisodeConfig
): Promise<SaveEpisodeResult> {
  const authHeaders = await getAdminAuthHeaders();
  if (!authHeaders) {
    return { savedToServer: false, savedToCloud: false, cloudError: 'ADMIN_AUTH_REQUIRED' };
  }

  let savedToServer = false;
  try {
    const res = await fetch(`/api/episode-sources/${encodeURIComponent(episodeId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(sanitized),
    });
    savedToServer = res.ok;
  } catch (e) {
    console.error('Failed to persist episode source to server:', e);
  }

  let savedToCloud = false;
  let cloudError: string | undefined;
  try {
    await upsertEpisodeSourceInCloud(episodeId, sanitized);
    savedToCloud = true;
  } catch (err) {
    cloudError = err instanceof Error ? err.message : String(err);
  }

  return { savedToServer, savedToCloud, cloudError };
}

/**
 * Syncs saved episode links from both backend disk API and Firestore cloud storage.
 */
export async function syncEpisodeSourcesFromServer(): Promise<Record<string, CustomEpisodeConfig>> {
  if (typeof window === 'undefined') return inMemorySources;

  let serverSources: Record<string, CustomEpisodeConfig> = {};
  let serverOk = false;
  try {
    const res = await fetch('/api/episode-sources', { cache: 'no-store' });
    if (res.ok) {
      const payload = await res.json();
      if (payload?.sources && typeof payload.sources === 'object') {
        serverSources = sanitizeLoadedSources(payload.sources);
        serverOk = true;
      }
    }
  } catch {
    // Ignore transient local backend errors when running static preview
  }

  let cloudSources: Record<string, CustomEpisodeConfig> = {};
  let cloudOk = false;
  try {
    cloudSources = await fetchEpisodeSourcesFromCloud();
    cloudOk = true;
    lastCloudEpisodeIds = new Set(Object.keys(cloudSources));
  } catch (err) {
    console.warn('Cloud sync warning:', err);
  }

  const bundled = sanitizeLoadedSources(bundledSavedSources);
  const localSources = readLocalStorageSources();

  // The live server file supersedes the build-time bundled snapshot, and Firestore has the final say.
  // localStorage is only an offline cache: using it on top of fresh data would keep links the admin
  // has since deleted or replaced alive forever in returning visitors' browsers.
  let merged: Record<string, CustomEpisodeConfig> =
    serverOk || cloudOk
      ? { ...(serverOk ? serverSources : bundled), ...cloudSources }
      : { ...bundled, ...localSources };

  // Edits made in this browser that never reached the server/cloud stay on top and are retried (admin only)
  const pendingIds = readPendingEpisodeIds();
  for (const epId of pendingIds) {
    const cfg = localSources[epId];
    if (!cfg) {
      setEpisodePending(epId, false);
      continue;
    }
    merged[epId] = cfg;
    if (auth.currentUser && isVerifiedAdminUser(auth.currentUser)) {
      const result = await persistEpisodeSourceRemotely(epId, cfg);
      if (result.savedToServer || result.savedToCloud) {
        setEpisodePending(epId, false);
      }
    }
  }

  inMemorySources = merged;
  writeLocalStorageSources(merged);
  window.dispatchEvent(new CustomEvent(SOURCES_UPDATED_EVENT, { detail: { synced: true } }));
  return inMemorySources;
}

export function getAllCustomEpisodeSources(): Record<string, CustomEpisodeConfig> {
  // inMemorySources is seeded from the bundle + localStorage at startup and kept in step with
  // localStorage by every writer below. Re-merging the bundle here used to resurrect deleted links.
  return inMemorySources;
}

export function getCustomEpisodeSource(episodeId: string): CustomEpisodeConfig | null {
  const all = getAllCustomEpisodeSources();
  return all[episodeId] || null;
}

/** True when the admin has saved any usable link (primary, direct video or a backup server) for this episode. */
export function hasCustomPlayableSource(episodeId: string): boolean {
  const cfg = inMemorySources[episodeId];
  if (!cfg) return false;
  return Boolean(
    cfg.driveLink?.trim() ||
      cfg.videoUrl?.trim() ||
      (Array.isArray(cfg.backupDriveLinks) && cfg.backupDriveLinks.some((b) => b?.url?.trim()))
  );
}

/**
 * Single rule for "can this episode be played": not marked coming-soon in the catalog,
 * or the admin has linked a source for it. Use this everywhere instead of checking isComingSoon alone.
 */
export function isEpisodePlayable(ep: { id: string; isComingSoon?: boolean } | null | undefined): boolean {
  if (!ep) return false;
  return !ep.isComingSoon || hasCustomPlayableSource(ep.id);
}

/** The bundled /subtitles/arabic.vtt and english.vtt are demo placeholders, not real subtitles for any episode. */
export function isDemoSubtitleSrc(src: string | undefined): boolean {
  const s = (src || '').trim();
  return s === '/subtitles/arabic.vtt' || s === '/subtitles/english.vtt';
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
      // One failing entry must not abort the rest of the migration
      try {
        await upsertEpisodeSourceInCloud(epId, cfg);
        syncedCount += 1;
      } catch (err) {
        console.error(`Failed to upload episode source ${epId} to Firestore:`, err);
      }
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

  const result = await persistEpisodeSourceRemotely(episodeId, sanitized);
  setEpisodePending(episodeId, !result.savedToServer && !result.savedToCloud);
  return result;
}

export interface RemoveEpisodeResult {
  removedFromServer: boolean;
  removedFromCloud: boolean;
  cloudError?: string;
}

/**
 * Removes an episode's custom source locally, on the server and in Firestore. Never throws.
 */
export async function removeCustomEpisodeSource(episodeId: string): Promise<RemoveEpisodeResult> {
  if (typeof window === 'undefined') {
    return { removedFromServer: false, removedFromCloud: false };
  }
  const all = { ...getAllCustomEpisodeSources() };
  delete all[episodeId];
  inMemorySources = all;
  writeLocalStorageSources(inMemorySources);
  setEpisodePending(episodeId, false);
  window.dispatchEvent(new CustomEvent(SOURCES_UPDATED_EVENT, { detail: { episodeId } }));

  const authHeaders = await getAdminAuthHeaders();
  if (!authHeaders) {
    return { removedFromServer: false, removedFromCloud: false, cloudError: 'ADMIN_AUTH_REQUIRED' };
  }

  let removedFromServer = false;
  try {
    const res = await fetch(`/api/episode-sources/${encodeURIComponent(episodeId)}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    removedFromServer = res.ok;
  } catch (e) {
    console.error('Failed to delete episode source on server:', e);
  }

  let removedFromCloud = false;
  let cloudError: string | undefined;
  if (EPISODE_ID_PATTERN.test(episodeId)) {
    try {
      await deleteDoc(doc(db, EPISODE_SOURCES_COLLECTION, episodeId));
      removedFromCloud = true;
    } catch (error) {
      cloudError = error instanceof Error ? error.message : String(error);
      console.error('Failed to delete episode source in Firestore:', error);
    }
  }

  return { removedFromServer, removedFromCloud, cloudError };
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
    const rawParsed = JSON.parse(jsonString);
    if (typeof rawParsed === 'object' && rawParsed !== null && !Array.isArray(rawParsed)) {
      const parsed = sanitizeLoadedSources(rawParsed);
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

      const authHeaders = await getAdminAuthHeaders();
      if (authHeaders) {
        try {
          await fetch('/api/episode-sources/bulk/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ mode, sources: parsed }),
          });
        } catch {
          // Keep local copy even if offline
        }

        // One bad entry must not abort the rest of the upload
        for (const [epId, cfg] of Object.entries(parsed as Record<string, CustomEpisodeConfig>)) {
          if (EPISODE_ID_PATTERN.test(epId) && cfg && typeof cfg === 'object') {
            try {
              await upsertEpisodeSourceInCloud(epId, cfg);
            } catch (err) {
              console.error(`Failed to upload imported source ${epId} to Firestore:`, err);
            }
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
