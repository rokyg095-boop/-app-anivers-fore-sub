import type { DubEpisode, DubSeries } from '../data/mockData.ts';
import { isEpisodeDetectedAsMerged } from './catalogOverrides.ts';

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  profileUrl: string;
  order?: number;
}

export interface TmdbEpisodeMeta {
  episodeNumber: number;
  seasonNumber: number;
  name: string;
  nameEn: string;
  overview: string;
  overviewEn: string;
  airDate: string;
  runtimeMinutes: number;
  durationText: string;
  stillUrl: string;
  imdbRating?: string;
  guestStars: TmdbCastMember[];
}

export interface TmdbExternalRatings {
  tmdb?: number;
  imdb?: string;
  imdbVotes?: string;
  rottenTomatoes?: string;
  metascore?: string;
  rated?: string;
  awards?: string;
  malScore?: number;
  malRank?: number;
  malScoredBy?: number;
  malId?: number;
  studios?: string[];
  tvmazeRating?: number;
  network?: string;
  kitsuScore?: string;
  kitsuRank?: number;
}

export interface JikanCharacterActor {
  malId: number;
  name: string;
  role: string;
  imageUrl: string;
  voiceActorName?: string;
  voiceActorImage?: string;
  voiceActorLanguage?: string;
}

export interface TmdbWorkEnrichment {
  ok: boolean;
  configured: boolean;
  found?: boolean;
  tmdbId?: number;
  imdbId?: string;
  mediaType?: 'tv' | 'movie';
  title?: string;
  originalTitle?: string;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  rating?: number;
  releaseDate?: string;
  genres?: string[];
  seasonsCount?: number;
  cast?: TmdbCastMember[];
  sourcesUsed?: Array<'tmdb' | 'omdb' | 'jikan' | 'tvmaze' | 'kitsu'>;
  externalRatings?: TmdbExternalRatings;
  animeExtras?: {
    malId: number;
    malUrl?: string;
    malScore?: number;
    malScoredBy?: number;
    malRank?: number;
    titleJapanese?: string;
    titleEnglish?: string;
    studios: string[];
    themes: string[];
    rating?: string;
    characters: JikanCharacterActor[];
  };
  episodes?: TmdbEpisodeMeta[];
}

export interface TmdbSearchResult {
  tmdbId: number;
  mediaType: 'tv' | 'movie';
  title: string;
  originalTitle: string;
  overview: string;
  posterUrl: string;
  backdropUrl: string;
  releaseDate: string;
  voteAverage: number;
}

export interface ResolvedEpisodePreWatchInfo {
  title: string;
  secondaryTitle: string;
  description: string;
  secondaryDescription: string;
  thumbnail: string;
  duration: string;
  releaseDate: string;
  imdbRating?: string;
  castMembers: TmdbCastMember[];
  guestActors: TmdbCastMember[];
  voiceActorNames: string[];
  tmdbMatched: boolean;
}

export interface ComicEnrichmentResult {
  ok: boolean;
  found?: boolean;
  sourcesUsed?: Array<'mangadex' | 'comicvine'>;
  mangadexId?: string;
  mangadexRating?: number;
  mangadexFollows?: number;
  status?: string;
  year?: number | string;
  publisher?: string;
  issuesCount?: number;
  synopsis?: string;
  tags?: string[];
}

const TMDB_CLIENT_CACHE_KEY = 'aniverse_tmdb_client_cache_v3';
const TMDB_CUSTOM_MAP_KEY = 'aniverse_tmdb_custom_map_v1';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface CachedEntry {
  expiresAt: number;
  data: TmdbWorkEnrichment;
}

const memoryCache = new Map<string, CachedEntry>();
const inFlightRequests = new Map<string, Promise<TmdbWorkEnrichment | null>>();

function readStorageCache(): Record<string, CachedEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(TMDB_CLIENT_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, CachedEntry>) : {};
  } catch {
    return {};
  }
}

