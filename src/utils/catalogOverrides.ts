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
import {
  ALL_MEDIA_WORKS,
  ANIME_WORKS,
  DUBBED_WORKS,
  DubEpisode,
  DubSeason,
  DubSeries,
  MOVIES_WORKS,
  TV_SERIES_WORKS,
} from '../data/mockData.ts';
import {
  deleteCustomWorkFromCloud,
  getCustomSeriesByCategory,
  getCustomWorkRecords,
  saveCustomWorkToCloud,
  CustomWorkCategory,
} from './customWorks.ts';
import {
  getCustomEpisodeSource,
  saveCustomEpisodeSource,
  SOURCES_UPDATED_EVENT,
  truncateUtf8,
} from './videoSource.ts';

export interface CatalogOverrideRecord {
  seriesId: string;
  isDeleted: boolean;
  title: string;
  originalTitle: string;
  coverImage: string;
  bannerImage: string;
  genres: string[];
  dubStudio: string;
  rating: number;
  synopsis: string;
  updatedAt?: string;
}

export interface CompactEpisodeOverride {
  id: string;
  episodeNumber: number;
  title: string;
  duration: string;
  thumbnail?: string;
  description: string;
  isComingSoon: boolean;
  isMerged: boolean;
}

export interface SeasonOverrideRecord {
  overrideId: string;
  seriesId: string;
  seasonId: string;
  seasonTitle: string;
  episodes: CompactEpisodeOverride[];
  updatedAt?: string;
}

const CATALOG_OVERRIDES_COLLECTION = 'catalogOverrides';
const SEASON_OVERRIDES_COLLECTION = 'seasonOverrides';
const CATALOG_OVERRIDES_STORAGE_KEY = 'aniverse_catalog_overrides_v1';
const SEASON_OVERRIDES_STORAGE_KEY = 'aniverse_season_overrides_v1';
export const CATALOG_OVERRIDES_UPDATED_EVENT = 'aniverse_catalog_overrides_updated';
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

function readLocalJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Failed to mirror ${key} to localStorage:`, e);
  }
}

let inMemoryCatalogOverrides: Record<string, CatalogOverrideRecord> = readLocalJson(
  CATALOG_OVERRIDES_STORAGE_KEY,
  {}
);
let inMemorySeasonOverrides: Record<string, SeasonOverrideRecord> = readLocalJson(
  SEASON_OVERRIDES_STORAGE_KEY,
  {}
);

function dispatchOverridesUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CATALOG_OVERRIDES_UPDATED_EVENT));
  window.dispatchEvent(new CustomEvent(SOURCES_UPDATED_EVENT));
}

export function getSeasonOverrideDocId(seriesId: string, seasonId: string): string {
  const cleanSeries = seriesId.replace(/[^a-zA-Z0-9_-]/g, '-');
  const cleanSeason = seasonId.replace(/[^a-zA-Z0-9_-]/g, '-');
  const combined = `${cleanSeries}__${cleanSeason}`;
  if (combined.length <= 120) return combined;
  // Deterministic compact fallback keeping under 128-char Firestore rule limit
  let hash = 0;
  for (let i = 0; i < combined.length; i += 1) {
    hash = (hash * 31 + combined.charCodeAt(i)) >>> 0;
  }
  return `${cleanSeries.slice(0, 52)}__${cleanSeason.slice(0, 52)}_${hash.toString(36)}`.slice(
    0,
    120
  );
}

function parseTimestampIso(val: unknown): string | undefined {
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === 'string') return val;
  return undefined;
}

function docToCatalogOverride(
  seriesId: string,
  data: Record<string, unknown>
): CatalogOverrideRecord {
  return {
    seriesId,
    isDeleted: Boolean(data.isDeleted),
    title: String(data.title || ''),
    originalTitle: String(data.originalTitle || ''),
    coverImage: String(data.coverImage || ''),
    bannerImage: String(data.bannerImage || ''),
    genres: Array.isArray(data.genres) ? data.genres.map((g) => String(g)) : [],
    dubStudio: String(data.dubStudio || ''),
    rating: typeof data.rating === 'number' ? data.rating : 0,
    synopsis: String(data.synopsis || ''),
    updatedAt: parseTimestampIso(data.updatedAt),
  };
}

function normalizeEpisodeItem(raw: unknown, idx: number): CompactEpisodeOverride | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = String(obj.id || `ep-${idx + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
  if (!id) return null;
  return {
    id,
    episodeNumber: typeof obj.episodeNumber === 'number' ? obj.episodeNumber : idx + 1,
    title: String(obj.title || `الحلقة ${idx + 1}`),
    duration: String(obj.duration || '11:00'),
    thumbnail: obj.thumbnail ? String(obj.thumbnail) : undefined,
    description: String(obj.description || ''),
    isComingSoon: obj.isComingSoon !== undefined ? Boolean(obj.isComingSoon) : true,
    isMerged: Boolean(obj.isMerged),
  };
}

