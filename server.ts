import express from 'express';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { ReadableStream as WebReadableStream } from 'stream/web';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE_PATH = path.resolve(__dirname, 'src', 'data', 'savedEpisodeSources.json');
const BACKUP_FILE_PATH = path.resolve(__dirname, 'src', 'data', 'savedEpisodeSources.backup.json');
const TMDB_MAPPINGS_PATH = path.resolve(__dirname, 'src', 'data', 'tmdbMappings.json');
const DIST_DIR = path.resolve(__dirname, 'dist');
const PORT = Number(process.env.PORT) || 3000;
const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const OMDB_API_BASE = 'https://www.omdbapi.com/';
const ANILIST_API_BASE = 'https://graphql.anilist.co';
const TVMAZE_API_BASE = 'https://api.tvmaze.com';
const KITSU_API_BASE = 'https://kitsu.io/api/edge';
const MANGADEX_API_BASE = 'https://api.mangadex.org';
const COMICVINE_API_BASE = 'https://comicvine.gamespot.com/api';

interface TmdbMappingEntry {
  tmdbId: number;
  mediaType: 'tv' | 'movie';
  title?: string;
  updatedAt?: string;
}

const BUILTIN_TMDB_MAP: Record<string, { tmdbId: number; mediaType: 'tv' | 'movie' }> = {
  'over-the-garden-wall': { tmdbId: 61617, mediaType: 'tv' },
  'adventure-time-dub': { tmdbId: 15260, mediaType: 'tv' },
  'avatar-the-last-airbender': { tmdbId: 246, mediaType: 'tv' },
  'fionna-and-cake': { tmdbId: 131378, mediaType: 'tv' },
  'amphibia-dub': { tmdbId: 85349, mediaType: 'tv' },
  'adventure-time-distant-lands': { tmdbId: 94810, mediaType: 'tv' },
  'the-fragrant-flower-blooms-with-dignity': { tmdbId: 271607, mediaType: 'tv' },
  'naruto': { tmdbId: 46260, mediaType: 'tv' },
  'spider-man-across-the-spider-verse': { tmdbId: 569094, mediaType: 'movie' },
  'spider-man-brand-new-day': { tmdbId: 969681, mediaType: 'movie' },
  'harry-potter-and-the-philosophers-stone': { tmdbId: 671, mediaType: 'movie' },
  'harry-potter-and-the-chamber-of-secrets': { tmdbId: 672, mediaType: 'movie' },
};

const JIKAN_BUILTIN_MAP: Record<string, number> = {
  'naruto': 20,
  'the-fragrant-flower-blooms-with-dignity': 59845,
};

const tmdbEnrichCache = new Map<string, { expiresAt: number; payload: Record<string, unknown> }>();
const tmdbSearchCache = new Map<string, { expiresAt: number; results: unknown[] }>();
const omdbWorkCache = new Map<string, { expiresAt: number; data: Record<string, unknown> | null }>();
const jikanWorkCache = new Map<string, { expiresAt: number; data: Record<string, unknown> | null }>();
const tvmazeWorkCache = new Map<string, { expiresAt: number; data: Record<string, unknown> | null }>();
const kitsuWorkCache = new Map<string, { expiresAt: number; data: Record<string, unknown> | null }>();
const comicsEnrichCache = new Map<string, { expiresAt: number; payload: Record<string, unknown> }>();

function readTmdbMappingsFromDisk(): Record<string, TmdbMappingEntry> {
  try {
    if (!fs.existsSync(TMDB_MAPPINGS_PATH)) return {};
    const raw = fs.readFileSync(TMDB_MAPPINGS_PATH, 'utf8').trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, TmdbMappingEntry>)
      : {};
  } catch {
    return {};
  }
}

function writeTmdbMappingsToDisk(mappings: Record<string, TmdbMappingEntry>): void {
  try {
    const dir = path.dirname(TMDB_MAPPINGS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${TMDB_MAPPINGS_PATH}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(mappings, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, TMDB_MAPPINGS_PATH);
  } catch (err) {
    console.warn('Could not persist tmdbMappings.json:', err);
  }
}

function getTmdbApiKey(): string {
  return String(process.env.TMDB_API_KEY || '').trim();
}

function getOmdbApiKey(): string {
  return String(process.env.OMDB_API_KEY || '').trim();
}

function getComicVineApiKey(): string {
  return String(process.env.COMICVINE_API_KEY || '').trim();
}

async function fetchOmdbWorkAndSeason(opts: {
  imdbId?: string;
  title?: string;
  mediaType: 'tv' | 'movie';
  seasonNumber?: number;
}): Promise<{
  imdbId?: string;
  imdbRating?: string;
  imdbVotes?: string;
  rottenTomatoes?: string;
  metascore?: string;
  rated?: string;
  awards?: string;
  director?: string;
  writer?: string;
  episodeImdbRatings: Record<number, { imdbRating?: string; imdbId?: string }>;
} | null> {
  const apiKey = getOmdbApiKey();
  if (!apiKey) return null;

  const cleanImdb = (opts.imdbId || '').trim();
  const cleanTitle = cleanTitleForTmdbSearch(opts.title || '');
  if (!cleanImdb && !cleanTitle) return null;

  const cacheKey = `${cleanImdb || cleanTitle}:${opts.mediaType}:s${opts.seasonNumber || 1}`;
  const cached = omdbWorkCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as any;
  }

  try {
    const workUrl = new URL(OMDB_API_BASE);
    workUrl.searchParams.set('apikey', apiKey);
    if (cleanImdb) {
      workUrl.searchParams.set('i', cleanImdb);
    } else {
      workUrl.searchParams.set('t', cleanTitle);
      workUrl.searchParams.set('type', opts.mediaType === 'movie' ? 'movie' : 'series');
    }

    const workRes = await fetch(workUrl.toString(), { signal: AbortSignal.timeout(5000) });
    if (!workRes.ok) return null;
    const workJson = (await workRes.json()) as Record<string, unknown>;
    if (workJson.Response !== 'True') {
      omdbWorkCache.set(cacheKey, { expiresAt: Date.now() + 60 * 60 * 1000, data: null });
      return null;
    }

    const ratingsArr = Array.isArray(workJson.Ratings)
      ? (workJson.Ratings as { Source?: string; Value?: string }[])
      : [];
    const rtEntry = ratingsArr.find((r) => String(r.Source || '').toLowerCase().includes('rotten'));
    const validField = (val: unknown): string | undefined => {
      const s = String(val || '').trim();
      return s && s !== 'N/A' ? s : undefined;
    };

    const episodeImdbRatings: Record<number, { imdbRating?: string; imdbId?: string }> = {};
    if (opts.mediaType === 'tv' && (cleanImdb || workJson.imdbID)) {
      const seasonUrl = new URL(OMDB_API_BASE);
      seasonUrl.searchParams.set('apikey', apiKey);
      seasonUrl.searchParams.set('i', String(cleanImdb || workJson.imdbID));
      seasonUrl.searchParams.set('Season', String(Math.max(1, opts.seasonNumber || 1)));
      try {
        const sRes = await fetch(seasonUrl.toString(), { signal: AbortSignal.timeout(4500) });
        if (sRes.ok) {
          const sJson = (await sRes.json()) as {
            Response?: string;
            Episodes?: { Episode?: string; imdbRating?: string; imdbID?: string }[];
          };
          if (sJson.Response === 'True' && Array.isArray(sJson.Episodes)) {
            for (const ep of sJson.Episodes) {
              const num = Number(ep.Episode || 0);
              if (num > 0) {
                episodeImdbRatings[num] = {
                  imdbRating: validField(ep.imdbRating),
                  imdbId: validField(ep.imdbID),
                };
              }
            }
          }
        }
      } catch {
        // non-fatal
      }
    }

    const result = {
      imdbId: validField(workJson.imdbID) || cleanImdb || undefined,
      imdbRating: validField(workJson.imdbRating),
      imdbVotes: validField(workJson.imdbVotes),
      rottenTomatoes: validField(rtEntry?.Value),
      metascore: validField(workJson.Metascore),
      rated: validField(workJson.Rated),
      awards: validField(workJson.Awards),
      director: validField(workJson.Director),
      writer: validField(workJson.Writer),
      episodeImdbRatings,
    };

    if (omdbWorkCache.size > 300) omdbWorkCache.clear();
    omdbWorkCache.set(cacheKey, {
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      data: result,
    });
    return result;
  } catch {
    return null;
  }
}

async function fetchJikanAnimeExtras(opts: {
  seriesId?: string;
  searchTitles: string[];
}): Promise<{
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
  characters: Array<{
    malId: number;
    name: string;
    role: string;
    imageUrl: string;
    voiceActorName?: string;
    voiceActorImage?: string;
    voiceActorLanguage?: string;
  }>;
  episodesFallback: Record<number, { title?: string; aired?: string; score?: number }>;
} | null> {
  const mappedMalId = opts.seriesId ? JIKAN_BUILTIN_MAP[opts.seriesId] : undefined;
  const searchCandidate = opts.searchTitles.map((t) => cleanTitleForTmdbSearch(t)).find(Boolean) || '';
  const cacheKey = `${mappedMalId || searchCandidate.toLowerCase()}`;
  if (!cacheKey) return null;

  const cached = jikanWorkCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as any;
  }

  try {
    const queryById = `query ($idMal: Int) {
      Media(idMal: $idMal, type: ANIME) {
        id idMal siteUrl averageScore popularity
        title { romaji english native }
        rankings { rank type allTime }
        studios(isMain: true) { nodes { name } }
        tags { name }
        characters(perPage: 14, sort: ROLE) {
          edges {
            role
            node { id name { full } image { medium large } }
            voiceActors(language: JAPANESE, sort: RELEVANCE) {
              name { full }
              image { medium large }
            }
          }
        }
      }
    }`;

    const queryBySearch = `query ($search: String) {
      Media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
        id idMal siteUrl averageScore popularity
        title { romaji english native }
        rankings { rank type allTime }
        studios(isMain: true) { nodes { name } }
        tags { name }
        characters(perPage: 14, sort: ROLE) {
          edges {
            role
            node { id name { full } image { medium large } }
            voiceActors(language: JAPANESE, sort: RELEVANCE) {
              name { full }
              image { medium large }
            }
          }
        }
      }
    }`;

    const gqlRes = await fetch(ANILIST_API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        mappedMalId
          ? { query: queryById, variables: { idMal: mappedMalId } }
          : { query: queryBySearch, variables: { search: searchCandidate } }
      ),
      signal: AbortSignal.timeout(4500),
    });

    if (!gqlRes.ok) return null;
    const gqlJson = (await gqlRes.json()) as { data?: { Media?: Record<string, any> } };
    const media = gqlJson.data?.Media;
    if (!media) {
      jikanWorkCache.set(cacheKey, { expiresAt: Date.now() + 60 * 60 * 1000, data: null });
      return null;
    }

    const malId = Number(media.idMal || media.id || 0);
    const ratedRank = Array.isArray(media.rankings)
      ? (media.rankings as any[]).find((r) => r.type === 'RATED' && r.allTime)
      : undefined;
    const rawEdges = Array.isArray(media.characters?.edges) ? (media.characters.edges as any[]) : [];

    const characters = rawEdges.slice(0, 14).map((edge) => {
      const node = edge.node || {};
      const va = Array.isArray(edge.voiceActors) ? edge.voiceActors[0] : null;
      return {
        malId: Number(node.id || 0),
        name: String(node.name?.full || ''),
        role: String(edge.role || ''),
        imageUrl: String(node.image?.medium || node.image?.large || ''),
        voiceActorName: va?.name?.full ? String(va.name.full) : undefined,
        voiceActorImage: va?.image?.medium || va?.image?.large
          ? String(va.image?.medium || va.image?.large)
          : undefined,
        voiceActorLanguage: va ? 'Japanese' : undefined,
      };
    });

    const result = {
      malId,
      malUrl: media.siteUrl ? String(media.siteUrl) : undefined,
      malScore: typeof media.averageScore === 'number' ? Number((media.averageScore / 10).toFixed(1)) : undefined,
      malScoredBy: typeof media.popularity === 'number' ? media.popularity : undefined,
      malRank: typeof ratedRank?.rank === 'number' ? ratedRank.rank : undefined,
      titleJapanese: media.title?.native ? String(media.title.native) : undefined,
      titleEnglish: media.title?.english || media.title?.romaji
        ? String(media.title.english || media.title.romaji)
        : undefined,
      studios: Array.isArray(media.studios?.nodes)
        ? (media.studios.nodes as { name?: string }[]).map((s) => String(s.name || '')).filter(Boolean)
        : [],
      themes: Array.isArray(media.tags)
        ? (media.tags as { name?: string }[]).slice(0, 4).map((t) => String(t.name || '')).filter(Boolean)
        : [],
      characters,
      episodesFallback: {},
    };

    if (jikanWorkCache.size > 200) jikanWorkCache.clear();
    jikanWorkCache.set(cacheKey, {
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      data: result,
    });
    return result;
  } catch {
    return null;
  }
}

