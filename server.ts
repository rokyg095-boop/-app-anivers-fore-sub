import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ADMIN_EMAIL } from './src/adminConfig.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE_PATH = path.resolve(__dirname, 'src', 'data', 'savedEpisodeSources.json');
const BACKUP_FILE_PATH = path.resolve(__dirname, 'src', 'data', 'savedEpisodeSources.backup.json');
const DIST_DIR = path.resolve(__dirname, 'dist');
const PORT = Number(process.env.PORT) || 3000;

// Same rule as EPISODE_ID_PATTERN in src/utils/videoSource.ts and isValidId() in firestore.rules
const EPISODE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isValidEpisodeId(id: unknown): id is string {
  return typeof id === 'string' && EPISODE_ID_PATTERN.test(id) && !RESERVED_KEYS.has(id);
}

// ---------------------------------------------------------------------------
// Admin authentication for write endpoints.
// The browser sends the signed-in admin's Firebase ID token as "Authorization: Bearer <token>".
// The token is verified locally against Google's published signing certificates (no extra deps).
// ---------------------------------------------------------------------------
const FIREBASE_PROJECT_ID: string = (() => {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf8'));
    return typeof cfg?.projectId === 'string' ? cfg.projectId : '';
  } catch {
    return '';
  }
})();

const GOOGLE_SECURETOKEN_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedSigningKeys: { keys: Record<string, crypto.KeyObject>; expiresAt: number } | null = null;