function docToSeasonOverride(
  overrideId: string,
  data: Record<string, unknown>
): SeasonOverrideRecord {
  const rawEps = Array.isArray(data.episodes) ? data.episodes : [];
  const episodes: CompactEpisodeOverride[] = rawEps
    .map((item, idx) => normalizeEpisodeItem(item, idx))
    .filter((x): x is CompactEpisodeOverride => Boolean(x));

  return {
    overrideId,
    seriesId: String(data.seriesId || ''),
    seasonId: String(data.seasonId || ''),
    seasonTitle: String(data.seasonTitle || ''),
    episodes,
    updatedAt: parseTimestampIso(data.updatedAt),
  };
}

export async function syncCatalogOverridesFromCloud(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const [catSnap, seasonSnap] = await Promise.all([
      getDocs(query(collection(db, CATALOG_OVERRIDES_COLLECTION), where('isPublic', '==', true))),
      getDocs(query(collection(db, SEASON_OVERRIDES_COLLECTION), where('isPublic', '==', true))),
    ]);

    const nextCatalog: Record<string, CatalogOverrideRecord> = {};
    catSnap.forEach((docSnap) => {
      nextCatalog[docSnap.id] = docToCatalogOverride(docSnap.id, docSnap.data());
    });

    const nextSeasons: Record<string, SeasonOverrideRecord> = {};
    seasonSnap.forEach((docSnap) => {
      nextSeasons[docSnap.id] = docToSeasonOverride(docSnap.id, docSnap.data());
    });

    inMemoryCatalogOverrides = nextCatalog;
    inMemorySeasonOverrides = nextSeasons;
    writeLocalJson(CATALOG_OVERRIDES_STORAGE_KEY, nextCatalog);
    writeLocalJson(SEASON_OVERRIDES_STORAGE_KEY, nextSeasons);
    dispatchOverridesUpdated();
  } catch (error) {
    console.warn('Catalog overrides cloud sync skipped or failed:', error);
  }
}

export function attachCatalogOverridesRealtimeListener(): () => void {
  const qCatalog = query(
    collection(db, CATALOG_OVERRIDES_COLLECTION),
    where('isPublic', '==', true)
  );
  const qSeason = query(
    collection(db, SEASON_OVERRIDES_COLLECTION),
    where('isPublic', '==', true)
  );

  const unsubCat = onSnapshot(
    qCatalog,
    (snap) => {
      const next: Record<string, CatalogOverrideRecord> = {};
      snap.forEach((docSnap) => {
        next[docSnap.id] = docToCatalogOverride(docSnap.id, docSnap.data());
      });
      inMemoryCatalogOverrides = next;
      writeLocalJson(CATALOG_OVERRIDES_STORAGE_KEY, next);
      dispatchOverridesUpdated();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, CATALOG_OVERRIDES_COLLECTION);
    }
  );

  const unsubSeason = onSnapshot(
    qSeason,
    (snap) => {
      const next: Record<string, SeasonOverrideRecord> = {};
      snap.forEach((docSnap) => {
        next[docSnap.id] = docToSeasonOverride(docSnap.id, docSnap.data());
      });
      inMemorySeasonOverrides = next;
      writeLocalJson(SEASON_OVERRIDES_STORAGE_KEY, next);
      dispatchOverridesUpdated();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, SEASON_OVERRIDES_COLLECTION);
    }
  );

  return () => {
    unsubCat();
    unsubSeason();
  };
}