async function fetchTvMazeShowAndSeason(opts: {
  imdbId?: string;
  title?: string;
  seasonNumber: number;
}): Promise<{
  networkName?: string;
  tvmazeRating?: number;
  episodes: Record<number, { name?: string; summary?: string; stillUrl?: string }>;
} | null> {
  const cleanImdb = (opts.imdbId || '').trim();
  const cleanTitle = cleanTitleForTmdbSearch(opts.title || '');
  const cacheKey = `${cleanImdb || cleanTitle.toLowerCase()}:s${opts.seasonNumber}`;
  if (!cleanImdb && !cleanTitle) return null;

  const cached = tvmazeWorkCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as any;
  }

  try {
    const showUrl = cleanImdb
      ? `${TVMAZE_API_BASE}/lookup/shows?imdb=${encodeURIComponent(cleanImdb)}`
      : `${TVMAZE_API_BASE}/singlesearch/shows?q=${encodeURIComponent(cleanTitle)}`;

    const showRes = await fetch(showUrl, { signal: AbortSignal.timeout(3500) });
    if (!showRes.ok) {
      tvmazeWorkCache.set(cacheKey, { expiresAt: Date.now() + 60 * 60 * 1000, data: null });
      return null;
    }

    const showJson = (await showRes.json()) as Record<string, any> | null;
    if (!showJson || !showJson.id) return null;

    const episodes: Record<number, { name?: string; summary?: string; stillUrl?: string }> = {};
    try {
      const epsRes = await fetch(`${TVMAZE_API_BASE}/shows/${showJson.id}/episodes`, {
        signal: AbortSignal.timeout(3500),
      });
      if (epsRes.ok) {
        const epsList = (await epsRes.json()) as Record<string, any>[];
        for (const ep of epsList) {
          if (Number(ep.season) === opts.seasonNumber && Number(ep.number) > 0) {
            const plainSummary = String(ep.summary || '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            episodes[Number(ep.number)] = {
              name: ep.name ? String(ep.name) : undefined,
              summary: plainSummary || undefined,
              stillUrl: ep.image?.original || ep.image?.medium
                ? String(ep.image.original || ep.image.medium)
                : undefined,
            };
          }
        }
      }
    } catch {
      // non-fatal
    }

    const result = {
      networkName: showJson.network?.name || showJson.webChannel?.name
        ? String(showJson.network?.name || showJson.webChannel?.name)
        : undefined,
      tvmazeRating: typeof showJson.rating?.average === 'number'
        ? Number(showJson.rating.average.toFixed(1))
        : undefined,
      episodes,
    };

    if (tvmazeWorkCache.size > 250) tvmazeWorkCache.clear();
    tvmazeWorkCache.set(cacheKey, {
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      data: result,
    });
    return result;
  } catch {
    return null;
  }
}