function writeStorageCache(cacheObj: Record<string, CachedEntry>): void {
  if (typeof window === 'undefined') return;
  try {
    const entries = Object.entries(cacheObj).slice(-40);
    localStorage.setItem(TMDB_CLIENT_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Ignore quota limits cleanly
  }
}

export function getSavedTmdbMapping(
  seriesId: string
): { tmdbId: number; mediaType: 'tv' | 'movie'; title?: string } | null {
  if (typeof window === 'undefined' || !seriesId) return null;
  try {
    const raw = localStorage.getItem(TMDB_CUSTOM_MAP_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, { tmdbId: number; mediaType: 'tv' | 'movie'; title?: string }>) : {};
    return map[seriesId] || null;
  } catch {
    return null;
  }
}

export async function saveTmdbWorkMapping(
  seriesId: string,
  tmdbId: number,
  mediaType: 'tv' | 'movie',
  title?: string
): Promise<void> {
  if (!seriesId || !tmdbId) return;

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(TMDB_CUSTOM_MAP_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      map[seriesId] = { tmdbId, mediaType, title };
      localStorage.setItem(TMDB_CUSTOM_MAP_KEY, JSON.stringify(map));

      // Purge stale cache entries for this series
      const cache = readStorageCache();
      let changed = false;
      for (const k of Object.keys(cache)) {
        if (k.startsWith(`${seriesId}::`)) {
          delete cache[k];
          changed = true;
        }
      }
      if (changed) writeStorageCache(cache);
      for (const k of memoryCache.keys()) {
        if (k.startsWith(`${seriesId}::`)) memoryCache.delete(k);
      }
    } catch {
      // ignore storage errors
    }
  }

  try {
    await fetch('/api/tmdb/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seriesId, tmdbId, mediaType, title }),
    });
  } catch {
    // non-fatal if offline
  }
}

export async function fetchTmdbStatus(): Promise<boolean> {
  try {
    const res = await fetch('/api/tmdb/status');
    if (!res.ok) return false;
    const data = (await res.json()) as { configured?: boolean };
    return Boolean(data.configured);
  } catch {
    return false;
  }
}

export async function searchTmdbWorks(
  query: string,
  type: 'multi' | 'tv' | 'movie' = 'multi'
): Promise<{ configured: boolean; results: TmdbSearchResult[] }> {
  const q = query.trim();
  if (!q) return { configured: true, results: [] };
  try {
    const params = new URLSearchParams({ query: q, type });
    const res = await fetch(`/api/tmdb/search?${params.toString()}`);
    if (!res.ok) return { configured: true, results: [] };
    const data = (await res.json()) as {
      configured?: boolean;
      results?: TmdbSearchResult[];
    };
    return {
      configured: Boolean(data.configured),
      results: Array.isArray(data.results) ? data.results : [],
    };
  } catch {
    return { configured: false, results: [] };
  }
}