export function isEpisodeDetectedAsMerged(ep: Pick<DubEpisode, 'title' | 'isMerged'>): boolean {
  if (ep.isMerged === true) return true;
  if (ep.isMerged === false) return false;
  return /مدمجة|2\s*في\s*1|&/.test(ep.title || '');
}

export function isSeriesDeleted(seriesId: string): boolean {
  return Boolean(inMemoryCatalogOverrides[seriesId]?.isDeleted);
}

export function hasSeriesMetadataOverride(seriesId: string): boolean {
  const ov = inMemoryCatalogOverrides[seriesId];
  if (!ov) return false;
  return Boolean(
    ov.isDeleted ||
      ov.title ||
      ov.originalTitle ||
      ov.coverImage ||
      ov.bannerImage ||
      ov.genres.length > 0 ||
      ov.dubStudio ||
      ov.rating > 0 ||
      ov.synopsis
  );
}

export function hasSeasonOverride(seriesId: string, seasonId: string): boolean {
  const key = getSeasonOverrideDocId(seriesId, seasonId);
  return Boolean(inMemorySeasonOverrides[key]);
}

export function applyOverridesToSeries(series: DubSeries): DubSeries {
  const catOv = inMemoryCatalogOverrides[series.id];

  const mergedTitle = catOv?.title?.trim() || series.title;
  const mergedOriginalTitle = catOv?.originalTitle?.trim() || series.originalTitle;
  const mergedCover = catOv?.coverImage?.trim() || series.coverImage;
  const mergedBanner = catOv?.bannerImage?.trim() || catOv?.coverImage?.trim() || series.bannerImage;
  const mergedGenres = catOv?.genres && catOv.genres.length > 0 ? catOv.genres : series.genres;
  const mergedStudio = catOv?.dubStudio?.trim() || series.dubStudio;
  const mergedRating = catOv && catOv.rating > 0 ? catOv.rating : series.rating;
  const mergedSynopsis = catOv?.synopsis?.trim() || series.synopsis;

  const baseSeasons: DubSeason[] =
    series.seasons && series.seasons.length > 0
      ? series.seasons
      : [
          {
            id: `${series.id}-season-1`,
            seasonNumber: 1,
            title: 'الموسم الأول',
            episodesCount: series.episodes.length,
            episodes: series.episodes,
          },
        ];

  const effectiveSeasons: DubSeason[] = baseSeasons.map((season) => {
    const key = getSeasonOverrideDocId(series.id, season.id);
    const sOv = inMemorySeasonOverrides[key];

    if (!sOv) {
      const normalizedEps = (season.episodes || []).map((ep) => ({
        ...ep,
        thumbnail: ep.thumbnail || mergedCover,
      }));
      return {
        ...season,
        episodesCount: normalizedEps.length,
        episodes: normalizedEps,
      };
    }

    const existingMap = new Map<string, DubEpisode>();
    (season.episodes || []).forEach((ep) => existingMap.set(ep.id, ep));

    const effectiveEps: DubEpisode[] = sOv.episodes.map((compact, idx) => {
      const base = existingMap.get(compact.id);
      return {
        id: compact.id,
        episodeNumber: compact.episodeNumber || idx + 1,
        title: compact.title,
        duration: compact.duration || '11:00',
        thumbnail: compact.thumbnail || base?.thumbnail || mergedCover,
        videoUrl: base?.videoUrl || '',
        driveLink: base?.driveLink,
        subtitles: base?.subtitles,
        dubStudio: base?.dubStudio || mergedStudio,
        voiceActors: base?.voiceActors || [mergedStudio],
        releaseDate: base?.releaseDate || 'جاهزة للربط عبر درايف',
        description: compact.description || base?.description || mergedSynopsis,
        isComingSoon: compact.isComingSoon,
        isMerged: compact.isMerged,
      };
    });

    return {
      ...season,
      title: sOv.seasonTitle?.trim() || season.title,
      episodesCount: effectiveEps.length,
      episodes: effectiveEps,
    };
  });

  const totalEpisodesCount = effectiveSeasons.reduce(
    (sum, s) => sum + (s.episodes?.length || 0),
    0
  );

  return {
    ...series,
    title: mergedTitle,
    originalTitle: mergedOriginalTitle,
    coverImage: mergedCover,
    bannerImage: mergedBanner,
    genres: mergedGenres,
    dubStudio: mergedStudio,
    rating: mergedRating,
    synopsis: mergedSynopsis,
    seasons: effectiveSeasons,
    episodes: effectiveSeasons[0]?.episodes || [],
    episodesCount: totalEpisodesCount,
  };
}