async function fetchKitsuAnimeExtras(opts: {
  searchTitles: string[];
}): Promise<{
  kitsuId: string;
  kitsuScore?: string;
  kitsuRank?: number;
  kitsuPopularityRank?: number;
  episodesFallback: Record<number, { title?: string; synopsis?: string; stillUrl?: string }>;
} | null> {
  const searchCandidate = opts.searchTitles.map((t) => cleanTitleForTmdbSearch(t)).find(Boolean) || '';
  if (!searchCandidate) return null;

  const cacheKey = searchCandidate.toLowerCase();
  const cached = kitsuWorkCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as any;
  }

  try {
    const searchUrl = `${KITSU_API_BASE}/anime?filter%5Btext%5D=${encodeURIComponent(searchCandidate)}&page%5Blimit%5D=1`;
    const res = await fetch(searchUrl, {
      headers: { Accept: 'application/vnd.api+json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Record<string, any>[] };
    const first = json.data?.[0];
    if (!first || !first.id) {
      kitsuWorkCache.set(cacheKey, { expiresAt: Date.now() + 60 * 60 * 1000, data: null });
      return null;
    }

    const attrs = first.attributes || {};
    const episodesFallback: Record<number, { title?: string; synopsis?: string; stillUrl?: string }> = {};
    try {
      const epsRes = await fetch(
        `${KITSU_API_BASE}/anime/${first.id}/episodes?page%5Blimit%5D=20&sort=number`,
        {
          headers: { Accept: 'application/vnd.api+json' },
          signal: AbortSignal.timeout(3500),
        }
      );
      if (epsRes.ok) {
        const epsJson = (await epsRes.json()) as { data?: Record<string, any>[] };
        for (const ep of epsJson.data || []) {
          const epAttrs = ep.attributes || {};
          const num = Number(epAttrs.number || 0);
          if (num > 0) {
            episodesFallback[num] = {
              title: epAttrs.canonicalTitle || epAttrs.titles?.en_us || epAttrs.titles?.en_jp || undefined,
              synopsis: epAttrs.synopsis ? String(epAttrs.synopsis).trim() : undefined,
              stillUrl: epAttrs.thumbnail?.original ? String(epAttrs.thumbnail.original) : undefined,
            };
          }
        }
      }
    } catch {
      // non-fatal
    }

    const avgRaw = attrs.averageRating ? Number(attrs.averageRating) : 0;
    const result = {
      kitsuId: String(first.id),
      kitsuScore: avgRaw > 0 ? `${avgRaw.toFixed(1)}%` : undefined,
      kitsuRank: typeof attrs.ratingRank === 'number' ? attrs.ratingRank : undefined,
      kitsuPopularityRank: typeof attrs.popularityRank === 'number' ? attrs.popularityRank : undefined,
      episodesFallback,
    };

    if (kitsuWorkCache.size > 200) kitsuWorkCache.clear();
    kitsuWorkCache.set(cacheKey, {
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      data: result,
    });
    return result;
  } catch {
    return null;
  }
}

function cleanTitleForTmdbSearch(raw: string): string {
  return String(raw || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(Arabic Dubbed Animation|Arabic Dubbed|The Complete.*|Seasons?\s*\d+.*|Full Movie|Official Movie|Motion Comic Series|Special Movies)\b/gi, ' ')
    .replace(/[-–—:]\s*(The Complete.*|Seasons?\s*\d+.*)$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchTmdbJson<T = Record<string, unknown>>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T | null> {
  const apiKey = getTmdbApiKey();
  if (!apiKey) return null;

  const url = new URL(`${TMDB_API_BASE}${endpoint}`);
  const isBearerToken = apiKey.length > 60 || apiKey.includes('.');
  if (!isBearerToken) {
    url.searchParams.set('api_key', apiKey);
  }
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (isBearerToken) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const res = await fetch(url.toString(), {
    headers,
    signal: AbortSignal.timeout(8500),
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

function formatRuntimeDuration(minutes?: number | null): string {
  const mins = typeof minutes === 'number' && minutes > 0 ? Math.round(minutes) : 0;
  if (!mins) return '';
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
  }
  return `${mins.toString().padStart(2, '0')}:00`;
}

function tmdbImageUrl(filePath?: string | null, size: 'w185' | 'w500' | 'w780' | 'w1280' = 'w500'): string {
  if (!filePath || typeof filePath !== 'string') return '';
  return `${TMDB_IMAGE_BASE}/${size}${filePath.startsWith('/') ? filePath : `/${filePath}`}`;
}

interface SubtitleTrackRecord {
  id: string;
  lang: string;
  label: string;
  src: string;
  default?: boolean;
}

interface BackupDriveLinkRecord {
  id: string;
  url: string;
  accountLabel?: string;
}

interface EpisodeSourceRecord {
  videoUrl?: string;
  driveLink?: string;
  accountLabel?: string;
  backupDriveLinks?: BackupDriveLinkRecord[];
  subtitles?: SubtitleTrackRecord[];
  updatedAt?: string;
}

function parseSourcesJson(raw: string): Record<string, EpisodeSourceRecord> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, EpisodeSourceRecord>;
  }
  return {};
}

function ensureDataFilesExist(): void {
  const dir = path.dirname(DATA_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE_PATH)) {
    fs.writeFileSync(DATA_FILE_PATH, '{}\n', 'utf8');
  }
  if (!fs.existsSync(BACKUP_FILE_PATH)) {
    fs.writeFileSync(BACKUP_FILE_PATH, '{}\n', 'utf8');
  }
}

function readSourcesFromDisk(): Record<string, EpisodeSourceRecord> {
  try {
    ensureDataFilesExist();
    const mainData = parseSourcesJson(fs.readFileSync(DATA_FILE_PATH, 'utf8'));
    if (Object.keys(mainData).length > 0) {
      return mainData;
    }

    // Auto-recover from rolling backup if main file is unexpectedly empty
    const backupData = parseSourcesJson(fs.readFileSync(BACKUP_FILE_PATH, 'utf8'));
    if (Object.keys(backupData).length > 0) {
      fs.writeFileSync(DATA_FILE_PATH, `${JSON.stringify(backupData, null, 2)}\n`, 'utf8');
      return backupData;
    }
    return mainData;
  } catch (err) {
    console.error('Failed to read savedEpisodeSources.json:', err);
    try {
      return parseSourcesJson(fs.readFileSync(BACKUP_FILE_PATH, 'utf8'));
    } catch {
      return {};
    }
  }
}

function writeSourcesToDisk(sources: Record<string, EpisodeSourceRecord>): void {
  ensureDataFilesExist();

  // Save previous non-empty snapshot to rolling backup before overwriting
  try {
    const currentMain = parseSourcesJson(fs.readFileSync(DATA_FILE_PATH, 'utf8'));
    if (Object.keys(currentMain).length > 0) {
      const backupTemp = `${BACKUP_FILE_PATH}.tmp`;
      fs.writeFileSync(backupTemp, `${JSON.stringify(currentMain, null, 2)}\n`, 'utf8');
      fs.renameSync(backupTemp, BACKUP_FILE_PATH);
    }
  } catch {
    // Proceed cleanly even if reading previous main fails
  }

  const formatted = `${JSON.stringify(sources, null, 2)}\n`;
  const tempPath = `${DATA_FILE_PATH}.tmp`;
  fs.writeFileSync(tempPath, formatted, 'utf8');
  fs.renameSync(tempPath, DATA_FILE_PATH);

  // Also keep backup updated whenever we have saved links
  if (Object.keys(sources).length > 0) {
    const backupTemp = `${BACKUP_FILE_PATH}.tmp`;
    fs.writeFileSync(backupTemp, formatted, 'utf8');
    fs.renameSync(backupTemp, BACKUP_FILE_PATH);
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Get all saved episode sources
  app.get('/api/episode-sources', (_req, res) => {
    const sources = readSourcesFromDisk();
    res.json({ ok: true, sources });
  });

  // Same-origin HTTP Range streaming proxy for Google Drive videos (bypasses CORP: same-site & attachment headers)
  const DRIVE_FILE_ID_REGEX = /^[a-zA-Z0-9_-]{18,80}$/;
  const handleDriveStream = async (req: express.Request, res: express.Response) => {
    const fileId = String(req.params.fileId || '').trim();
    if (!DRIVE_FILE_ID_REGEX.test(fileId)) {
      res.status(400).json({ ok: false, error: 'Invalid Google Drive file ID' });
      return;
    }

    const abortController = new AbortController();
    const onClientClose = () => {
      if (!res.writableFinished) {
        abortController.abort();
      }
    };
    res.on('close', onClientClose);

    try {
      const upstreamHeaders: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      };
      const MAX_STREAM_CHUNK_BYTES = 4 * 1024 * 1024; // 4 MB chunks keep responses well under Cloud Run's 32 MB ceiling
      if (typeof req.headers.range === 'string' && req.headers.range.trim()) {
        const rangeMatch = req.headers.range.trim().match(/^bytes=(\d+)-(\d*)$/i);
        if (rangeMatch) {
          const start = Number(rangeMatch[1]);
          const requestedEnd = rangeMatch[2] ? Number(rangeMatch[2]) : null;
          const cappedEnd =
            requestedEnd !== null && requestedEnd >= start
              ? Math.min(requestedEnd, start + MAX_STREAM_CHUNK_BYTES - 1)
              : start + MAX_STREAM_CHUNK_BYTES - 1;
          upstreamHeaders.Range = `bytes=${start}-${cappedEnd}`;
        } else {
          upstreamHeaders.Range = req.headers.range;
        }
      } else if (req.method !== 'HEAD') {
        upstreamHeaders.Range = `bytes=0-${MAX_STREAM_CHUNK_BYTES - 1}`;
      }

      const fetchDriveCandidate = async (url: string) =>
        fetch(url, {
          method: req.method === 'HEAD' ? 'HEAD' : 'GET',
          headers: upstreamHeaders,
          redirect: 'follow',
          signal: abortController.signal,
        });

      const primaryUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(
        fileId
      )}&export=download&confirm=t`;
      let upstream = await fetchDriveCandidate(primaryUrl);

      let contentType = (upstream.headers.get('content-type') || '').toLowerCase();

      // If Google returned a virus-scan HTML confirmation interstitial, parse uuid/confirm and retry once
      if (contentType.includes('text/html') && req.method !== 'HEAD') {
        const html = await upstream.text();
        const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/i);
        const confirmMatch = html.match(/name="confirm"\s+value="([^"]+)"/i);
        if (uuidMatch?.[1]) {
          const retryUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(
            fileId
          )}&export=download&confirm=${encodeURIComponent(
            confirmMatch?.[1] || 't'
          )}&uuid=${encodeURIComponent(uuidMatch[1])}`;
          upstream = await fetchDriveCandidate(retryUrl);
          contentType = (upstream.headers.get('content-type') || '').toLowerCase();
        }
      }

      if (
        (!upstream.ok && upstream.status !== 206 && upstream.status !== 416) ||
        contentType.includes('text/html')
      ) {
        if (!res.headersSent) {
          res.status(502).json({ ok: false, error: 'Google Drive direct stream unavailable' });
        }
        return;
      }

      const status = upstream.status === 206 || upstream.status === 416 ? upstream.status : 200;
      const resolvedMime =
        contentType && !contentType.includes('application/binary') && !contentType.includes('octet-stream')
          ? contentType.split(';')[0]
          : 'video/mp4';

      res.status(status);
      res.setHeader('Content-Type', resolvedMime);
      res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'private, max-age=1800');

      const contentLength = upstream.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }

      if (req.method === 'HEAD' || !upstream.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(upstream.body as unknown as WebReadableStream);
      nodeStream.on('error', () => {
        if (!res.writableEnded) {
          res.end();
        }
      });
      res.on('error', () => {
        nodeStream.destroy();
        abortController.abort();
      });

      nodeStream.pipe(res);
    } catch (err) {
      if (!abortController.signal.aborted && !res.headersSent) {
        console.error('Drive stream proxy error:', err);
        res.status(502).json({ ok: false, error: 'Failed to proxy video stream' });
      }
    } finally {
      res.off('close', onClientClose);
    }
  };

  app.get('/api/drive-stream/:fileId', handleDriveStream);
  app.head('/api/drive-stream/:fileId', handleDriveStream);

  // Bulk import / sync episode sources (must come before :episodeId route)
  app.post('/api/episode-sources/bulk/import', (req, res) => {
    try {
      const incoming = req.body?.sources;
      const mode = req.body?.mode === 'replace' ? 'replace' : 'merge';
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
        res.status(400).json({ ok: false, error: 'Invalid sources payload' });
        return;
      }

      const existing = mode === 'replace' ? {} : readSourcesFromDisk();
      const next: Record<string, EpisodeSourceRecord> = {
        ...existing,
        ...(incoming as Record<string, EpisodeSourceRecord>),
      };

      writeSourcesToDisk(next);
      res.json({ ok: true, sources: next });
    } catch (err) {
      console.error('Error bulk importing episode sources:', err);
      res.status(500).json({ ok: false, error: 'Failed to import episode sources' });
    }
  });

  // Save or update a single episode source
  app.post('/api/episode-sources/:episodeId', (req, res) => {
    try {
      const episodeId = decodeURIComponent(req.params.episodeId || '').trim();
      if (!episodeId || episodeId.length > 200) {
        res.status(400).json({ ok: false, error: 'Invalid episodeId' });
        return;
      }

      const body = (req.body || {}) as EpisodeSourceRecord;
      const existing = readSourcesFromDisk();

      existing[episodeId] = {
        ...existing[episodeId],
        ...body,
        updatedAt: new Date().toISOString(),
      };

      writeSourcesToDisk(existing);
      res.json({ ok: true, episodeId, sources: existing });
    } catch (err) {
      console.error('Error saving episode source:', err);
      res.status(500).json({ ok: false, error: 'Failed to persist episode source' });
    }
  });

  // Delete an episode source override
  app.delete('/api/episode-sources/:episodeId', (req, res) => {
    try {
      const episodeId = decodeURIComponent(req.params.episodeId || '').trim();
      if (!episodeId) {
        res.status(400).json({ ok: false, error: 'Invalid episodeId' });
        return;
      }

      const existing = readSourcesFromDisk();
      delete existing[episodeId];
      writeSourcesToDisk(existing);
      res.json({ ok: true, episodeId, sources: existing });
    } catch (err) {
      console.error('Error deleting episode source:', err);
      res.status(500).json({ ok: false, error: 'Failed to delete episode source' });
    }
  });

  // Unified Metadata Sources Status (TMDB + OMDb + AniList + Kitsu + TVmaze + MangaDex + ComicVine)
  app.get('/api/tmdb/status', (_req, res) => {
    const tmdbConfigured = Boolean(getTmdbApiKey());
    const omdbConfigured = Boolean(getOmdbApiKey());
    const comicvineConfigured = Boolean(getComicVineApiKey());
    res.json({
      ok: true,
      configured: tmdbConfigured,
      tmdbConfigured,
      omdbConfigured,
      comicvineConfigured,
      jikanConfigured: true,
      anilistConfigured: true,
      kitsuConfigured: true,
      tvmazeConfigured: true,
      mangadexConfigured: true,
    });
  });

  // Comics & Manga Enrichment (MangaDex + optional ComicVine)
  app.get('/api/comics/enrich', async (req, res) => {
    try {
      const comicId = String(req.query.comicId || '').trim();
      const rawTitle = String(req.query.title || '').trim();
      const rawOriginalTitle = String(req.query.originalTitle || '').trim();
      const searchQ = cleanTitleForTmdbSearch(rawOriginalTitle || rawTitle);

      if (!searchQ) {
        res.json({ ok: true, found: false });
        return;
      }

      const cacheKey = `${comicId || searchQ.toLowerCase()}`;
      const cached = comicsEnrichCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        res.json(cached.payload);
        return;
      }

      const comicVineKey = getComicVineApiKey();
      const [mdRes, cvRes] = await Promise.allSettled([
        fetch(
          `${MANGADEX_API_BASE}/manga?title=${encodeURIComponent(
            searchQ
          )}&limit=5&order%5BfollowedCount%5D=desc&includes%5B%5D=author&includes%5B%5D=artist`,
          { signal: AbortSignal.timeout(4500) }
        ).then(async (r) => (r.ok ? ((await r.json()) as { data?: Record<string, any>[] }) : null)),
        comicVineKey
          ? fetch(
              `${COMICVINE_API_BASE}/search/?api_key=${encodeURIComponent(
                comicVineKey
              )}&format=json&resources=volume&limit=1&query=${encodeURIComponent(searchQ)}`,
              {
                headers: { 'User-Agent': 'AniVerseApp/1.0' },
                signal: AbortSignal.timeout(4500),
              }
            ).then(async (r) => (r.ok ? ((await r.json()) as { results?: Record<string, any>[] }) : null))
          : Promise.resolve(null),
      ]);

      const mdList =
        mdRes.status === 'fulfilled' && mdRes.value?.data?.length ? mdRes.value.data : [];
      const normalizedTarget = searchQ.toLowerCase().trim();
      const mdManga =
        mdList.find((item) => {
          const titles = [
            item?.attributes?.title?.en,
            item?.attributes?.title?.ja,
            ...(Array.isArray(item?.attributes?.altTitles)
              ? item.attributes.altTitles.flatMap((t: Record<string, string>) => Object.values(t))
              : []),
          ]
            .filter(Boolean)
            .map((t) => String(t).toLowerCase().trim());
          return titles.includes(normalizedTarget);
        }) ||
        mdList[0] ||
        null;
      const cvVol =
        cvRes.status === 'fulfilled' && cvRes.value?.results?.length
          ? cvRes.value.results[0]
          : null;

      if (!mdManga && !cvVol) {
        res.json({ ok: true, found: false, sourcesUsed: [] });
        return;
      }

      const sourcesUsed: Array<'mangadex' | 'comicvine'> = [];
      if (mdManga) sourcesUsed.push('mangadex');
      if (cvVol) sourcesUsed.push('comicvine');

      let mangadexRating: number | undefined;
      let mangadexFollows: number | undefined;
      if (mdManga?.id) {
        try {
          const statRes = await fetch(`${MANGADEX_API_BASE}/statistics/manga/${mdManga.id}`, {
            signal: AbortSignal.timeout(3000),
          });
          if (statRes.ok) {
            const statJson = (await statRes.json()) as { statistics?: Record<string, any> };
            const s = statJson.statistics?.[mdManga.id];
            if (typeof s?.rating?.bayesian === 'number') {
              mangadexRating = Number(s.rating.bayesian.toFixed(2));
            }
            if (typeof s?.follows === 'number') {
              mangadexFollows = s.follows;
            }
          }
        } catch {
          // non-fatal
        }
      }

      const mdAttrs = mdManga?.attributes || {};
      const mdDesc = String(mdAttrs.description?.ar || mdAttrs.description?.en || '').trim();
      const cvDesc = String(cvVol?.deck || cvVol?.description || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const tags = Array.isArray(mdAttrs.tags)
        ? (mdAttrs.tags as Record<string, any>[])
            .slice(0, 6)
            .map((t) => String(t.attributes?.name?.en || ''))
            .filter(Boolean)
        : [];

      const payload = {
        ok: true,
        found: true,
        sourcesUsed,
        mangadexId: mdManga?.id ? String(mdManga.id) : undefined,
        mangadexRating,
        mangadexFollows,
        status: mdAttrs.status ? String(mdAttrs.status) : undefined,
        year: mdAttrs.year || cvVol?.start_year || undefined,
        publisher: cvVol?.publisher?.name ? String(cvVol.publisher.name) : undefined,
        issuesCount: typeof cvVol?.count_of_issues === 'number' ? cvVol.count_of_issues : undefined,
        synopsis: mdDesc || cvDesc || undefined,
        tags,
      };

      if (comicsEnrichCache.size > 150) comicsEnrichCache.clear();
      comicsEnrichCache.set(cacheKey, {
        expiresAt: Date.now() + 12 * 60 * 60 * 1000,
        payload,
      });
      res.json(payload);
    } catch {
      res.json({ ok: true, found: false, sourcesUsed: [] });
    }
  });

  // Search TMDB for TV Series / Anime / Movies (Arabic with English fallback)
  app.get('/api/tmdb/search', async (req, res) => {
    try {
      if (!getTmdbApiKey()) {
        res.json({ ok: true, configured: false, results: [] });
        return;
      }

      const rawQuery = String(req.query.query || '').trim();
      const searchType =
        req.query.type === 'movie' || req.query.type === 'tv' ? req.query.type : 'multi';
      const cleaned = cleanTitleForTmdbSearch(rawQuery) || rawQuery;
      if (!cleaned) {
        res.json({ ok: true, configured: true, results: [] });
        return;
      }

      const cacheKey = `${searchType}:${cleaned.toLowerCase()}`;
      const cached = tmdbSearchCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        res.json({ ok: true, configured: true, results: cached.results });
        return;
      }

      const endpoint =
        searchType === 'movie'
          ? '/search/movie'
          : searchType === 'tv'
          ? '/search/tv'
          : '/search/multi';

      const [arRes, enRes] = await Promise.all([
        fetchTmdbJson<{ results?: Record<string, unknown>[] }>(endpoint, {
          query: cleaned,
          language: 'ar',
          include_adult: 'false',
        }),
        fetchTmdbJson<{ results?: Record<string, unknown>[] }>(endpoint, {
          query: cleaned,
          language: 'en-US',
          include_adult: 'false',
        }),
      ]);

      const enMap = new Map<string, Record<string, unknown>>();
      for (const item of enRes?.results || []) {
        const mType =
          searchType === 'multi'
            ? String(item.media_type || '')
            : searchType;
        if (mType !== 'tv' && mType !== 'movie') continue;
        enMap.set(`${mType}:${item.id}`, item);
      }

      const mergedList = (arRes?.results?.length ? arRes.results : enRes?.results || [])
        .map((item) => {
          const mType =
            searchType === 'multi'
              ? String(item.media_type || '')
              : searchType;
          if (mType !== 'tv' && mType !== 'movie') return null;
          const id = Number(item.id);
          if (!id) return null;
          const enItem = enMap.get(`${mType}:${id}`);

          const title = String(
            item.name || item.title || enItem?.name || enItem?.title || ''
          ).trim();
          const originalTitle = String(
            item.original_name ||
              item.original_title ||
              enItem?.name ||
              enItem?.title ||
              title
          ).trim();
          const overview = String(item.overview || enItem?.overview || '').trim();
          const posterPath = (item.poster_path || enItem?.poster_path) as string | undefined;
          const backdropPath = (item.backdrop_path || enItem?.backdrop_path) as string | undefined;

          return {
            tmdbId: id,
            mediaType: mType as 'tv' | 'movie',
            title,
            originalTitle,
            overview,
            posterUrl: tmdbImageUrl(posterPath, 'w500'),
            backdropUrl: tmdbImageUrl(backdropPath, 'w1280'),
            releaseDate: String(
              item.first_air_date ||
                item.release_date ||
                enItem?.first_air_date ||
                enItem?.release_date ||
                ''
            ),
            voteAverage: Number(Number(item.vote_average || enItem?.vote_average || 0).toFixed(1)),
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .slice(0, 12);

      if (tmdbSearchCache.size > 200) tmdbSearchCache.clear();
      tmdbSearchCache.set(cacheKey, {
        expiresAt: Date.now() + 60 * 60 * 1000,
        results: mergedList,
      });

      res.json({ ok: true, configured: true, results: mergedList });
    } catch (err) {
      console.error('TMDB search error:', err);
      res.status(502).json({ ok: false, error: 'TMDB search failed' });
    }
  });

  // Discover / Browse / Multi-Source Search across TMDB + AniList + Kitsu + OMDb for Bulk Grabbing
  const TMDB_GENRE_AR_MAP: Record<number, string> = {
    28: 'أكشن',
    12: 'مغامرات',
    16: 'أنيميشن',
    35: 'كوميديا',
    80: 'جريمة',
    99: 'وثائقي',
    18: 'دراما',
    10751: 'عائلي',
    14: 'فانتازيا',
    36: 'تاريخي',
    27: 'رعب',
    10402: 'موسيقى',
    9648: 'غموض',
    10749: 'رومانسي',
    878: 'خيال علمي',
    10770: 'تلفزيوني',
    53: 'إثارة',
    10752: 'حرب',
    37: 'غربي',
    10759: 'أكشن ومغامرة',
    10762: 'أطفال',
    10765: 'خيال علمي وفانتازيا',
    10768: 'حرب وسياسة',
  };

  app.get('/api/tmdb/discover', async (req, res) => {
    try {
      const category = String(req.query.category || 'movie').trim();
      const feed = String(req.query.feed || 'popular').trim();
      const rawQuery = String(req.query.query || '').trim();
      const page = Math.min(20, Math.max(1, Number(req.query.page) || 1));
      const tmdbConfigured = Boolean(getTmdbApiKey());
      const omdbKey = getOmdbApiKey();
      const isMovieCat = category === 'movie';
      const targetMediaType: 'movie' | 'tv' = isMovieCat ? 'movie' : 'tv';

      interface DiscoverWorkItem {
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

      const mapTmdbItems = (
        arItems: Record<string, unknown>[],
        enItems: Record<string, unknown>[],
        forcedType: 'movie' | 'tv'
      ): DiscoverWorkItem[] => {
        const enMap = new Map<number, Record<string, unknown>>();
        for (const it of enItems) {
          const id = Number(it.id);
          if (id) enMap.set(id, it);
        }
        return arItems
          .map((item) => {
            const id = Number(item.id);
            if (!id) return null;
            const enItem = enMap.get(id);
            const posterPath = (item.poster_path || enItem?.poster_path) as string | undefined;
            const backdropPath = (item.backdrop_path || enItem?.backdrop_path) as string | undefined;
            const posterUrl = tmdbImageUrl(posterPath, 'w500');
            if (!posterUrl) return null;
            const title = String(item.title || item.name || enItem?.title || enItem?.name || '').trim();
            if (!title) return null;
            const originalTitle = String(
              item.original_title ||
                item.original_name ||
                enItem?.title ||
                enItem?.name ||
                title
            ).trim();
            const overview = String(item.overview || enItem?.overview || '').trim();
            const genreIds = Array.isArray(item.genre_ids)
              ? (item.genre_ids as number[])
              : Array.isArray(enItem?.genre_ids)
              ? (enItem?.genre_ids as number[])
              : [];
            const genres = genreIds
              .map((gid) => TMDB_GENRE_AR_MAP[Number(gid)])
              .filter((g): g is string => Boolean(g))
              .slice(0, 4);

            return {
              externalId: String(id),
              tmdbId: id,
              mediaType: forcedType,
              source: 'tmdb' as const,
              title,
              originalTitle,
              overview,
              posterUrl,
              backdropUrl: tmdbImageUrl(backdropPath, 'w1280') || posterUrl,
              releaseDate: String(
                item.release_date ||
                  item.first_air_date ||
                  enItem?.release_date ||
                  enItem?.first_air_date ||
                  ''
              ),
              voteAverage: Number(Number(item.vote_average || enItem?.vote_average || 0).toFixed(1)),
              genres,
            };
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x));
      };

      const fetchTmdbDiscover = async (): Promise<{ items: DiscoverWorkItem[]; totalPages: number }> => {
        if (!tmdbConfigured) return { items: [], totalPages: 1 };

        let endpoint = '';
        const extraParams: Record<string, string> = {
          page: String(page),
          include_adult: 'false',
        };

        if (rawQuery) {
          // If IMDb ID lookup (e.g. tt3896198), resolve via TMDB /find
          if (/^tt\d{5,}$/i.test(rawQuery)) {
            const findRes = await fetchTmdbJson<{
              movie_results?: Record<string, unknown>[];
              tv_results?: Record<string, unknown>[];
            }>(`/find/${encodeURIComponent(rawQuery)}`, {
              external_source: 'imdb_id',
              language: 'ar',
            });
            const foundMovies = mapTmdbItems(findRes?.movie_results || [], [], 'movie');
            const foundTv = mapTmdbItems(findRes?.tv_results || [], [], 'tv');
            return { items: [...foundMovies, ...foundTv], totalPages: 1 };
          }
          endpoint = isMovieCat ? '/search/movie' : '/search/tv';
          extraParams.query = cleanTitleForTmdbSearch(rawQuery) || rawQuery;
        } else if (feed === 'animation' || category === 'anime' || category === 'dubbed') {
          endpoint = `/discover/${targetMediaType}`;
          extraParams.with_genres = '16';
          if (category === 'anime') {
            extraParams.with_original_language = 'ja';
          }
          if (feed === 'top_rated') {
            extraParams.sort_by = 'vote_average.desc';
            extraParams['vote_count.gte'] = '120';
          } else if (feed === 'upcoming') {
            extraParams.sort_by = isMovieCat
              ? 'primary_release_date.desc'
              : 'first_air_date.desc';
            extraParams['vote_count.gte'] = '10';
          } else {
            extraParams.sort_by = 'popularity.desc';
          }
        } else if (feed === 'trending') {
          endpoint = `/trending/${targetMediaType}/week`;
        } else if (feed === 'top_rated') {
          endpoint = `/${targetMediaType}/top_rated`;
        } else if (feed === 'upcoming') {
          endpoint = isMovieCat ? '/movie/upcoming' : '/tv/on_the_air';
        } else {
          endpoint = `/${targetMediaType}/popular`;
        }

        const [arRes, enRes] = await Promise.all([
          fetchTmdbJson<{ results?: Record<string, unknown>[]; total_pages?: number }>(endpoint, {
            ...extraParams,
            language: 'ar',
          }),
          fetchTmdbJson<{ results?: Record<string, unknown>[]; total_pages?: number }>(endpoint, {
            ...extraParams,
            language: 'en-US',
          }),
        ]);

        const arList = arRes?.results?.length ? arRes.results : enRes?.results || [];
        const enList = enRes?.results || [];
        const items = mapTmdbItems(arList, enList, targetMediaType);
        const totalPages = Math.min(20, Number(arRes?.total_pages || enRes?.total_pages || 1));
        return { items, totalPages };
      };

      const fetchAnilistDiscover = async (): Promise<DiscoverWorkItem[]> => {
        if (category !== 'anime' && !rawQuery) return [];
        try {
          const gqlQuery = rawQuery
            ? `query ($search: String, $page: Int, $formatIn: [MediaFormat]) {
                Page(page: $page, perPage: 10) {
                  media(search: $search, type: ANIME, format_in: $formatIn, isAdult: false, sort: [POPULARITY_DESC]) {
                    id title { romaji english native } description(asHtml: false)
                    coverImage { extraLarge large } bannerImage averageScore
                    seasonYear episodes genres format
                  }
                }
              }`
            : `query ($page: Int, $sort: [MediaSort], $formatIn: [MediaFormat]) {
                Page(page: $page, perPage: 10) {
                  media(type: ANIME, format_in: $formatIn, isAdult: false, sort: $sort) {
                    id title { romaji english native } description(asHtml: false)
                    coverImage { extraLarge large } bannerImage averageScore
                    seasonYear episodes genres format
                  }
                }
              }`;
          const sortKey =
            feed === 'top_rated'
              ? ['SCORE_DESC']
              : feed === 'trending'
              ? ['TRENDING_DESC']
              : ['POPULARITY_DESC'];
          const variables = rawQuery
            ? {
                search: rawQuery,
                page,
                formatIn: isMovieCat ? ['MOVIE'] : ['TV', 'ONA', 'OVA'],
              }
            : {
                page,
                sort: sortKey,
                formatIn: isMovieCat ? ['MOVIE'] : ['TV', 'ONA'],
              };
          const alRes = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ query: gqlQuery, variables }),
            signal: AbortSignal.timeout(4500),
          });
          if (!alRes.ok) return [];
          const alJson = (await alRes.json()) as {
            data?: { Page?: { media?: Record<string, any>[] } };
          };
          const list = alJson.data?.Page?.media || [];
          return list
            .map((m): DiscoverWorkItem | null => {
              const titleObj = m.title || {};
              const title = String(titleObj.english || titleObj.romaji || titleObj.native || '').trim();
              const posterUrl = String(m.coverImage?.extraLarge || m.coverImage?.large || '');
              if (!title || !posterUrl) return null;
              const desc = String(m.description || '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
              return {
                externalId: `al-${m.id}`,
                mediaType: m.format === 'MOVIE' ? 'movie' : 'tv',
                source: 'anilist',
                title,
                originalTitle: String(titleObj.romaji || titleObj.native || title),
                overview: desc.slice(0, 600),
                posterUrl,
                backdropUrl: String(m.bannerImage || posterUrl),
                releaseDate: m.seasonYear ? String(m.seasonYear) : '',
                voteAverage:
                  typeof m.averageScore === 'number'
                    ? Number((m.averageScore / 10).toFixed(1))
                    : 0,
                genres: Array.isArray(m.genres) ? (m.genres as string[]).slice(0, 4) : ['أنمي'],
                episodesCount: typeof m.episodes === 'number' ? m.episodes : undefined,
              };
            })
            .filter((x): x is DiscoverWorkItem => Boolean(x));
        } catch {
          return [];
        }
      };

      const fetchKitsuDiscover = async (): Promise<DiscoverWorkItem[]> => {
        if (category !== 'anime' && feed !== 'animation' && !rawQuery) return [];
        try {
          const offset = (page - 1) * 8;
          const kitsuUrl = rawQuery
            ? `${KITSU_API_BASE}/anime?filter[text]=${encodeURIComponent(rawQuery)}&page[limit]=6`
            : `${KITSU_API_BASE}/anime?sort=${
                feed === 'top_rated' ? '-averageRating' : '-userCount'
              }&page[limit]=6&page[offset]=${offset}`;
          const kRes = await fetch(kitsuUrl, {
            headers: { Accept: 'application/vnd.api+json' },
            signal: AbortSignal.timeout(4000),
          });
          if (!kRes.ok) return [];
          const kJson = (await kRes.json()) as { data?: Record<string, any>[] };
          return (kJson.data || [])
            .map((item): DiscoverWorkItem | null => {
              const attrs = item.attributes || {};
              const title = String(attrs.canonicalTitle || attrs.titles?.en || '').trim();
              const posterUrl = String(
                attrs.posterImage?.large || attrs.posterImage?.medium || ''
              );
              if (!title || !posterUrl) return null;
              const rawRating = Number(attrs.averageRating || 0);
              return {
                externalId: `kt-${item.id}`,
                mediaType: attrs.subtype === 'movie' ? 'movie' : 'tv',
                source: 'kitsu',
                title,
                originalTitle: String(attrs.titles?.en_jp || attrs.canonicalTitle || title),
                overview: String(attrs.synopsis || '').slice(0, 600),
                posterUrl,
                backdropUrl: String(attrs.coverImage?.large || posterUrl),
                releaseDate: String(attrs.startDate || '').slice(0, 4),
                voteAverage: rawRating > 0 ? Number((rawRating / 10).toFixed(1)) : 0,
                genres: ['أنمي'],
                episodesCount: typeof attrs.episodeCount === 'number' ? attrs.episodeCount : undefined,
              };
            })
            .filter((x): x is DiscoverWorkItem => Boolean(x));
        } catch {
          return [];
        }
      };

      const fetchOmdbDiscover = async (): Promise<DiscoverWorkItem[]> => {
        if (!omdbKey || !rawQuery) return [];
        try {
          const isImdb = /^tt\d{5,}$/i.test(rawQuery);
          const url = isImdb
            ? `https://www.omdbapi.com/?i=${encodeURIComponent(rawQuery)}&apikey=${encodeURIComponent(omdbKey)}`
            : `https://www.omdbapi.com/?s=${encodeURIComponent(rawQuery)}&type=${
                isMovieCat ? 'movie' : 'series'
              }&apikey=${encodeURIComponent(omdbKey)}`;
          const oRes = await fetch(url, { signal: AbortSignal.timeout(3500) });
          if (!oRes.ok) return [];
          const oJson = (await oRes.json()) as Record<string, any>;
          if (oJson.Response === 'False') return [];
          const list: Record<string, any>[] = Array.isArray(oJson.Search)
            ? oJson.Search.slice(0, 6)
            : oJson.Title
            ? [oJson]
            : [];
          return list
            .map((m): DiscoverWorkItem | null => {
              const title = String(m.Title || '').trim();
              const poster = String(m.Poster || '');
              if (!title || !poster || poster === 'N/A') return null;
              return {
                externalId: `omdb-${m.imdbID || title}`,
                imdbId: m.imdbID ? String(m.imdbID) : undefined,
                mediaType: m.Type === 'series' ? 'tv' : 'movie',
                source: 'omdb',
                title,
                originalTitle: title,
                overview: String(m.Plot && m.Plot !== 'N/A' ? m.Plot : ''),
                posterUrl: poster,
                backdropUrl: poster,
                releaseDate: String(m.Year || ''),
                voteAverage:
                  m.imdbRating && !Number.isNaN(Number(m.imdbRating))
                    ? Number(m.imdbRating)
                    : 0,
                genres: m.Genre && m.Genre !== 'N/A' ? String(m.Genre).split(',').map((s: string) => s.trim()) : [],
              };
            })
            .filter((x): x is DiscoverWorkItem => Boolean(x));
        } catch {
          return [];
        }
      };

      const [tmdbOut, alItems, ktItems, omdbItems] = await Promise.all([
        fetchTmdbDiscover(),
        fetchAnilistDiscover(),
        fetchKitsuDiscover(),
        fetchOmdbDiscover(),
      ]);

      // Merge & deduplicate by normalized originalTitle
      const seenKeys = new Set<string>();
      const merged: DiscoverWorkItem[] = [];
      for (const item of [...tmdbOut.items, ...alItems, ...ktItems, ...omdbItems]) {
        const key = `${item.mediaType}:${item.originalTitle.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '')}`;
        if (!key || seenKeys.has(key)) continue;
        seenKeys.add(key);
        merged.push(item);
      }

      res.json({
        ok: true,
        configured: tmdbConfigured,
        sourcesAvailable: {
          tmdb: tmdbConfigured,
          omdb: Boolean(omdbKey),
          anilist: true,
          kitsu: true,
        },
        page,
        totalPages: tmdbOut.totalPages,
        results: merged,
      });
    } catch (err) {
      console.error('API discover error:', err);
      res.status(502).json({ ok: false, error: 'Failed to discover works from APIs' });
    }
  });

  // Internet Archive (archive.org) Full Playable Video Discover & Episode MP4 Resolver (Free, Zero Key)
  const archiveSearchCache = new Map<string, { expiresAt: number; payload: unknown }>();
  const archiveItemCache = new Map<string, { expiresAt: number; payload: any }>();

  const ARCHIVE_AR_ALIAS_MAP: Array<[RegExp, string]> = [
    [/ناروتو/i, 'Naruto'],
    [/ون\s*بيس/i, 'One Piece'],
    [/دراغون\s*بول|غوغو/i, 'Dragon Ball'],
    [/مذكرة\s*الموت|ديث\s*نوت/i, 'Death Note'],
    [/سبايدر\s*مان|الرجل\s*العنكبوت/i, 'Spider-Man'],
    [/بات\s*مان|الرجل\s*الوطواط/i, 'Batman'],
    [/أفاتار|افاتار/i, 'Avatar Last Airbender'],
    [/وقت\s*المغامرة/i, 'Adventure Time'],
    [/كونان|المحقق\s*كونان/i, 'Detective Conan'],
    [/بوكيمون/i, 'Pokemon'],
    [/توم\s*(?:و|&)\s*جيري/i, 'Tom and Jerry'],
    [/هجوم\s*العمالقة/i, 'Attack on Titan'],
    [/بليتش/i, 'Bleach'],
    [/بن\s*10|بين\s*10/i, 'Ben 10'],
    [/غامبول/i, 'Gumball'],
    [/سبونج\s*بوب/i, 'SpongeBob'],
    [/لوفي/i, 'One Piece'],
    [/صراع\s*العروش/i, 'Game of Thrones'],
    [/آل\s*التنين/i, 'House of the Dragon'],
  ];

  const resolveArchiveItemPayload = async (identifier: string, timeoutMs = 8000) => {
    const cached = archiveItemCache.get(identifier);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload;
    }

    const metaRes = await fetch(
      `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
      { signal: AbortSignal.timeout(timeoutMs) }
    );
    if (!metaRes.ok) return null;

    const metaJson = (await metaRes.json()) as {
      metadata?: Record<string, any>;
      files?: Record<string, any>[];
    };
    const meta = metaJson.metadata || {};
    const files = Array.isArray(metaJson.files) ? metaJson.files : [];

    const formatLen = (rawLen: unknown): string => {
      const secs = Number(rawLen);
      if (!Number.isFinite(secs) || secs <= 0) return '22:00';
      const total = Math.round(secs);
      const hrs = Math.floor(total / 3600);
      const mins = Math.floor((total % 3600) / 60);
      const s = total % 60;
      if (hrs > 0) {
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
      return `${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const rawMp4s = files.filter((f) => {
      const name = String(f.name || '');
      if (!/\.(mp4|m4v|webm)$/i.test(name)) return false;
      if (name.startsWith('__')) return false;
      return true;
    });

    // Prefer primary MP4 over *_512kb.mp4 / *.ia.mp4 derivative, while preserving _512kb backup URL
    const byStem = new Map<
      string,
      { primary: Record<string, any>; backup?: Record<string, any> }
    >();
    for (const f of rawMp4s) {
      const name = String(f.name || '');
      const stem = name
        .replace(/_512kb\.(mp4|m4v|webm)$/i, '')
        .replace(/\.ia\.(mp4|m4v|webm)$/i, '')
        .replace(/\.(mp4|m4v|webm)$/i, '')
        .toLowerCase();
      const existing = byStem.get(stem);
      const isDerivative = /(_512kb|\.ia)\.(mp4|m4v|webm)$/i.test(name);
      if (!existing) {
        byStem.set(stem, { primary: f });
      } else {
        const existingDerivative = /(_512kb|\.ia)\.(mp4|m4v|webm)$/i.test(
          String(existing.primary.name)
        );
        if (existingDerivative && !isDerivative) {
          byStem.set(stem, { primary: f, backup: existing.primary });
        } else if (!existingDerivative && isDerivative && !existing.backup) {
          byStem.set(stem, { primary: existing.primary, backup: f });
        }
      }
    }

    const sortedVideos = Array.from(byStem.values())
      .sort((a, b) =>
        String(a.primary.name || '').localeCompare(String(b.primary.name || ''), undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      )
      .slice(0, 150);

    const buildArchiveUrl = (fileName: string) => {
      const encodedPath = fileName
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/');
      return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodedPath}`;
    };

    const episodes = sortedVideos.map(({ primary: f, backup }, idx) => {
      const fileName = String(f.name || '');
      const cleanEpName = fileName
        .split('/')
        .pop()!
        .replace(/\.(mp4|m4v|webm)$/i, '')
        .replace(/[_]+/g, ' ')
        .trim();
      return {
        episodeNumber: idx + 1,
        title: String(f.title || cleanEpName || `الحلقة ${idx + 1}`).trim(),
        duration: formatLen(f.length),
        videoUrl: buildArchiveUrl(fileName),
        ...(backup?.name ? { backupVideoUrl: buildArchiveUrl(String(backup.name)) } : {}),
        fileName,
        sizeBytes: Number(f.size || 0),
      };
    });

    const rawDesc = Array.isArray(meta.description)
      ? String(meta.description[0] || '')
      : String(meta.description || '');
    const payload = {
      ok: true,
      identifier,
      title: String(meta.title || identifier).trim(),
      description: rawDesc
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1000),
      year: meta.year ? String(meta.year) : '',
      posterUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
      episodesCount: episodes.length,
      episodes,
    };

    if (archiveItemCache.size > 200) archiveItemCache.clear();
    archiveItemCache.set(identifier, {
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      payload,
    });
    return payload;
  };

  app.get('/api/archive/discover', async (req, res) => {
    try {
      const category = String(req.query.category || 'movie').trim();
      const rawInputQuery = String(req.query.query || '').trim();
      const page = Math.min(10, Math.max(1, Number(req.query.page) || 1));

      let effectiveQuery = rawInputQuery;
      for (const [rx, enName] of ARCHIVE_AR_ALIAS_MAP) {
        if (rx.test(effectiveQuery)) {
          effectiveQuery = enName;
          break;
        }
      }

      const cacheKey = `${category}:${effectiveQuery.toLowerCase()}:p${page}`;
      const cached = archiveSearchCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        res.json(cached.payload);
        return;
      }

      const noiseExclusions =
        '-title:capcut -title:template -title:yarichin -title:ecchi -title:hentai -title:trailer -title:speedrun -collection:tvarchive -collection:911 -collection:videogame_longplays';

      let qExpr = `mediatype:movies ${noiseExclusions}`;
      if (effectiveQuery) {
        const safeQ = effectiveQuery.replace(/["()]/g, ' ').trim();
        qExpr += safeQ.includes(' ')
          ? ` AND title:"${safeQ}"`
          : ` AND (title:${safeQ}* OR title:"${safeQ}")`;
      } else if (category === 'anime') {
        qExpr +=
          ' AND (title:"Death Note" OR title:"Naruto" OR title:"Dragon Ball" OR title:"Pokemon" OR title:"Digimon" OR subject:"anime")';
      } else if (category === 'dubbed') {
        qExpr +=
          ' AND (subject:"animationandcartoons" OR subject:"cartoons" OR title:"Spider-Man: The Animated" OR title:"Popeye" OR title:"Tom and Jerry")';
      } else if (category === 'tv') {
        qExpr +=
          ' AND (subject:"classic_tv" OR subject:"television" OR title:"Complete Series" OR title:"Animated Series")';
      } else {
        qExpr += ' AND (subject:"feature_films" OR subject:"sci-fi")';
      }

      const url = new URL('https://archive.org/advancedsearch.php');
      url.searchParams.set('q', qExpr);
      url.searchParams.append('fl[]', 'identifier');
      url.searchParams.append('fl[]', 'title');
      url.searchParams.append('fl[]', 'description');
      url.searchParams.append('fl[]', 'year');
      url.searchParams.append('fl[]', 'downloads');
      url.searchParams.append('fl[]', 'runtime');
      url.searchParams.append('sort[]', 'downloads desc');
      url.searchParams.set('rows', '24');
      url.searchParams.set('page', String(page));
      url.searchParams.set('output', 'json');

      const arRes = await fetch(url.toString(), { signal: AbortSignal.timeout(7000) });
      if (!arRes.ok) {
        res.json({ ok: false, results: [], page, totalPages: 1 });
        return;
      }
      const arJson = (await arRes.json()) as {
        response?: { numFound?: number; docs?: Record<string, any>[] };
      };
      const numFound = Number(arJson.response?.numFound || 0);
      const totalPages = Math.min(10, Math.max(1, Math.ceil(numFound / 24)));

      const badTitleRx =
        /\b(capcut|template|speedrun|walkthrough|longplay|yarichin|hentai|ecchi|harem|commercials|100%\s*w\/)\b/i;

      const candidates = (arJson.response?.docs || [])
        .map((d) => {
          const identifier = String(d.identifier || '').trim();
          const title = String(d.title || identifier).trim();
          if (!identifier || !title || badTitleRx.test(title)) return null;
          const desc = Array.isArray(d.description)
            ? String(d.description[0] || '')
            : String(d.description || '');
          const cleanDesc = desc
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 500);
          return {
            identifier,
            title,
            description: cleanDesc,
            year: d.year ? String(d.year) : '',
            downloads: Number(d.downloads || 0),
            runtime: d.runtime ? String(d.runtime) : '',
            posterUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .slice(0, 18);

      // Verify & count playable MP4 episodes for each candidate in parallel
      const enrichedResults = await Promise.all(
        candidates.map(async (item) => {
          try {
            const meta = await resolveArchiveItemPayload(item.identifier, 3500);
            if (!meta || !meta.episodesCount || meta.episodesCount <= 0) return null;
            return {
              ...item,
              episodesCount: Number(meta.episodesCount),
            };
          } catch {
            return null;
          }
        })
      );

      const docs = enrichedResults
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .slice(0, 14);

      const payload = { ok: true, results: docs, page, totalPages };
      if (archiveSearchCache.size > 120) archiveSearchCache.clear();
      archiveSearchCache.set(cacheKey, {
        expiresAt: Date.now() + 30 * 60 * 1000,
        payload,
      });
      res.json(payload);
    } catch (err) {
      console.error('Archive.org discover error:', err);
      res.json({ ok: false, results: [], page: 1, totalPages: 1 });
    }
  });

  app.get('/api/archive/item/:identifier', async (req, res) => {
    try {
      const identifier = String(req.params.identifier || '').trim();
      if (!identifier) {
        res.status(400).json({ ok: false, error: 'Missing identifier' });
        return;
      }
      const payload = await resolveArchiveItemPayload(identifier, 8000);
      if (!payload) {
        res.status(404).json({ ok: false, error: 'Archive item not found' });
        return;
      }
      res.json(payload);
    } catch (err) {
      console.error('Archive.org item error:', err);
      res.status(502).json({ ok: false, error: 'Failed to inspect Archive item' });
    }
  });

  // Save manual TMDB binding for a series/movie ID
  app.post('/api/tmdb/mapping', (req, res) => {
    try {
      const seriesId = String(req.body?.seriesId || '').trim();
      const tmdbId = Number(req.body?.tmdbId || 0);
      const mediaType = req.body?.mediaType === 'movie' ? 'movie' : 'tv';
      const title = String(req.body?.title || '').trim();

      if (!seriesId || !tmdbId || tmdbId <= 0) {
        res.status(400).json({ ok: false, error: 'Invalid TMDB mapping payload' });
        return;
      }

      const mappings = readTmdbMappingsFromDisk();
      mappings[seriesId] = {
        tmdbId,
        mediaType,
        ...(title ? { title } : {}),
        updatedAt: new Date().toISOString(),
      };
      writeTmdbMappingsToDisk(mappings);

      for (const k of tmdbEnrichCache.keys()) {
        if (k.startsWith(`${mediaType}:${tmdbId}:`)) {
          tmdbEnrichCache.delete(k);
        }
      }

      res.json({ ok: true, mapping: mappings[seriesId] });
    } catch (err) {
      console.error('TMDB mapping save error:', err);
      res.status(500).json({ ok: false, error: 'Failed to save TMDB mapping' });
    }
  });

  // Enrich series/movie + season episodes + cast from TMDB (Arabic with English fallback)
  app.get('/api/tmdb/enrich', async (req, res) => {
    try {
      if (!getTmdbApiKey()) {
        res.json({ ok: true, configured: false });
        return;
      }

      const seriesId = String(req.query.seriesId || '').trim();
      const category = String(req.query.category || '').trim();
      const rawTitle = String(req.query.title || '').trim();
      const rawOriginalTitle = String(req.query.originalTitle || '').trim();
      const seasonNumber = Math.max(1, Number(req.query.seasonNumber) || 1);
      const explicitTmdbId = Number(req.query.tmdbId || 0);
      const explicitType =
        req.query.mediaType === 'movie' || req.query.mediaType === 'tv'
          ? (req.query.mediaType as 'tv' | 'movie')
          : null;

      let resolvedTmdbId = explicitTmdbId > 0 ? explicitTmdbId : 0;
      let resolvedMediaType: 'tv' | 'movie' =
        explicitType || (category === 'movie' ? 'movie' : 'tv');

      if (!resolvedTmdbId && seriesId) {
        const importedMatch = seriesId.match(/^cw-(?:movie|tv|anime|dubbed)-tmdb-(\d+)$/i);
        const savedMappings = readTmdbMappingsFromDisk();
        const saved = savedMappings[seriesId];
        if (saved?.tmdbId) {
          resolvedTmdbId = saved.tmdbId;
          resolvedMediaType = saved.mediaType;
        } else if (importedMatch) {
          resolvedTmdbId = Number(importedMatch[1]);
          resolvedMediaType = seriesId.startsWith('cw-movie-') ? 'movie' : 'tv';
        } else if (BUILTIN_TMDB_MAP[seriesId]) {
          resolvedTmdbId = BUILTIN_TMDB_MAP[seriesId].tmdbId;
          resolvedMediaType = BUILTIN_TMDB_MAP[seriesId].mediaType;
        }
      }

      const discoverTmdbIdByTitle = async (targetType: 'tv' | 'movie'): Promise<number> => {
        const candidates = [
          cleanTitleForTmdbSearch(rawOriginalTitle),
          cleanTitleForTmdbSearch(rawTitle),
        ].filter(Boolean);

        const searchEndpoint = targetType === 'movie' ? '/search/movie' : '/search/tv';
        for (const q of candidates) {
          const searchJson = await fetchTmdbJson<{ results?: Record<string, unknown>[] }>(
            searchEndpoint,
            { query: q, language: 'en-US', include_adult: 'false' }
          );
          const first = searchJson?.results?.[0];
          if (first && Number(first.id) > 0) {
            const foundId = Number(first.id);
            if (seriesId) {
              const mappings = readTmdbMappingsFromDisk();
              mappings[seriesId] = {
                tmdbId: foundId,
                mediaType: targetType,
                title: String(first.name || first.title || q),
                updatedAt: new Date().toISOString(),
              };
              writeTmdbMappingsToDisk(mappings);
            }
            return foundId;
          }
        }
        return 0;
      };

      // Automatic discovery by originalTitle or title if no ID mapping yet
      if (!resolvedTmdbId) {
        resolvedTmdbId = await discoverTmdbIdByTitle(resolvedMediaType);
      }

      if (!resolvedTmdbId) {
        res.json({ ok: true, configured: true, found: false });
        return;
      }

      const cachedFirst = tmdbEnrichCache.get(`${resolvedMediaType}:${resolvedTmdbId}:s${seasonNumber}`);
      if (cachedFirst && cachedFirst.expiresAt > Date.now()) {
        res.json(cachedFirst.payload);
        return;
      }

      if (resolvedMediaType === 'movie') {
        let [arMovie, enMovie] = await Promise.all([
          fetchTmdbJson<Record<string, unknown>>(`/movie/${resolvedTmdbId}`, {
            language: 'ar',
            append_to_response: 'credits,external_ids',
          }),
          fetchTmdbJson<Record<string, unknown>>(`/movie/${resolvedTmdbId}`, {
            language: 'en-US',
            append_to_response: 'credits,external_ids',
          }),
        ]);

        if (!arMovie && !enMovie && !explicitTmdbId) {
          const fallbackId = await discoverTmdbIdByTitle('movie');
          if (fallbackId && fallbackId !== resolvedTmdbId) {
            resolvedTmdbId = fallbackId;
            [arMovie, enMovie] = await Promise.all([
              fetchTmdbJson<Record<string, unknown>>(`/movie/${resolvedTmdbId}`, {
                language: 'ar',
                append_to_response: 'credits,external_ids',
              }),
              fetchTmdbJson<Record<string, unknown>>(`/movie/${resolvedTmdbId}`, {
                language: 'en-US',
                append_to_response: 'credits,external_ids',
              }),
            ]);
          }
        }

        const base = arMovie || enMovie;
        if (!base) {
          res.json({ ok: true, configured: true, found: false });
          return;
        }

        const creditsObj =
          (base.credits as { cast?: Record<string, unknown>[] } | undefined) ||
          (enMovie?.credits as { cast?: Record<string, unknown>[] } | undefined);

        const cast = (creditsObj?.cast || []).slice(0, 16).map((c) => ({
          id: Number(c.id || 0),
          name: String(c.name || ''),
          character: String(c.character || ''),
          profileUrl: tmdbImageUrl(c.profile_path as string | undefined, 'w185'),
          order: Number(c.order ?? 99),
        }));

        const runtime = Number(base.runtime || enMovie?.runtime || 0);
        const title = String(base.title || enMovie?.title || '').trim();
        const originalTitle = String(base.original_title || enMovie?.original_title || title);
        const overview = String(base.overview || enMovie?.overview || '').trim();
        const releaseDate = String(base.release_date || enMovie?.release_date || '');
        const imdbId = String(
          (base.external_ids as { imdb_id?: string } | undefined)?.imdb_id ||
            (enMovie?.external_ids as { imdb_id?: string } | undefined)?.imdb_id ||
            base.imdb_id ||
            enMovie?.imdb_id ||
            ''
        ).trim();

        const isAnimeMovie =
          category === 'anime' ||
          String(base.original_language || enMovie?.original_language || '') === 'ja';

        const [omdbRes, jikanRes, kitsuRes] = await Promise.allSettled([
          fetchOmdbWorkAndSeason({
            imdbId: imdbId || undefined,
            title: String(enMovie?.title || originalTitle || rawOriginalTitle),
            mediaType: 'movie',
          }),
          isAnimeMovie
            ? fetchJikanAnimeExtras({
                seriesId,
                searchTitles: [String(enMovie?.title || ''), originalTitle, rawOriginalTitle],
              })
            : Promise.resolve(null),
          isAnimeMovie
            ? fetchKitsuAnimeExtras({
                searchTitles: [String(enMovie?.title || ''), originalTitle, rawOriginalTitle],
              })
            : Promise.resolve(null),
        ]);

        const omdbData = omdbRes.status === 'fulfilled' ? omdbRes.value : null;
        const jikanData = jikanRes.status === 'fulfilled' ? jikanRes.value : null;
        const kitsuData = kitsuRes.status === 'fulfilled' ? kitsuRes.value : null;
        const sourcesUsed: ('tmdb' | 'omdb' | 'jikan' | 'tvmaze' | 'kitsu')[] = ['tmdb'];
        if (omdbData) sourcesUsed.push('omdb');
        if (jikanData) sourcesUsed.push('jikan');
        if (kitsuData) sourcesUsed.push('kitsu');

        const tmdbRating = Number(Number(base.vote_average || enMovie?.vote_average || 0).toFixed(1));

        const payload = {
          ok: true,
          configured: true,
          found: true,
          tmdbId: resolvedTmdbId,
          imdbId: omdbData?.imdbId || imdbId || undefined,
          mediaType: 'movie' as const,
          title,
          originalTitle,
          overview,
          posterUrl: tmdbImageUrl((base.poster_path || enMovie?.poster_path) as string | undefined, 'w500'),
          backdropUrl: tmdbImageUrl(
            (base.backdrop_path || enMovie?.backdrop_path) as string | undefined,
            'w1280'
          ),
          rating: tmdbRating,
          releaseDate,
          genres: Array.isArray(base.genres)
            ? (base.genres as { name?: string }[]).map((g) => String(g.name || '')).filter(Boolean)
            : [],
          seasonsCount: 1,
          cast,
          sourcesUsed,
          externalRatings: {
            tmdb: tmdbRating || undefined,
            imdb: omdbData?.imdbRating,
            imdbVotes: omdbData?.imdbVotes,
            rottenTomatoes: omdbData?.rottenTomatoes,
            metascore: omdbData?.metascore,
            rated: omdbData?.rated || jikanData?.rating,
            awards: omdbData?.awards,
            malScore: jikanData?.malScore,
            malRank: jikanData?.malRank,
            malScoredBy: jikanData?.malScoredBy,
            malId: jikanData?.malId,
            studios: jikanData?.studios,
            kitsuScore: kitsuData?.kitsuScore,
            kitsuRank: kitsuData?.kitsuRank,
          },
          ...(jikanData ? { animeExtras: jikanData } : {}),
          episodes: [
            {
              episodeNumber: 1,
              seasonNumber: 1,
              name: title,
              nameEn: String(enMovie?.title || title),
              overview,
              overviewEn: String(enMovie?.overview || overview),
              airDate: releaseDate,
              runtimeMinutes: runtime,
              durationText: formatRuntimeDuration(runtime),
              stillUrl: tmdbImageUrl(
                (base.backdrop_path || enMovie?.backdrop_path) as string | undefined,
                'w780'
              ),
              imdbRating: omdbData?.imdbRating,
              guestStars: cast.slice(0, 8),
            },
          ],
        };

        const cacheKey = `${resolvedMediaType}:${resolvedTmdbId}:s${seasonNumber}`;
        if (tmdbEnrichCache.size > 400) tmdbEnrichCache.clear();
        tmdbEnrichCache.set(cacheKey, {
          expiresAt: Date.now() + 6 * 60 * 60 * 1000,
          payload,
        });
        res.json(payload);
        return;
      }

      // TV Series Enrichment (Show info + Cast + Requested Season Episodes)
      let [arTv, enTv, arSeason, enSeason] = await Promise.all([
        fetchTmdbJson<Record<string, unknown>>(`/tv/${resolvedTmdbId}`, {
          language: 'ar',
          append_to_response: 'aggregate_credits,credits,external_ids',
        }),
        fetchTmdbJson<Record<string, unknown>>(`/tv/${resolvedTmdbId}`, {
          language: 'en-US',
          append_to_response: 'aggregate_credits,credits,external_ids',
        }),
        fetchTmdbJson<Record<string, unknown>>(`/tv/${resolvedTmdbId}/season/${seasonNumber}`, {
          language: 'ar',
        }),
        fetchTmdbJson<Record<string, unknown>>(`/tv/${resolvedTmdbId}/season/${seasonNumber}`, {
          language: 'en-US',
        }),
      ]);

      if (!arTv && !enTv && !explicitTmdbId) {
        const fallbackId = await discoverTmdbIdByTitle('tv');
        if (fallbackId && fallbackId !== resolvedTmdbId) {
          resolvedTmdbId = fallbackId;
          [arTv, enTv, arSeason, enSeason] = await Promise.all([
            fetchTmdbJson<Record<string, unknown>>(`/tv/${resolvedTmdbId}`, {
              language: 'ar',
              append_to_response: 'aggregate_credits,credits,external_ids',
            }),
            fetchTmdbJson<Record<string, unknown>>(`/tv/${resolvedTmdbId}`, {
              language: 'en-US',
              append_to_response: 'aggregate_credits,credits,external_ids',
            }),
            fetchTmdbJson<Record<string, unknown>>(`/tv/${resolvedTmdbId}/season/${seasonNumber}`, {
              language: 'ar',
            }),
            fetchTmdbJson<Record<string, unknown>>(`/tv/${resolvedTmdbId}/season/${seasonNumber}`, {
              language: 'en-US',
            }),
          ]);
        }
      }

      const tvBase = arTv || enTv;
      if (!tvBase) {
        res.json({ ok: true, configured: true, found: false });
        return;
      }

      const aggCast =
        ((tvBase.aggregate_credits as { cast?: Record<string, unknown>[] } | undefined)?.cast ||
          (enTv?.aggregate_credits as { cast?: Record<string, unknown>[] } | undefined)?.cast ||
          []);
      const regCast =
        ((tvBase.credits as { cast?: Record<string, unknown>[] } | undefined)?.cast ||
          (enTv?.credits as { cast?: Record<string, unknown>[] } | undefined)?.cast ||
          []);

      const rawCastSource = aggCast.length > 0 ? aggCast : regCast;
      const cast = rawCastSource.slice(0, 16).map((c, idx) => {
        const roles = Array.isArray(c.roles)
          ? (c.roles as { character?: string }[]).map((r) => r.character).filter(Boolean).join(' / ')
          : '';
        return {
          id: Number(c.id || idx),
          name: String(c.name || ''),
          character: String(roles || c.character || ''),
          profileUrl: tmdbImageUrl(c.profile_path as string | undefined, 'w185'),
          order: Number(c.order ?? idx),
        };
      });

      const arEps = Array.isArray(arSeason?.episodes)
        ? (arSeason.episodes as Record<string, unknown>[])
        : [];
      const enEps = Array.isArray(enSeason?.episodes)
        ? (enSeason.episodes as Record<string, unknown>[])
        : [];

      const enEpMap = new Map<number, Record<string, unknown>>();
      for (const ep of enEps) {
        const num = Number(ep.episode_number || 0);
        if (num > 0) enEpMap.set(num, ep);
      }

      const imdbId = String(
        (tvBase.external_ids as { imdb_id?: string } | undefined)?.imdb_id ||
          (enTv?.external_ids as { imdb_id?: string } | undefined)?.imdb_id ||
          ''
      ).trim();

      const tvOrigLang = String(tvBase.original_language || enTv?.original_language || '').toLowerCase();
      const tvCountries = Array.isArray(tvBase.origin_country)
        ? (tvBase.origin_country as string[]).map((c) => String(c).toUpperCase())
        : [];
      const isAnimeSeries =
        category === 'anime' ||
        Boolean(seriesId && JIKAN_BUILTIN_MAP[seriesId]) ||
        (tvOrigLang === 'ja' && tvCountries.includes('JP'));

      const [omdbRes, jikanRes, tvmazeRes, kitsuRes] = await Promise.allSettled([
        fetchOmdbWorkAndSeason({
          imdbId: imdbId || undefined,
          title: String(enTv?.name || tvBase.original_name || rawOriginalTitle),
          mediaType: 'tv',
          seasonNumber,
        }),
        isAnimeSeries
          ? fetchJikanAnimeExtras({
              seriesId,
              searchTitles: [
                String(enTv?.name || ''),
                String(tvBase.original_name || ''),
                rawOriginalTitle,
              ],
            })
          : Promise.resolve(null),
        fetchTvMazeShowAndSeason({
          imdbId: imdbId || undefined,
          title: String(enTv?.name || tvBase.original_name || rawOriginalTitle),
          seasonNumber,
        }),
        isAnimeSeries
          ? fetchKitsuAnimeExtras({
              searchTitles: [
                String(enTv?.name || ''),
                String(tvBase.original_name || ''),
                rawOriginalTitle,
              ],
            })
          : Promise.resolve(null),
      ]);

      const omdbData = omdbRes.status === 'fulfilled' ? omdbRes.value : null;
      const jikanData = jikanRes.status === 'fulfilled' ? jikanRes.value : null;
      const tvmazeData = tvmazeRes.status === 'fulfilled' ? tvmazeRes.value : null;
      const kitsuData = kitsuRes.status === 'fulfilled' ? kitsuRes.value : null;
      const sourcesUsed: ('tmdb' | 'omdb' | 'jikan' | 'tvmaze' | 'kitsu')[] = ['tmdb'];
      if (omdbData) sourcesUsed.push('omdb');
      if (jikanData) sourcesUsed.push('jikan');
      if (kitsuData) sourcesUsed.push('kitsu');
      if (tvmazeData) sourcesUsed.push('tvmaze');

      const sourceEps = arEps.length > 0 ? arEps : enEps;
      const episodes = sourceEps.map((ep) => {
        const epNum = Number(ep.episode_number || 0);
        const enEp = enEpMap.get(epNum);
        const jikanEp = jikanData?.episodesFallback?.[epNum];
        const tvmazeEp = tvmazeData?.episodes?.[epNum];
        const kitsuEp = kitsuData?.episodesFallback?.[epNum];
        const omdbEp = omdbData?.episodeImdbRatings?.[epNum];
        const runtime = Number(ep.runtime || enEp?.runtime || 0);
        const rawGuestStars = Array.isArray(ep.guest_stars) && ep.guest_stars.length > 0
          ? (ep.guest_stars as Record<string, unknown>[])
          : Array.isArray(enEp?.guest_stars)
          ? (enEp.guest_stars as Record<string, unknown>[])
          : [];

        const guestStars = rawGuestStars.slice(0, 8).map((g) => ({
          id: Number(g.id || 0),
          name: String(g.name || ''),
          character: String(g.character || ''),
          profileUrl: tmdbImageUrl(g.profile_path as string | undefined, 'w185'),
        }));

        const rawNameAr = String(ep.name || '').trim();
        const rawNameEn = String(enEp?.name || tvmazeEp?.name || kitsuEp?.title || jikanEp?.title || '').trim();
        const isGenericPlaceholderName = (s: string) =>
          /^(?:الحلقة|Episode|Capítulo|Épisode|Episodio|Folge)\s*\d+$/i.test(s);
        const nameEn =
          rawNameEn && !isGenericPlaceholderName(rawNameEn)
            ? rawNameEn
            : rawNameAr;
        const nameArOrBest =
          rawNameAr && !isGenericPlaceholderName(rawNameAr)
            ? rawNameAr
            : nameEn || rawNameAr;
        const overviewArOrBest = String(
          ep.overview || enEp?.overview || tvmazeEp?.summary || kitsuEp?.synopsis || ''
        ).trim();
        const overviewEn = String(
          enEp?.overview || tvmazeEp?.summary || kitsuEp?.synopsis || ep.overview || ''
        ).trim();

        return {
          episodeNumber: epNum,
          seasonNumber,
          name: nameArOrBest,
          nameEn,
          overview: overviewArOrBest,
          overviewEn,
          airDate: String(ep.air_date || enEp?.air_date || jikanEp?.aired || ''),
          runtimeMinutes: runtime,
          durationText: formatRuntimeDuration(runtime),
          stillUrl:
            tmdbImageUrl((ep.still_path || enEp?.still_path) as string | undefined, 'w780') ||
            tvmazeEp?.stillUrl ||
            kitsuEp?.stillUrl ||
            '',
          imdbRating: omdbEp?.imdbRating,
          guestStars,
        };
      });

      const tmdbRating = Number(Number(tvBase.vote_average || enTv?.vote_average || 0).toFixed(1));

      const payload = {
        ok: true,
        configured: true,
        found: true,
        tmdbId: resolvedTmdbId,
        imdbId: omdbData?.imdbId || imdbId || undefined,
        mediaType: 'tv' as const,
        title: String(tvBase.name || enTv?.name || '').trim(),
        originalTitle: String(tvBase.original_name || enTv?.original_name || '').trim(),
        overview: String(tvBase.overview || enTv?.overview || '').trim(),
        posterUrl: tmdbImageUrl(
          (tvBase.poster_path || enTv?.poster_path) as string | undefined,
          'w500'
        ),
        backdropUrl: tmdbImageUrl(
          (tvBase.backdrop_path || enTv?.backdrop_path) as string | undefined,
          'w1280'
        ),
        rating: tmdbRating,
        releaseDate: String(tvBase.first_air_date || enTv?.first_air_date || ''),
        genres: Array.isArray(tvBase.genres)
          ? (tvBase.genres as { name?: string }[]).map((g) => String(g.name || '')).filter(Boolean)
          : [],
        seasonsCount: Number(tvBase.number_of_seasons || enTv?.number_of_seasons || 1),
        cast,
        sourcesUsed,
        externalRatings: {
          tmdb: tmdbRating || undefined,
          imdb: omdbData?.imdbRating,
          imdbVotes: omdbData?.imdbVotes,
          rottenTomatoes: omdbData?.rottenTomatoes,
          metascore: omdbData?.metascore,
          rated: omdbData?.rated || jikanData?.rating,
          awards: omdbData?.awards,
          malScore: jikanData?.malScore,
          malRank: jikanData?.malRank,
          malScoredBy: jikanData?.malScoredBy,
          malId: jikanData?.malId,
          studios: jikanData?.studios,
          tvmazeRating: tvmazeData?.tvmazeRating,
          network: tvmazeData?.networkName,
          kitsuScore: kitsuData?.kitsuScore,
          kitsuRank: kitsuData?.kitsuRank,
        },
        ...(jikanData ? { animeExtras: jikanData } : {}),
        episodes,
      };

      const tvCacheKey = `${resolvedMediaType}:${resolvedTmdbId}:s${seasonNumber}`;
      if (tmdbEnrichCache.size > 400) tmdbEnrichCache.clear();
      tmdbEnrichCache.set(tvCacheKey, {
        expiresAt: Date.now() + 6 * 60 * 60 * 1000,
        payload,
      });

      res.json(payload);
    } catch (err) {
      console.error('TMDB enrich error:', err);
      res.status(502).json({ ok: false, error: 'TMDB enrich failed' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: false,
        hmr: false,
      },
      appType: 'spa',
    });

    // HMR is disabled in this environment; prevent @vite/client from opening a failing WS on port 24678
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (result?.code) {
          const patched = result.code
            .replace(
              'transport.connect(createHMRHandler(handleMessage));',
              '/* HMR WebSocket disabled */'
            )
            .replace(
              'else throw new SendBeforeConnectError("send was called before connect");',
              'else return;'
            )
            .replace(
              'else throw new SendBeforeConnectError("invoke was called before connect");',
              'else return;'
            );
          res.type('application/javascript').send(patched);
          return;
        }
        next();
      } catch (err) {
        next(err);
      }
    });

    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(DIST_DIR, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      })
    );
    app.use(express.static(path.resolve(__dirname, 'public')));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AniVerse server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AniVerse server:', err);
  process.exit(1);
});