export async function fetchTmdbEnrichmentForWork(
  series: Pick<DubSeries, 'id' | 'title' | 'originalTitle' | 'category'>,
  seasonNumber = 1,
  forceRefresh = false
): Promise<TmdbWorkEnrichment | null> {
  const safeSeason = Math.max(1, Math.round(seasonNumber || 1));
  const cacheKey = `${series.id}::s${safeSeason}`;

  if (!forceRefresh) {
    const mem = memoryCache.get(cacheKey);
    if (mem && mem.expiresAt > Date.now()) {
      return mem.data;
    }
    const stored = readStorageCache()[cacheKey];
    if (stored && stored.expiresAt > Date.now() && stored.data?.found) {
      memoryCache.set(cacheKey, stored);
      return stored.data;
    }
  }

  const inflight = inFlightRequests.get(cacheKey);
  if (inflight && !forceRefresh) {
    return inflight;
  }

  const task = (async () => {
    try {
      const savedMapping = getSavedTmdbMapping(series.id);
      const params = new URLSearchParams({
        seriesId: series.id,
        category: series.category || 'dubbed',
        title: series.title || '',
        originalTitle: series.originalTitle || '',
        seasonNumber: String(safeSeason),
      });
      if (savedMapping?.tmdbId) {
        params.set('tmdbId', String(savedMapping.tmdbId));
        params.set('mediaType', savedMapping.mediaType);
      }

      const res = await fetch(`/api/tmdb/enrich?${params.toString()}`);
      if (!res.ok) return null;
      const data = (await res.json()) as TmdbWorkEnrichment;
      if (!data.configured || !data.found) {
        return data;
      }

      const entry: CachedEntry = {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data,
      };
      memoryCache.set(cacheKey, entry);
      const allStored = readStorageCache();
      allStored[cacheKey] = entry;
      writeStorageCache(allStored);
      return data;
    } catch {
      return null;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, task);
  return task;
}

function hasArabicText(text?: string): boolean {
  return Boolean(text && /[\u0600-\u06FF]/.test(text));
}

function isPlaceholderDescription(desc: string, seriesSynopsis: string): boolean {
  const clean = (desc || '').trim();
  if (!clean) return true;
  if (clean === (seriesSynopsis || '').trim()) return true;
  if (/^(حلقة منفردة|حلقة مدمجة|جاهزة للربط|قريباً)/i.test(clean) && clean.length < 130) {
    return true;
  }
  return false;
}

function isGenericEpisodeTitle(title: string): boolean {
  const clean = (title || '').trim();
  if (!clean) return true;
  return /^(?:الحلقة|Episode)\s*\d+(?:\s*\(مدمجة\))?$/i.test(clean);
}

function isPlaceholderReleaseDate(dateStr?: string): boolean {
  const clean = (dateStr || '').trim();
  return !clean || /جاهزة للربط|قريباً|^2026$/.test(clean);
}

/**
 * Combines curated local episode data with live TMDB metadata (episode title, "القصة الصغيرة",
 * official episode frame, runtime, air date, and episode + series cast).
 */
export function resolveEnrichedEpisodeDetails(
  episode: DubEpisode,
  series: DubSeries,
  enrichment: TmdbWorkEnrichment | null,
  preferTmdbText = true
): ResolvedEpisodePreWatchInfo {
  const localTitle = (episode.title || '').trim();
  const localDesc = (episode.description || '').trim();
  const seriesCast = enrichment?.cast || [];
  const tmdbEps = enrichment?.episodes || [];

  const isMerged = isEpisodeDetectedAsMerged(episode);
  let matchedEps: TmdbEpisodeMeta[] = [];

  if (tmdbEps.length > 0) {
    if (isMerged && series.category !== 'movie') {
      const n1 = episode.episodeNumber * 2 - 1;
      const n2 = episode.episodeNumber * 2;
      matchedEps = tmdbEps.filter((e) => e.episodeNumber === n1 || e.episodeNumber === n2);
    }
    if (matchedEps.length === 0) {
      const exact = tmdbEps.find((e) => e.episodeNumber === episode.episodeNumber);
      if (exact) matchedEps = [exact];
    }
  }

  const primaryTmdbEp = matchedEps[0];
  const combinedTmdbName = matchedEps
    .map((e) => e.name)
    .filter(Boolean)
    .join(' & ');
  const combinedTmdbOverview = matchedEps
    .map((e) => e.overview)
    .filter(Boolean)
    .join(' — ');

  // Episode Title resolution
  let resolvedTitle = localTitle;
  let secondaryTitle = '';
  const hasRealTmdbName = Boolean(combinedTmdbName && !isGenericEpisodeTitle(combinedTmdbName));
  if (hasRealTmdbName) {
    if (isGenericEpisodeTitle(localTitle) || (preferTmdbText && hasArabicText(combinedTmdbName))) {
      resolvedTitle =
        series.category === 'movie'
          ? combinedTmdbName
          : `الحلقة ${episode.episodeNumber.toString().padStart(2, '0')}: ${combinedTmdbName}`;
      if (localTitle && !isGenericEpisodeTitle(localTitle) && localTitle !== resolvedTitle) {
        secondaryTitle = localTitle;
      }
    } else if (combinedTmdbName !== localTitle) {
      secondaryTitle = combinedTmdbName;
    }
  }

  // "القصة الصغيرة" (Episode Overview) resolution
  let resolvedDesc = localDesc || series.synopsis;
  let secondaryDesc = '';
  if (combinedTmdbOverview) {
    if (
      isPlaceholderDescription(localDesc, series.synopsis) ||
      (preferTmdbText && hasArabicText(combinedTmdbOverview))
    ) {
      resolvedDesc = combinedTmdbOverview;
      if (
        localDesc &&
        !isPlaceholderDescription(localDesc, series.synopsis) &&
        localDesc !== combinedTmdbOverview
      ) {
        secondaryDesc = localDesc;
      }
    } else if (combinedTmdbOverview !== localDesc) {
      secondaryDesc = combinedTmdbOverview;
    }
  }

  // Upgrade thumbnail to TMDB episode still frame if current thumbnail is generic series cover
  const hasGenericThumb =
    !episode.thumbnail ||
    episode.thumbnail === series.coverImage ||
    episode.thumbnail === series.bannerImage;
  const resolvedThumb =
    hasGenericThumb && primaryTmdbEp?.stillUrl
      ? primaryTmdbEp.stillUrl
      : episode.thumbnail || primaryTmdbEp?.stillUrl || series.coverImage;

  const resolvedDuration =
    primaryTmdbEp?.durationText && (!episode.duration || episode.duration === 'قريباً' || isGenericEpisodeTitle(localTitle))
      ? primaryTmdbEp.durationText
      : episode.duration || primaryTmdbEp?.durationText || '24:00';

  const resolvedReleaseDate =
    primaryTmdbEp?.airDate && isPlaceholderReleaseDate(episode.releaseDate)
      ? primaryTmdbEp.airDate
      : episode.releaseDate || primaryTmdbEp?.airDate || '';

  // Guest stars + main cast deduplication
  const guestMap = new Map<string, TmdbCastMember>();
  for (const ep of matchedEps) {
    for (const g of ep.guestStars || []) {
      const key = `${g.name.toLowerCase()}`;
      if (g.name && !guestMap.has(key)) {
        guestMap.set(key, g);
      }
    }
  }
  const guestActors = Array.from(guestMap.values());

  const mergedCastMap = new Map<string, TmdbCastMember>();
  for (const g of guestActors) {
    mergedCastMap.set(g.name.toLowerCase(), g);
  }
  for (const c of seriesCast) {
    const key = c.name.toLowerCase();
    if (c.name && !mergedCastMap.has(key)) {
      mergedCastMap.set(key, c);
    }
  }
  const castMembers = Array.from(mergedCastMap.values()).slice(0, 14);

  const localActors = (episode.voiceActors || []).filter(
    (a) => a && a.trim() && a.trim() !== series.dubStudio?.trim()
  );
  const voiceActorNames =
    castMembers.length > 0
      ? castMembers.map((c) => (c.character ? `${c.name} (${c.character})` : c.name))
      : localActors.length > 0
      ? localActors
      : episode.voiceActors || [];

  return {
    title: resolvedTitle,
    secondaryTitle,
    description: resolvedDesc,
    secondaryDescription: secondaryDesc,
    thumbnail: resolvedThumb,
    duration: resolvedDuration,
    releaseDate: resolvedReleaseDate,
    imdbRating: primaryTmdbEp?.imdbRating,
    castMembers,
    guestActors,
    voiceActorNames,
    tmdbMatched: matchedEps.length > 0 || seriesCast.length > 0,
  };
}

const comicCache = new Map<string, ComicEnrichmentResult>();

export async function fetchComicEnrichment(comic: {
  id: string;
  title: string;
  originalTitle?: string;
}): Promise<ComicEnrichmentResult | null> {
  if (!comic?.id) return null;
  const cached = comicCache.get(comic.id);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      comicId: comic.id,
      title: comic.title || '',
      originalTitle: comic.originalTitle || '',
    });
    const res = await fetch(`/api/comics/enrich?${params.toString()}`);
    if (!res.ok) return null;
    const data = (await res.json()) as ComicEnrichmentResult;
    if (data?.found) {
      comicCache.set(comic.id, data);
    }
    return data;
  } catch {
    return null;
  }
}