export function getEffectiveWorksByCategory(category: CustomWorkCategory): DubSeries[] {
  const builtIn =
    category === 'anime'
      ? ANIME_WORKS
      : category === 'movie'
      ? MOVIES_WORKS
      : category === 'tv'
      ? TV_SERIES_WORKS
      : DUBBED_WORKS;
  const combined = [...builtIn, ...getCustomSeriesByCategory(category)];
  return combined
    .filter((s) => !isSeriesDeleted(s.id))
    .map(applyOverridesToSeries);
}

export function getAllEffectiveMediaWorks(): DubSeries[] {
  return [
    ...getEffectiveWorksByCategory('dubbed'),
    ...getEffectiveWorksByCategory('anime'),
    ...getEffectiveWorksByCategory('tv'),
    ...getEffectiveWorksByCategory('movie'),
  ];
}

export function getDeletedBuiltInWorks(): DubSeries[] {
  return ALL_MEDIA_WORKS.filter((s) => isSeriesDeleted(s.id)).map(applyOverridesToSeries);
}

export function isCustomWorkId(seriesId: string): boolean {
  return getCustomWorkRecords().some((w) => w.workId === seriesId);
}

export interface EditSeriesFieldsInput {
  category: CustomWorkCategory;
  title: string;
  originalTitle: string;
  coverImage: string;
  bannerImage?: string;
  genres: string[];
  dubStudio: string;
  rating: number;
  synopsis: string;
  seasonsCount?: number;
  episodesCount?: number;
}

