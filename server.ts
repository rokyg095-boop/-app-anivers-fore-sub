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

const tmdbEnrichCache = new Map<string, { expiresAt: number; payload: Record<string, unknown> }>();
const tmdbSearchCache = new Map<string, { expiresAt: number; results: unknown[] }>();

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

  // TMDB API Status
  app.get('/api/tmdb/status', (_req, res) => {
    res.json({
      ok: true,
      configured: Boolean(getTmdbApiKey()),
    });
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
        const savedMappings = readTmdbMappingsFromDisk();
        const saved = savedMappings[seriesId];
        if (saved?.tmdbId) {
          resolvedTmdbId = saved.tmdbId;
          resolvedMediaType = saved.mediaType;
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
            append_to_response: 'credits',
          }),
          fetchTmdbJson<Record<string, unknown>>(`/movie/${resolvedTmdbId}`, {
            language: 'en-US',
            append_to_response: 'credits',
          }),
        ]);

        if (!arMovie && !enMovie && !explicitTmdbId) {
          const fallbackId = await discoverTmdbIdByTitle('movie');
          if (fallbackId && fallbackId !== resolvedTmdbId) {
            resolvedTmdbId = fallbackId;
            [arMovie, enMovie] = await Promise.all([
              fetchTmdbJson<Record<string, unknown>>(`/movie/${resolvedTmdbId}`, {
                language: 'ar',
                append_to_response: 'credits',
              }),
              fetchTmdbJson<Record<string, unknown>>(`/movie/${resolvedTmdbId}`, {
                language: 'en-US',
                append_to_response: 'credits',
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
        const overview = String(base.overview || enMovie?.overview || '').trim();
        const releaseDate = String(base.release_date || enMovie?.release_date || '');

        const payload = {
          ok: true,
          configured: true,
          found: true,
          tmdbId: resolvedTmdbId,
          mediaType: 'movie' as const,
          title,
          originalTitle: String(base.original_title || enMovie?.original_title || title),
          overview,
          posterUrl: tmdbImageUrl((base.poster_path || enMovie?.poster_path) as string | undefined, 'w500'),
          backdropUrl: tmdbImageUrl(
            (base.backdrop_path || enMovie?.backdrop_path) as string | undefined,
            'w1280'
          ),
          rating: Number(Number(base.vote_average || enMovie?.vote_average || 0).toFixed(1)),
          releaseDate,
          genres: Array.isArray(base.genres)
            ? (base.genres as { name?: string }[]).map((g) => String(g.name || '')).filter(Boolean)
            : [],
          seasonsCount: 1,
          cast,
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
          append_to_response: 'aggregate_credits,credits',
        }),
        fetchTmdbJson<Record<string, unknown>>(`/tv/${resolvedTmdbId}`, {
          language: 'en-US',
          append_to_response: 'aggregate_credits,credits',
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
              append_to_response: 'aggregate_credits,credits',
            }),
            fetchTmdbJson<Record<string, unknown>>(`/tv/${resolvedTmdbId}`, {
              language: 'en-US',
              append_to_response: 'aggregate_credits,credits',
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

      const sourceEps = arEps.length > 0 ? arEps : enEps;
      const episodes = sourceEps.map((ep) => {
        const epNum = Number(ep.episode_number || 0);
        const enEp = enEpMap.get(epNum);
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
        const rawNameEn = String(enEp?.name || '').trim();
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
        const overviewArOrBest = String(ep.overview || enEp?.overview || '').trim();
        const overviewEn = String(enEp?.overview || ep.overview || '').trim();

        return {
          episodeNumber: epNum,
          seasonNumber,
          name: nameArOrBest,
          nameEn,
          overview: overviewArOrBest,
          overviewEn,
          airDate: String(ep.air_date || enEp?.air_date || ''),
          runtimeMinutes: runtime,
          durationText: formatRuntimeDuration(runtime),
          stillUrl: tmdbImageUrl((ep.still_path || enEp?.still_path) as string | undefined, 'w780'),
          guestStars,
        };
      });

      const payload = {
        ok: true,
        configured: true,
        found: true,
        tmdbId: resolvedTmdbId,
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
        rating: Number(Number(tvBase.vote_average || enTv?.vote_average || 0).toFixed(1)),
        releaseDate: String(tvBase.first_air_date || enTv?.first_air_date || ''),
        genres: Array.isArray(tvBase.genres)
          ? (tvBase.genres as { name?: string }[]).map((g) => String(g.name || '')).filter(Boolean)
          : [],
        seasonsCount: Number(tvBase.number_of_seasons || enTv?.number_of_seasons || 1),
        cast,
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
    app.use(express.static(DIST_DIR));
    app.get('*', (_req, res) => {
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