async function getGoogleSigningKeys(forceRefresh = false): Promise<Record<string, crypto.KeyObject>> {
  if (!forceRefresh && cachedSigningKeys && cachedSigningKeys.expiresAt > Date.now()) {
    return cachedSigningKeys.keys;
  }
  const res = await fetch(GOOGLE_SECURETOKEN_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Google signing certificates (HTTP ${res.status})`);
  }
  const pems = (await res.json()) as Record<string, string>;
  const keys: Record<string, crypto.KeyObject> = {};
  for (const [kid, pem] of Object.entries(pems)) {
    keys[kid] = new crypto.X509Certificate(pem).publicKey;
  }
  const maxAgeMatch = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedSigningKeys = { keys, expiresAt: Date.now() + maxAgeSeconds * 1000 };
  return keys;
}

function decodeJwtSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

async function verifyFirebaseIdToken(token: string): Promise<Record<string, unknown>> {
  if (!FIREBASE_PROJECT_ID) throw new Error('Firebase projectId is not configured');

  const segments = token.split('.');
  if (segments.length !== 3) throw new Error('Malformed token');
  const [headerB64, payloadB64, signatureB64] = segments;

  const header = decodeJwtSegment(headerB64);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new Error('Unsupported token header');
  }

  let key = (await getGoogleSigningKeys())[header.kid];
  if (!key) {
    // Google rotates keys; refresh once before rejecting
    key = (await getGoogleSigningKeys(true))[header.kid];
  }
  if (!key) throw new Error('Unknown signing key');

  const signatureOk = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    key,
    Buffer.from(signatureB64, 'base64url')
  );
  if (!signatureOk) throw new Error('Invalid token signature');

  const claims = decodeJwtSegment(payloadB64);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const clockSkew = 300;
  if (claims.aud !== FIREBASE_PROJECT_ID) throw new Error('Token audience mismatch');
  if (claims.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) throw new Error('Token issuer mismatch');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('Token subject missing');
  if (typeof claims.exp !== 'number' || claims.exp + clockSkew < nowSeconds) throw new Error('Token expired');
  if (typeof claims.iat !== 'number' || claims.iat - clockSkew > nowSeconds) throw new Error('Token issued in the future');
  return claims;
}

const requireAdmin: express.RequestHandler = async (req, res, next) => {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
  if (!match) {
    res.status(401).json({ ok: false, error: 'ADMIN_AUTH_REQUIRED' });
    return;
  }
  try {
    const claims = await verifyFirebaseIdToken(match[1]);
    if (claims.email !== ADMIN_EMAIL || claims.email_verified !== true) {
      res.status(403).json({ ok: false, error: 'ADMIN_ONLY' });
      return;
    }
    next();
  } catch (err) {
    console.warn('Rejected admin token:', err instanceof Error ? err.message : err);
    res.status(401).json({ ok: false, error: 'INVALID_ADMIN_TOKEN' });
  }
};

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

// ---------------------------------------------------------------------------
// Input hardening: only well-formed link records are stored, and only http(s) or same-site paths are
// accepted as URLs — a "javascript:" link would otherwise end up in the player's <iframe src>.
// ---------------------------------------------------------------------------
function safeUrl(value: unknown, maxLength = 1000): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().slice(0, maxLength);
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  return '';
}

function safeText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function sanitizeEpisodeRecord(raw: unknown): EpisodeSourceRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const record: EpisodeSourceRecord = {
    videoUrl: safeUrl(r.videoUrl),
    driveLink: safeUrl(r.driveLink),
    accountLabel: safeText(r.accountLabel, 120),
    backupDriveLinks: Array.isArray(r.backupDriveLinks)
      ? r.backupDriveLinks
          .slice(0, 10)
          .map((b, i) => {
            const link = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
            return {
              id: safeText(link.id, 80) || `backup-${i + 2}`,
              url: safeUrl(link.url),
              accountLabel: safeText(link.accountLabel, 120),
            };
          })
          .filter((b) => b.url)
      : [],
    subtitles: Array.isArray(r.subtitles)
      ? r.subtitles
          .slice(0, 10)
          .map((s, i) => {
            const track = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
            return {
              id: safeText(track.id, 60) || `sub-${i}`,
              lang: safeText(track.lang, 24) || 'ar',
              label: safeText(track.label, 80) || 'Subtitle',
              src: safeUrl(track.src, 500),
              default: track.default === true,
            };
          })
          .filter((s) => s.src)
      : [],
  };
  if (typeof r.updatedAt === 'string') record.updatedAt = r.updatedAt.slice(0, 40);
  return record;
}

// Small in-memory fixed-window rate limiter (per client IP). Enough for a single-instance server.
function createRateLimiter(limit: number, windowMs: number): express.RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429).json({ ok: false, error: 'RATE_LIMITED' });
      return;
    }
    next();
  };
}

// "npm start" passes --production; NODE_ENV=production works too.
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.argv.includes('--production');

async function startServer(): Promise<void> {
  const app = express();
  app.disable('x-powered-by');
  // Behind Cloud Run's proxy, trust its X-Forwarded-* headers (real client IP for rate limiting, https detection).
  // Locally there is no proxy, so the header is not trusted (clients could spoof it).
  if (process.env.K_SERVICE) app.set('trust proxy', 1);

  // Baseline security headers. Framing is deliberately not restricted (AI Studio previews the app in an iframe),
  // and no strict script CSP is set because the player embeds Google Drive and Firebase loads Google scripts.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    res.setHeader('Content-Security-Policy', "object-src 'none'; base-uri 'self'");
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  });

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '2mb' }));

  const readLimiter = createRateLimiter(240, 60_000);
  const writeLimiter = createRateLimiter(60, 60_000);

  // Get all saved episode sources
  app.get('/api/episode-sources', readLimiter, (_req, res) => {
    const sources = readSourcesFromDisk();
    res.json({ ok: true, sources });
  });

  // Bulk import / sync episode sources (must come before :episodeId route)
  app.post('/api/episode-sources/bulk/import', writeLimiter, requireAdmin, (req, res) => {
    try {
      const incoming = req.body?.sources;
      const mode = req.body?.mode === 'replace' ? 'replace' : 'merge';
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
        res.status(400).json({ ok: false, error: 'Invalid sources payload' });
        return;
      }

      const accepted: Record<string, EpisodeSourceRecord> = {};
      for (const [episodeId, record] of Object.entries(incoming as Record<string, unknown>)) {
        const clean = isValidEpisodeId(episodeId) ? sanitizeEpisodeRecord(record) : null;
        if (clean) accepted[episodeId] = clean;
      }

      const existing = mode === 'replace' ? {} : readSourcesFromDisk();
      const next: Record<string, EpisodeSourceRecord> = {
        ...existing,
        ...accepted,
      };

      writeSourcesToDisk(next);
      res.json({ ok: true, sources: next });
    } catch (err) {
      console.error('Error bulk importing episode sources:', err);
      res.status(500).json({ ok: false, error: 'Failed to import episode sources' });
    }
  });

  // Save or update a single episode source
  app.post('/api/episode-sources/:episodeId', writeLimiter, requireAdmin, (req, res) => {
    try {
      // Express already URL-decodes route params
      const episodeId = (req.params.episodeId || '').trim();
      if (!isValidEpisodeId(episodeId)) {
        res.status(400).json({ ok: false, error: 'Invalid episodeId' });
        return;
      }

      const body = sanitizeEpisodeRecord(req.body);
      if (!body) {
        res.status(400).json({ ok: false, error: 'Invalid episode source payload' });
        return;
      }
      const existing = readSourcesFromDisk();

      existing[episodeId] = {
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
  app.delete('/api/episode-sources/:episodeId', writeLimiter, requireAdmin, (req, res) => {
    try {
      const episodeId = (req.params.episodeId || '').trim();
      if (!isValidEpisodeId(episodeId)) {
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

  // Unknown API routes get a JSON 404 instead of falling through to the SPA's index.html
  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: 'NOT_FOUND' });
  });

  const hasBuild = fs.existsSync(path.join(DIST_DIR, 'index.html'));
  if (IS_PRODUCTION && !hasBuild) {
    console.error('Production mode requested but dist/ is missing — run "npm run build" first. Falling back to dev mode.');
  }

  if (!IS_PRODUCTION || !hasBuild) {
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
          const patched = result.code.replace(
            'transport.connect(createHMRHandler(handleMessage));',
            '/* HMR WebSocket disabled */'
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
    const hashedAssetsDir = path.join(DIST_DIR, 'assets');
    app.use(
      express.static(DIST_DIR, {
        index: false,
        setHeaders(res, filePath) {
          // Vite's fingerprinted bundles (dist/assets/name-HASH.js|css) never change → cache for a year.
          // Everything else (media copied from public/, index.html) is revalidated.
          if (path.dirname(filePath) === hashedAssetsDir) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
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