export async function editAnySeriesInCloud(
  series: DubSeries,
  fields: EditSeriesFieldsInput
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !isVerifiedAdminUser(user)) {
    throw new Error('ADMIN_AUTH_REQUIRED');
  }

  // If this is a custom-created work, update customWorks doc directly
  if (isCustomWorkId(series.id)) {
    const existingCustom = getCustomWorkRecords().find((w) => w.workId === series.id);
    await saveCustomWorkToCloud({
      workId: series.id,
      category: fields.category,
      title: fields.title,
      originalTitle: fields.originalTitle,
      coverImage: fields.coverImage,
      bannerImage: fields.bannerImage || fields.coverImage,
      genres: fields.genres,
      dubStudio: fields.dubStudio,
      rating: fields.rating,
      seasonsCount:
        fields.seasonsCount ?? existingCustom?.seasonsCount ?? Math.max(1, series.seasons.length),
      episodesCount:
        fields.episodesCount ?? existingCustom?.episodesCount ?? Math.max(1, series.episodesCount),
      synopsis: fields.synopsis,
    });
    return;
  }

  // Built-in work -> save metadata override in catalogOverrides/{seriesId}
  const seriesId = series.id;
  if (!VALID_ID_REGEX.test(seriesId) || seriesId.length > 128) {
    throw new Error('معرّف العمل غير صالح.');
  }

  const sanitizedGenres = fields.genres
    .map((g) => truncateUtf8(g.trim(), 40))
    .filter(Boolean)
    .slice(0, 8);

  const sanitizedTitle = truncateUtf8(fields.title.trim(), 200);
  const sanitizedOriginal = truncateUtf8(fields.originalTitle.trim(), 200);
  const sanitizedCover = truncateUtf8(fields.coverImage.trim(), 400000);
  const sanitizedBanner = truncateUtf8(
    (fields.bannerImage || fields.coverImage).trim(),
    400000
  );
  const sanitizedStudio = truncateUtf8(fields.dubStudio.trim(), 120);
  const sanitizedRating = Math.min(10, Math.max(0, Number(fields.rating) || 0));
  const sanitizedSynopsis = truncateUtf8(fields.synopsis.trim(), 4000);

  const docPath = `${CATALOG_OVERRIDES_COLLECTION}/${seriesId}`;
  const docRef = doc(db, CATALOG_OVERRIDES_COLLECTION, seriesId);

  let existsOnCloud = false;
  try {
    const snap = await getDoc(docRef);
    existsOnCloud = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }

  const payload = {
    isDeleted: Boolean(inMemoryCatalogOverrides[seriesId]?.isDeleted),
    title: sanitizedTitle,
    originalTitle: sanitizedOriginal,
    coverImage: sanitizedCover,
    bannerImage: sanitizedBanner,
    genres: sanitizedGenres,
    dubStudio: sanitizedStudio,
    rating: sanitizedRating,
    synopsis: sanitizedSynopsis,
    updatedByUid: user.uid,
    updatedAt: serverTimestamp(),
  };

  if (existsOnCloud) {
    try {
      await updateDoc(docRef, payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
  } else {
    try {
      await setDoc(docRef, {
        seriesId,
        ...payload,
        isPublic: true,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    }
  }

  inMemoryCatalogOverrides = {
    ...inMemoryCatalogOverrides,
    [seriesId]: {
      seriesId,
      isDeleted: payload.isDeleted,
      title: sanitizedTitle,
      originalTitle: sanitizedOriginal,
      coverImage: sanitizedCover,
      bannerImage: sanitizedBanner,
      genres: sanitizedGenres,
      dubStudio: sanitizedStudio,
      rating: sanitizedRating,
      synopsis: sanitizedSynopsis,
      updatedAt: new Date().toISOString(),
    },
  };
  writeLocalJson(CATALOG_OVERRIDES_STORAGE_KEY, inMemoryCatalogOverrides);
  dispatchOverridesUpdated();
}

export async function deleteAnySeriesInCloud(series: DubSeries): Promise<'deleted_custom' | 'hidden_builtin'> {
  const user = auth.currentUser;
  if (!user || !isVerifiedAdminUser(user)) {
    throw new Error('ADMIN_AUTH_REQUIRED');
  }

  if (isCustomWorkId(series.id)) {
    await deleteCustomWorkFromCloud(series.id);
    // Clean up any season overrides belonging to this custom work
    for (const s of series.seasons || []) {
      const ovKey = getSeasonOverrideDocId(series.id, s.id);
      if (inMemorySeasonOverrides[ovKey]) {
        await resetSeasonOverrideInCloud(series.id, s.id);
      }
    }
    return 'deleted_custom';
  }

  const seriesId = series.id;
  if (!VALID_ID_REGEX.test(seriesId) || seriesId.length > 128) {
    throw new Error('معرّف العمل غير صالح.');
  }

  const existing = inMemoryCatalogOverrides[seriesId];
  const docPath = `${CATALOG_OVERRIDES_COLLECTION}/${seriesId}`;
  const docRef = doc(db, CATALOG_OVERRIDES_COLLECTION, seriesId);

  let existsOnCloud = false;
  try {
    const snap = await getDoc(docRef);
    existsOnCloud = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }

  const payload = {
    isDeleted: true,
    title: existing?.title || '',
    originalTitle: existing?.originalTitle || '',
    coverImage: existing?.coverImage || '',
    bannerImage: existing?.bannerImage || '',
    genres: existing?.genres || [],
    dubStudio: existing?.dubStudio || '',
    rating: existing?.rating || 0,
    synopsis: existing?.synopsis || '',
    updatedByUid: user.uid,
    updatedAt: serverTimestamp(),
  };

  if (existsOnCloud) {
    try {
      await updateDoc(docRef, {
        isDeleted: true,
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
  } else {
    try {
      await setDoc(docRef, {
        seriesId,
        ...payload,
        isPublic: true,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    }
  }

  inMemoryCatalogOverrides = {
    ...inMemoryCatalogOverrides,
    [seriesId]: {
      seriesId,
      isDeleted: true,
      title: payload.title,
      originalTitle: payload.originalTitle,
      coverImage: payload.coverImage,
      bannerImage: payload.bannerImage,
      genres: payload.genres,
      dubStudio: payload.dubStudio,
      rating: payload.rating,
      synopsis: payload.synopsis,
      updatedAt: new Date().toISOString(),
    },
  };
  writeLocalJson(CATALOG_OVERRIDES_STORAGE_KEY, inMemoryCatalogOverrides);
  dispatchOverridesUpdated();
  return 'hidden_builtin';
}

export async function restoreDeletedSeriesInCloud(seriesId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !isVerifiedAdminUser(user)) {
    throw new Error('ADMIN_AUTH_REQUIRED');
  }

  const existing = inMemoryCatalogOverrides[seriesId];
  const docPath = `${CATALOG_OVERRIDES_COLLECTION}/${seriesId}`;
  const docRef = doc(db, CATALOG_OVERRIDES_COLLECTION, seriesId);

  const hasCustomMetadata = Boolean(
    existing &&
      (existing.title ||
        existing.originalTitle ||
        existing.coverImage ||
        existing.bannerImage ||
        existing.genres.length > 0 ||
        existing.dubStudio ||
        existing.rating > 0 ||
        existing.synopsis)
  );

  if (hasCustomMetadata && existing) {
    try {
      await updateDoc(docRef, {
        isDeleted: false,
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
    inMemoryCatalogOverrides = {
      ...inMemoryCatalogOverrides,
      [seriesId]: { ...existing, isDeleted: false, updatedAt: new Date().toISOString() },
    };
  } else {
    try {
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    }
    const next = { ...inMemoryCatalogOverrides };
    delete next[seriesId];
    inMemoryCatalogOverrides = next;
  }

  writeLocalJson(CATALOG_OVERRIDES_STORAGE_KEY, inMemoryCatalogOverrides);
  dispatchOverridesUpdated();
}

export async function saveSeasonEpisodesOverrideToCloud(
  series: DubSeries,
  season: DubSeason,
  episodes: DubEpisode[],
  seasonTitle?: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !isVerifiedAdminUser(user)) {
    throw new Error('ADMIN_AUTH_REQUIRED');
  }

  const seriesId = series.id;
  const seasonId = season.id;
  const overrideId = getSeasonOverrideDocId(seriesId, seasonId);

  if (
    !VALID_ID_REGEX.test(overrideId) ||
    !VALID_ID_REGEX.test(seriesId) ||
    !VALID_ID_REGEX.test(seasonId)
  ) {
    throw new Error('معرّف الموسم أو المسلسل غير صالح.');
  }

  if (episodes.length > 250) {
    throw new Error('الحد الأقصى لعدد الحلقات في الموسم الواحد هو 250 حلقة.');
  }

  const compactEpisodes: CompactEpisodeOverride[] = episodes.map((ep, idx) => {
    const epId = ep.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100) || `${seasonId}-ep-${idx + 1}`;
    const thumb = (ep.thumbnail || '').trim();
    // Avoid duplicating large inline data URIs per episode when identical to series cover
    const storeThumb =
      thumb && thumb !== series.coverImage && !thumb.startsWith('data:')
        ? truncateUtf8(thumb, 400)
        : '';

    return {
      id: epId,
      episodeNumber: Math.max(1, Math.round(Number(ep.episodeNumber) || idx + 1)),
      title: truncateUtf8((ep.title || `الحلقة ${idx + 1}`).trim(), 180),
      duration: truncateUtf8((ep.duration || '11:00').trim(), 24),
      ...(storeThumb ? { thumbnail: storeThumb } : {}),
      description: truncateUtf8((ep.description || '').trim(), 450),
      isComingSoon: ep.isComingSoon !== undefined ? Boolean(ep.isComingSoon) : true,
      isMerged: Boolean(ep.isMerged),
    };
  });

  const cleanSeasonTitle = truncateUtf8((seasonTitle ?? season.title ?? '').trim(), 200);

  const docPath = `${SEASON_OVERRIDES_COLLECTION}/${overrideId}`;
  const docRef = doc(db, SEASON_OVERRIDES_COLLECTION, overrideId);

  let existsOnCloud = false;
  try {
    const snap = await getDoc(docRef);
    existsOnCloud = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }

  if (existsOnCloud) {
    try {
      await updateDoc(docRef, {
        seasonTitle: cleanSeasonTitle,
        episodes: compactEpisodes,
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
  } else {
    try {
      await setDoc(docRef, {
        overrideId,
        seriesId,
        seasonId,
        seasonTitle: cleanSeasonTitle,
        episodes: compactEpisodes,
        isPublic: true,
        updatedByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    }
  }

  inMemorySeasonOverrides = {
    ...inMemorySeasonOverrides,
    [overrideId]: {
      overrideId,
      seriesId,
      seasonId,
      seasonTitle: cleanSeasonTitle,
      episodes: compactEpisodes,
      updatedAt: new Date().toISOString(),
    },
  };
  writeLocalJson(SEASON_OVERRIDES_STORAGE_KEY, inMemorySeasonOverrides);
  dispatchOverridesUpdated();
}

export async function resetSeasonOverrideInCloud(
  seriesId: string,
  seasonId: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !isVerifiedAdminUser(user)) {
    throw new Error('ADMIN_AUTH_REQUIRED');
  }

  const overrideId = getSeasonOverrideDocId(seriesId, seasonId);
  const docPath = `${SEASON_OVERRIDES_COLLECTION}/${overrideId}`;
  try {
    await deleteDoc(doc(db, SEASON_OVERRIDES_COLLECTION, overrideId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }

  const next = { ...inMemorySeasonOverrides };
  delete next[overrideId];
  inMemorySeasonOverrides = next;
  writeLocalJson(SEASON_OVERRIDES_STORAGE_KEY, next);
  dispatchOverridesUpdated();
}

function parseMinutesFromDuration(dur: string): number {
  const parts = (dur || '').split(':').map((n) => parseInt(n, 10));
  if (parts.length === 2 && !isNaN(parts[0])) {
    return Math.max(1, parts[0]);
  }
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return Math.max(1, parts[0] * 60 + parts[1]);
  }
  return 11;
}

function formatMinutesDuration(totalMinutes: number): string {
  const mins = Math.max(1, Math.round(totalMinutes));
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hrs.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}:00`;
  }
  return `${mins.toString().padStart(2, '0')}:00`;
}

function stripEpisodePrefix(title: string): string {
  return title
    .replace(
      /^(?:الموسم\s+\d+\s*[-–—]\s*)?الحلقة\s+\d+(?:[\s،,&\-]+(?:و\s*)?\d+)*(?:\s*\([^)]*\))?\s*:\s*/i,
      ''
    )
    .trim();
}

export function generateUniqueEpisodeId(seasonId: string, prefix: string): string {
  const cleanSeason = seasonId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48);
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 5);
  return `${cleanSeason}-${prefix}-${stamp}-${rand}`.slice(0, 96);
}

/**
 * Merges 2+ selected episodes in a season into a single merged episode,
 * preserving any linked Google Drive source onto the merged episode.
 */
export async function mergeSeasonEpisodes(
  episodes: DubEpisode[],
  selectedIds: string[]
): Promise<DubEpisode[]> {
  const selectedSet = new Set(selectedIds);
  const chosen = episodes.filter((e) => selectedSet.has(e.id));
  if (chosen.length < 2) return episodes;

  const firstIdx = episodes.findIndex((e) => selectedSet.has(e.id));
  const primary = chosen[0];
  const numsText = chosen.map((c) => c.episodeNumber).join(' و');
  const cleanTitles = chosen.map((c) => stripEpisodePrefix(c.title)).filter(Boolean);
  const combinedTitleBody =
    cleanTitles.length > 0 ? cleanTitles.join(' & ') : `حلقات ${numsText}`;

  const totalMins = chosen.reduce((acc, ep) => acc + parseMinutesFromDuration(ep.duration), 0);
  const combinedDesc = chosen
    .map((c) => c.description?.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' / ');

  // Preserve Drive link if primary doesn't have one yet but another merged episode does
  const primarySource = getCustomEpisodeSource(primary.id);
  if (!primarySource?.driveLink && !primarySource?.videoUrl) {
    for (const item of chosen.slice(1)) {
      const otherSrc = getCustomEpisodeSource(item.id);
      if (otherSrc && (otherSrc.driveLink || otherSrc.videoUrl)) {
        await saveCustomEpisodeSource(primary.id, otherSrc);
        break;
      }
    }
  }

  const mergedEp: DubEpisode = {
    ...primary,
    title: `الحلقة ${primary.episodeNumber.toString().padStart(2, '0')} (${numsText} مدمجة): ${combinedTitleBody}`,
    duration: formatMinutesDuration(totalMins),
    description: combinedDesc || primary.description,
    isMerged: true,
  };

  const result: DubEpisode[] = [];
  let inserted = false;
  episodes.forEach((ep, idx) => {
    if (idx === firstIdx) {
      result.push(mergedEp);
      inserted = true;
    } else if (!selectedSet.has(ep.id)) {
      result.push(ep);
    }
  });
  if (!inserted) result.push(mergedEp);

  return result.map((ep, idx) => ({
    ...ep,
    episodeNumber: idx + 1,
  }));
}

/**
 * Splits a merged episode into 2 or 3 normal single episodes.
 * Keeps the original ID on the first split part so any existing Drive link remains attached.
 */
export function splitMergedEpisode(
  episodes: DubEpisode[],
  seasonId: string,
  targetEpisodeId: string,
  partsCount: 2 | 3 = 2
): DubEpisode[] {
  const idx = episodes.findIndex((e) => e.id === targetEpisodeId);
  if (idx === -1) return episodes;

  const target = episodes[idx];
  const body = stripEpisodePrefix(target.title);
  const rawParts = body
    .split(/\s*[&+/]\s*|\s+و\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const singleMins = Math.max(
    11,
    Math.round(parseMinutesFromDuration(target.duration) / partsCount)
  );
  const singleDuration =
    parseMinutesFromDuration(target.duration) >= 20 && singleMins <= 14 ? '11:00' : formatMinutesDuration(singleMins);

  const newParts: DubEpisode[] = [];
  for (let p = 0; p < partsCount; p += 1) {
    const partTitle =
      rawParts[p] ||
      (rawParts.length === 1 ? `${rawParts[0]} (الجزء ${p + 1})` : `حلقة منفردة (${p + 1})`);
    const partId = p === 0 ? target.id : generateUniqueEpisodeId(seasonId, `split${p + 1}`);

    newParts.push({
      ...target,
      id: partId,
      episodeNumber: target.episodeNumber + p,
      title: `الحلقة ${(target.episodeNumber + p).toString().padStart(2, '0')}: ${partTitle}`,
      duration: singleDuration,
      isMerged: false,
      description:
        p === 0
          ? target.description
          : `حلقة منفردة مفصولة: ${partTitle} — جاهزة للربط برابط Google Drive مستقل.`,
    });
  }

  const next = [...episodes.slice(0, idx), ...newParts, ...episodes.slice(idx + 1)];
  return next.map((ep, i) => ({
    ...ep,
    episodeNumber: i + 1,
  }));
}