export type ApiDiscoverFeed = 'trending' | 'popular' | 'top_rated' | 'upcoming' | 'animation';

export interface ApiDiscoverItem {
  externalId: string;
  tmdbId?: number;
  imdbId?: string;
  mediaType: 'movie' | 'tv';
  source: 'tmdb' | 'anilist' | 'kitsu' | 'omdb';
  title: string;
  originalTitle: string;
  overview: string;
  posterUrl: string;
  backdropUrl: string;
  releaseDate: string;
  voteAverage: number;
  genres: string[];
  episodesCount?: number;
}

export interface ApiDiscoverResponse {
  ok: boolean;
  configured: boolean;
  sourcesAvailable?: {
    tmdb: boolean;
    omdb: boolean;
    anilist: boolean;
    kitsu: boolean;
  };
  page: number;
  totalPages: number;
  results: ApiDiscoverItem[];
}

export function buildApiImportWorkId(
  category: 'anime' | 'movie' | 'dubbed' | 'tv',
  item: Pick<ApiDiscoverItem, 'tmdbId' | 'source' | 'externalId'>
): string {
  if (item.tmdbId && item.tmdbId > 0) {
    return `cw-${category}-tmdb-${item.tmdbId}`;
  }
  const safeExt = String(item.externalId || 'item')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `cw-${category}-${item.source}-${safeExt || 'work'}`.slice(0, 100);
}

