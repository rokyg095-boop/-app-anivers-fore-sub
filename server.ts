import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE_PATH = path.resolve(__dirname, 'src', 'data', 'savedEpisodeSources.json');
const BACKUP_FILE_PATH = path.resolve(__dirname, 'src', 'data', 'savedEpisodeSources.backup.json');
const DIST_DIR = path.resolve(__dirname, 'dist');
const PORT = Number(process.env.PORT) || 3000;

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