export async function discoverWorksFromApis(options: {
  category: 'anime' | 'movie' | 'dubbed' | 'tv';
  feed?: ApiDiscoverFeed;
  query?: string;
  page?: number;
}): Promise<ApiDiscoverResponse> {
  try {
    const params = new URLSearchParams({
      category: options.category,
      feed: options.feed || 'popular',
      page: String(options.page || 1),
    });
    if (options.query?.trim()) {
      params.set('query', options.query.trim());
    }
    const res = await fetch(`/api/tmdb/discover?${params.toString()}`);
    if (!res.ok) {
      return { ok: false, configured: false, page: 1, totalPages: 1, results: [] };
    }
    return (await res.json()) as ApiDiscoverResponse;
  } catch {
    return { ok: false, configured: false, page: 1, totalPages: 1, results: [] };
  }
}

export interface ArchiveSearchItem {
  identifier: string;
  title: string;
  description: string;
  year: string;
  downloads: number;
  runtime: string;
  posterUrl: string;
  episodesCount?: number;
}

export interface ArchiveEpisodeFile {
  episodeNumber: number;
  title: string;
  duration: string;
  videoUrl: string;
  backupVideoUrl?: string;
  fileName: string;
  sizeBytes: number;
}

export interface ArchiveItemDetails {
  ok: boolean;
  identifier: string;
  title: string;
  description: string;
  year: string;
  posterUrl: string;
  episodesCount: number;
  episodes: ArchiveEpisodeFile[];
}

export async function discoverArchiveWorks(options: {
  category: 'anime' | 'movie' | 'dubbed' | 'tv';
  query?: string;
  page?: number;
}): Promise<{ ok: boolean; results: ArchiveSearchItem[]; page: number; totalPages: number }> {
  try {
    const params = new URLSearchParams({
      category: options.category,
      page: String(options.page || 1),
    });
    if (options.query?.trim()) {
      params.set('query', options.query.trim());
    }
    const res = await fetch(`/api/archive/discover?${params.toString()}`);
    if (!res.ok) return { ok: false, results: [], page: 1, totalPages: 1 };
    return (await res.json()) as {
      ok: boolean;
      results: ArchiveSearchItem[];
      page: number;
      totalPages: number;
    };
  } catch {
    return { ok: false, results: [], page: 1, totalPages: 1 };
  }
}

export async function fetchArchiveItemDetails(
  identifier: string
): Promise<ArchiveItemDetails | null> {
  try {
    const res = await fetch(`/api/archive/item/${encodeURIComponent(identifier)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as ArchiveItemDetails;
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}


