import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Image as ImageIcon,
  Upload,
  CheckCircle2,
  Sparkles,
  Trash2,
  Edit3,
  Link2,
  Tv,
  Film,
  Volume2,
  AlertCircle,
  Save,
  Cloud,
  Clapperboard,
  Download,
  Flame,
  TrendingUp,
  Award,
  Search,
  Check,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Play,
} from 'lucide-react';
import {
  CustomWorkCategory,
  CustomWorkRecord,
  buildDubSeriesFromCustomWork,
  compressImageFileToDataUrl,
  formatCloudErrorMessage,
  saveCustomWorkToCloud,
  deleteCustomWorkFromCloud,
  getCustomWorkRecords,
  CUSTOM_WORKS_UPDATED_EVENT,
} from '../utils/customWorks.ts';
import { saveSeasonEpisodesOverrideToCloud } from '../utils/catalogOverrides.ts';
import {
  DEFAULT_SUBTITLE_TRACKS,
  extractDriveFileId,
  getCustomEpisodeSource,
  normalizeDriveDirectUrl,
  saveCustomEpisodeSource,
  saveCustomEpisodeSourcesBatch,
} from '../utils/videoSource.ts';
import {
  ADMIN_EMAIL,
  isVerifiedAdminUser,
  signInWithGoogleAdmin,
  subscribeAuthState,
} from '../firebase.ts';
import {
  ApiDiscoverFeed,
  ApiDiscoverItem,
  ArchiveSearchItem,
  buildApiImportWorkId,
  discoverArchiveWorks,
  discoverWorksFromApis,
  fetchArchiveItemDetails,
  fetchTmdbEnrichmentForWork,
  saveTmdbWorkMapping,
  searchTmdbWorks,
  TmdbSearchResult,
} from '../utils/tmdbMetadata.ts';
import type { User } from 'firebase/auth';

interface AdminCreateWorkModalProps {
  isOpen: boolean;
  defaultCategory: CustomWorkCategory;
  onClose: () => void;
  onOpenLinksDashboard?: (seriesId: string, episodeId?: string) => void;
}

const CATEGORY_INFO: Record<
  CustomWorkCategory,
  { label: string; buttonText: string; badgeClass: string; icon: React.ReactNode }
> = {
  anime: {
    label: 'قسم الأنمي',
    buttonText: 'نشر الأنمي في القسم',
    badgeClass: 'bg-rose-600/20 text-rose-400 border-rose-500/30',
    icon: <Tv className="w-4 h-4 text-rose-400" />,
  },
  movie: {
    label: 'قسم الأفلام',
    buttonText: 'نشر الفيلم في القسم',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    icon: <Film className="w-4 h-4 text-amber-400" />,
  },
  dubbed: {
    label: 'قسم الأنميشن والكرتون',
    buttonText: 'نشر المسلسل في القسم',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: <Volume2 className="w-4 h-4 text-emerald-400" />,
  },
  tv: {
    label: 'المسلسلات التلفزيونية',
    buttonText: 'نشر المسلسل التلفزيوني في القسم',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    icon: <Clapperboard className="w-4 h-4 text-sky-400" />,
  },
};

export const AdminCreateWorkModal: React.FC<AdminCreateWorkModalProps> = ({
  isOpen,
  defaultCategory,
  onClose,
  onOpenLinksDashboard,
}) => {
  const [category, setCategory] = useState<CustomWorkCategory>(defaultCategory);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('');
  const [originalTitle, setOriginalTitle] = useState<string>('');
  const [coverImage, setCoverImage] = useState<string>('');
  const [synopsis, setSynopsis] = useState<string>('');
  const [genresText, setGenresText] = useState<string>('مغامرات، أكشن');
  const [dubStudio, setDubStudio] = useState<string>('');
  const [videoLink, setVideoLink] = useState<string>('');
  const [seasonsCount, setSeasonsCount] = useState<number>(1);
  const [episodesCount, setEpisodesCount] = useState<number>(12);
  const [rating, setRating] = useState<number>(9.2);
  const [saving, setSaving] = useState<boolean>(false);
  const [imageProcessing, setImageProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedWork, setSavedWork] = useState<CustomWorkRecord | null>(null);
  const [savedWorkHasLink, setSavedWorkHasLink] = useState<boolean>(false);
  const [existingList, setExistingList] = useState<CustomWorkRecord[]>([]);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [tmdbQuery, setTmdbQuery] = useState<string>('');
  const [tmdbSearching, setTmdbSearching] = useState<boolean>(false);
  const [tmdbResults, setTmdbResults] = useState<TmdbSearchResult[]>([]);
  const [selectedTmdbMatch, setSelectedTmdbMatch] = useState<TmdbSearchResult | null>(null);

  // Multi-source API Bulk Grabber state
  const [modalMode, setModalMode] = useState<'archive' | 'grab' | 'manual'>('archive');
  const [grabFeed, setGrabFeed] = useState<ApiDiscoverFeed>('popular');
  const [grabQuery, setGrabQuery] = useState<string>('');
  const [grabSubmittedQuery, setGrabSubmittedQuery] = useState<string>('');
  const [grabPage, setGrabPage] = useState<number>(1);
  const [grabTotalPages, setGrabTotalPages] = useState<number>(1);
  const [grabLoading, setGrabLoading] = useState<boolean>(false);
  const [grabResults, setGrabResults] = useState<ApiDiscoverItem[]>([]);
  const [selectedGrabKeys, setSelectedGrabKeys] = useState<string[]>([]);
  const [bulkImporting, setBulkImporting] = useState<boolean>(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);

  // Internet Archive (archive.org) Full Playable Video state
  const [archiveQuery, setArchiveQuery] = useState<string>('');
  const [archiveSubmittedQuery, setArchiveSubmittedQuery] = useState<string>('');
  const [archivePage, setArchivePage] = useState<number>(1);
  const [archiveTotalPages, setArchiveTotalPages] = useState<number>(1);
  const [archiveLoading, setArchiveLoading] = useState<boolean>(false);
  const [archiveResults, setArchiveResults] = useState<ArchiveSearchItem[]>([]);
  const [importingArchiveId, setImportingArchiveId] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const modalBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeAuthState((user) => {
      setAuthUser(user);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (isOpen) {
      setCategory(defaultCategory);
      setModalMode('archive');
      setEditingWorkId(null);
      setSavedWork(null);
      setErrorMsg(null);
      setBulkSuccessMsg(null);
      setSelectedGrabKeys([]);
      setGrabPage(1);
      setArchivePage(1);
    }
  }, [isOpen, defaultCategory]);

  useEffect(() => {
    const refreshList = () => {
      setExistingList(getCustomWorkRecords(category));
    };
    refreshList();
    window.addEventListener(CUSTOM_WORKS_UPDATED_EVENT, refreshList);
    return () => window.removeEventListener(CUSTOM_WORKS_UPDATED_EVENT, refreshList);
  }, [category, isOpen]);

  useEffect(() => {
    if (!isOpen || modalMode !== 'grab') return;
    let cancelled = false;
    setGrabLoading(true);
    setErrorMsg(null);
    void discoverWorksFromApis({
      category,
      feed: grabFeed,
      query: grabSubmittedQuery,
      page: grabPage,
    }).then((res) => {
      if (cancelled) return;
      setGrabResults(Array.isArray(res.results) ? res.results : []);
      setGrabTotalPages(Math.max(1, res.totalPages || 1));
      setGrabLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, modalMode, category, grabFeed, grabSubmittedQuery, grabPage]);

  useEffect(() => {
    if (!isOpen || modalMode !== 'archive') return;
    let cancelled = false;
    setArchiveLoading(true);
    setErrorMsg(null);
    void discoverArchiveWorks({
      category,
      query: archiveSubmittedQuery,
      page: archivePage,
    }).then((res) => {
      if (cancelled) return;
      setArchiveResults(Array.isArray(res.results) ? res.results : []);
      setArchiveTotalPages(Math.max(1, res.totalPages || 1));
      setArchiveLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, modalMode, category, archiveSubmittedQuery, archivePage]);

  if (!isOpen) return null;

  const isOwnerVerified = isVerifiedAdminUser(authUser);

  const handleOwnerLogin = async () => {
    setAuthLoading(true);
    setErrorMsg(null);
    try {
      const user = await signInWithGoogleAdmin();
      if (!isVerifiedAdminUser(user)) {
        setErrorMsg(`الحساب (${user.email || ''}) غير مخول للنشر. يرجى الدخول بحساب المالك (${ADMIN_EMAIL}).`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تسجيل الدخول عبر Google');
    } finally {
      setAuthLoading(false);
    }
  };

  const scrollBodyTop = () => {
    setTimeout(() => {
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, 50);
  };

  const resetForm = () => {
    setEditingWorkId(null);
    setTitle('');
    setOriginalTitle('');
    setCoverImage('');
    setSynopsis('');
    setGenresText(category === 'movie' ? 'سينما، مغامرات' : 'مغامرات، أكشن');
    setDubStudio('');
    setVideoLink('');
    setSeasonsCount(1);
    setEpisodesCount(category === 'movie' ? 1 : 12);
    setRating(9.2);
    setSelectedTmdbMatch(null);
    setTmdbResults([]);
    setTmdbQuery('');
    setErrorMsg(null);
  };

  const handleTmdbSearch = async () => {
    const q = (tmdbQuery || title || originalTitle).trim();
    if (!q) return;
    setTmdbSearching(true);
    setErrorMsg(null);
    try {
      const searchType = category === 'movie' ? 'movie' : 'tv';
      const { configured, results } = await searchTmdbWorks(q, searchType);
      if (!configured) {
        setErrorMsg('مفتاح TMDB_API_KEY غير متاح بعد في إعدادات السيرفر.');
      } else if (results.length === 0) {
        setErrorMsg(`لم يتم العثور على نتائج في TMDB لـ «${q}» — جرب الاسم الإنجليزي.`);
      }
      setTmdbResults(results);
    } finally {
      setTmdbSearching(false);
    }
  };

  const handlePickTmdbResult = async (item: TmdbSearchResult) => {
    setSelectedTmdbMatch(item);
    setTitle(item.title || item.originalTitle);
    setOriginalTitle(item.originalTitle || item.title);
    if (item.posterUrl) setCoverImage(item.posterUrl);
    if (item.overview) setSynopsis(item.overview);
    if (item.voteAverage > 0) setRating(item.voteAverage);
    setTmdbResults([]);

    // Fetch full details (genres, exact seasons & episodes count)
    const full = await fetchTmdbEnrichmentForWork(
      {
        id: `tmdb-preview-${item.tmdbId}`,
        title: item.title,
        originalTitle: item.originalTitle,
        category: item.mediaType === 'movie' ? 'movie' : category,
      },
      1,
      true
    );
    if (full?.found) {
      if (full.title) setTitle(full.title);
      if (full.originalTitle) setOriginalTitle(full.originalTitle);
      if (full.overview) setSynopsis(full.overview);
      if (full.posterUrl) setCoverImage(full.posterUrl);
      if (full.genres && full.genres.length > 0) setGenresText(full.genres.slice(0, 4).join('، '));
      if (full.rating && full.rating > 0) setRating(full.rating);
      if (item.mediaType !== 'movie') {
        if (full.seasonsCount && full.seasonsCount > 0) setSeasonsCount(full.seasonsCount);
        if (full.episodes && full.episodes.length > 0) {
          setEpisodesCount(
            Math.max(full.episodes.length, (full.seasonsCount || 1) * full.episodes.length)
          );
        }
      }
    }
  };

  const getGrabItemKey = (item: ApiDiscoverItem) => `${item.source}:${item.externalId}`;

  const existingWorkIdsSet = new Set(existingList.map((w) => w.workId));

  const toggleGrabSelection = (item: ApiDiscoverItem) => {
    const key = getGrabItemKey(item);
    setSelectedGrabKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const autoPopulateTmdbSeasonsForWork = async (
    saved: CustomWorkRecord,
    itemMediaType: 'movie' | 'tv'
  ) => {
    if (saved.category === 'movie' && itemMediaType !== 'tv') return;
    try {
      const builtSeries = buildDubSeriesFromCustomWork(saved);
      const seasonsToSync = builtSeries.seasons.slice(0, 6);
      for (const season of seasonsToSync) {
        const sEnrich = await fetchTmdbEnrichmentForWork(
          {
            id: saved.workId,
            title: saved.title,
            originalTitle: saved.originalTitle,
            category: saved.category,
          },
          season.seasonNumber,
          false
        );
        const tmdbEps = sEnrich?.episodes || [];
        if (tmdbEps.length > 0) {
          const syncedEps = tmdbEps.map((tmEp, epIdx) => {
            const epNum = tmEp.episodeNumber || epIdx + 1;
            const epId =
              season.seasonNumber === 1
                ? `${saved.workId}-ep-${epNum}`
                : `${saved.workId}-s${season.seasonNumber}-ep-${epNum}`;
            return {
              id: epId,
              episodeNumber: epNum,
              title: tmEp.name || tmEp.nameEn || `الحلقة ${epNum}`,
              duration: tmEp.durationText || '24:00',
              thumbnail: tmEp.stillUrl || saved.coverImage,
              videoUrl: '',
              dubStudio: saved.dubStudio,
              voiceActors: [saved.dubStudio],
              releaseDate: tmEp.airDate || 'TMDB',
              description: tmEp.overview || tmEp.overviewEn || saved.synopsis,
              isComingSoon: true,
            };
          });
          await saveSeasonEpisodesOverrideToCloud(builtSeries, season, syncedEps, season.title);
        }
      }
    } catch {
      // Non-fatal: work itself is already saved
    }
  };

  const handleImportDiscoverItems = async (itemsToImport: ApiDiscoverItem[]) => {
    if (!isOwnerVerified) {
      setErrorMsg(
        `يرجى تسجيل الدخول بحساب المالك (${ADMIN_EMAIL}) بالأعلى أولاً لحفظ الأعمال المستوردة في السحابة.`
      );
      scrollBodyTop();
      return;
    }
    if (itemsToImport.length === 0) return;

    setBulkImporting(true);
    setBulkSuccessMsg(null);
    setErrorMsg(null);
    setBulkProgress({ done: 0, total: itemsToImport.length });

    let successCount = 0;
    let lastSaved: CustomWorkRecord | null = null;

    try {
      for (let idx = 0; idx < itemsToImport.length; idx += 1) {
        const item = itemsToImport[idx];
        const workId = buildApiImportWorkId(category, item);

        let seasonsCount = 1;
        let episodesCount = category === 'movie' ? 1 : item.episodesCount || 12;
        let genres = item.genres && item.genres.length > 0 ? item.genres : [];
        let title = item.title || item.originalTitle;
        let originalTitle = item.originalTitle || item.title;
        let synopsis = item.overview;
        let posterUrl = item.posterUrl;
        let backdropUrl = item.backdropUrl || item.posterUrl;
        let rating = item.voteAverage > 0 ? item.voteAverage : 8.2;

        if (item.tmdbId) {
          try {
            const enriched = await fetchTmdbEnrichmentForWork(
              {
                id: workId,
                title,
                originalTitle,
                category,
              },
              1,
              false
            );
            if (enriched?.found) {
              if (enriched.title) title = enriched.title;
              if (enriched.originalTitle) originalTitle = enriched.originalTitle;
              if (enriched.overview) synopsis = enriched.overview;
              if (enriched.posterUrl) posterUrl = enriched.posterUrl;
              if (enriched.backdropUrl) backdropUrl = enriched.backdropUrl;
              if (enriched.genres && enriched.genres.length > 0) genres = enriched.genres.slice(0, 5);
              if (enriched.rating && enriched.rating > 0) rating = enriched.rating;
              if (category !== 'movie') {
                seasonsCount = Math.min(30, Math.max(1, enriched.seasonsCount || 1));
                const epLen = enriched.episodes?.length || 12;
                episodesCount = Math.min(300, Math.max(1, epLen * seasonsCount));
              }
            }
          } catch {
            // fallback to discover metadata
          }
        }

        const safeSynopsis =
          (synopsis || '').trim() ||
          `${title}${item.releaseDate ? ` (${item.releaseDate.slice(0, 4)})` : ''} — تمت إضافته عبر ${item.source.toUpperCase()}.`;

        const saved = await saveCustomWorkToCloud({
          workId,
          category,
          title,
          originalTitle,
          coverImage: posterUrl,
          bannerImage: backdropUrl,
          genres:
            genres.length > 0
              ? genres
              : [category === 'movie' ? 'سينما' : category === 'anime' ? 'أنمي' : 'دراما'],
          dubStudio:
            item.source === 'anilist'
              ? 'AniList'
              : item.source === 'kitsu'
              ? 'Kitsu'
              : item.source === 'omdb'
              ? 'OMDb'
              : 'TMDB',
          rating,
          seasonsCount: category === 'movie' ? 1 : seasonsCount,
          episodesCount: category === 'movie' ? 1 : episodesCount,
          synopsis: safeSynopsis,
        });

        if (item.tmdbId) {
          void saveTmdbWorkMapping(
            saved.workId,
            item.tmdbId,
            item.mediaType,
            saved.originalTitle || saved.title
          );
        }

        await autoPopulateTmdbSeasonsForWork(saved, item.mediaType);

        successCount += 1;
        lastSaved = saved;
        setBulkProgress({ done: idx + 1, total: itemsToImport.length });
      }

      if (lastSaved) {
        setSavedWork(lastSaved);
        setSavedWorkHasLink(false);
      }
      setBulkSuccessMsg(
        `تم جلب ونشر ${successCount} ${category === 'movie' ? 'أفلام' : 'أعمال'} بنجاح في ${
          CATEGORY_INFO[category].label
        } وحفظها في السحابة! يمكنك الآن إضافة روابط Google Drive من أيقونة الرابط.`
      );
      setSelectedGrabKeys([]);
    } catch (err) {
      setErrorMsg(formatCloudErrorMessage(err, 'تعذر إكمال استيراد بعض الأعمال'));
      scrollBodyTop();
    } finally {
      setBulkImporting(false);
      setBulkProgress(null);
    }
  };

  const buildArchiveWorkId = (identifier: string) => {
    const cleanId = identifier
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return `cw-${category}-ia-${cleanId || 'video'}`.slice(0, 100);
  };

  const handleImportArchiveItem = async (item: ArchiveSearchItem) => {
    if (!isOwnerVerified) {
      setErrorMsg(
        `يرجى تسجيل الدخول بحساب المالك (${ADMIN_EMAIL}) بالأعلى أولاً لحفظ العمل وفيديوهاته في السحابة.`
      );
      scrollBodyTop();
      return;
    }

    setImportingArchiveId(item.identifier);
    setBulkSuccessMsg(null);
    setErrorMsg(null);
    setBulkProgress(null);

    try {
      const details = await fetchArchiveItemDetails(item.identifier);
      if (!details || !details.episodes || details.episodes.length === 0) {
        setErrorMsg(
          `العنصر «${item.title}» لا يحتوي على ملفات فيديو MP4 قابلة للتشغيل في المتصفح — اختر عنصراً آخر.`
        );
        scrollBodyTop();
        return;
      }

      const workId = buildArchiveWorkId(item.identifier);
      const isSingleFilm = category === 'movie' && details.episodes.length === 1;
      const epCount = Math.min(150, details.episodes.length);

      const safeSynopsis =
        (details.description || item.description || '').trim() ||
        `${details.title || item.title}${item.year ? ` (${item.year})` : ''} — متاح للمشاهدة المباشرة عبر Archive.org.`;

      const saved = await saveCustomWorkToCloud({
        workId,
        category,
        title: details.title || item.title,
        originalTitle: details.title || item.title,
        coverImage: details.posterUrl || item.posterUrl,
        bannerImage: details.posterUrl || item.posterUrl,
        genres: [
          category === 'movie'
            ? 'سينما'
            : category === 'anime'
            ? 'أنمي'
            : category === 'dubbed'
            ? 'أنيميشن'
            : 'تلفزيون',
          'Archive.org',
        ],
        dubStudio: 'Archive.org (بث مباشر)',
        rating: 8.5,
        seasonsCount: 1,
        episodesCount: epCount,
        synopsis: safeSynopsis,
      });

      const builtSeries = buildDubSeriesFromCustomWork(saved);
      const season1 = builtSeries.seasons[0];

      const playableEpisodes = details.episodes.slice(0, 150).map((ep, idx) => {
        const epNum = ep.episodeNumber || idx + 1;
        const epId = isSingleFilm ? `${workId}-movie-1` : `${workId}-ep-${epNum}`;
        return {
          id: epId,
          episodeNumber: epNum,
          title: isSingleFilm ? `${saved.title} (الفيلم الكامل)` : ep.title,
          duration: ep.duration || '22:00',
          thumbnail: saved.coverImage,
          videoUrl: ep.videoUrl,
          dubStudio: saved.dubStudio,
          voiceActors: [saved.dubStudio],
          releaseDate: details.year || item.year || 'Archive.org',
          description: safeSynopsis,
          isComingSoon: false,
          _directUrl: ep.videoUrl,
          _backupUrl: ep.backupVideoUrl || '',
        };
      });

      // Save all episodes in seasonOverrides (so cards show Ready / playable immediately)
      await saveSeasonEpisodesOverrideToCloud(
        builtSeries,
        season1,
        playableEpisodes.map(({ _directUrl, _backupUrl, ...rest }) => rest),
        isSingleFilm ? 'الفيلم الكامل' : 'الحلقات الكاملة'
      );

      // Persist direct MP4 URLs in fast parallel chunks into Firestore episodeSources
      setBulkProgress({ done: 0, total: playableEpisodes.length });
      const batchRes = await saveCustomEpisodeSourcesBatch(
        playableEpisodes.map((ep) => ({
          episodeId: ep.id,
          config: {
            driveLink: ep._directUrl,
            videoUrl: ep._directUrl,
            accountLabel: 'Archive.org',
            backupDriveLinks: ep._backupUrl
              ? [
                  {
                    id: 'archive-512kb',
                    url: ep._backupUrl,
                    accountLabel: 'Archive.org (MP4 خفيف)',
                  },
                ]
              : [],
            subtitles: DEFAULT_SUBTITLE_TRACKS,
          },
        })),
        (done, total) => setBulkProgress({ done, total })
      );

      if (batchRes.cloudSavedCount === 0) {
        setErrorMsg(
          formatCloudErrorMessage(
            batchRes.cloudError,
            'تم إنشاء العمل لكن تعذر حفظ روابط الفيديو في سحابة Firebase — تأكد من تسجيل الدخول بحساب المالك وأعد المحاولة.'
          )
        );
        scrollBodyTop();
        return;
      }

      setSavedWork(saved);
      setSavedWorkHasLink(true);
      setBulkSuccessMsg(
        `تم جلب «${saved.title}» وربط ${batchRes.cloudSavedCount} ${
          batchRes.cloudSavedCount === 1 ? 'فيلم/فيديو كامل' : 'حلقة فيديو كاملة'
        } للتشغيل الفوري في الموقع بنجاح!`
      );
      scrollBodyTop();
    } catch (err) {
      setErrorMsg(formatCloudErrorMessage(err, 'تعذر جلب العمل وفيديوهاته من Archive.org'));
      scrollBodyTop();
    } finally {
      setImportingArchiveId(null);
      setBulkProgress(null);
    }
  };

  const handleFillManualFromDiscover = async (item: ApiDiscoverItem) => {
    setModalMode('manual');
    setEditingWorkId(null);
    setTitle(item.title || item.originalTitle);
    setOriginalTitle(item.originalTitle || item.title);
    setCoverImage(item.posterUrl || item.backdropUrl);
    setSynopsis(
      item.overview ||
        `${item.title}${item.releaseDate ? ` (${item.releaseDate.slice(0, 4)})` : ''}`
    );
    setGenresText(
      item.genres && item.genres.length > 0
        ? item.genres.join('، ')
        : category === 'movie'
        ? 'سينما، مغامرات'
        : 'مغامرات، أكشن'
    );
    setRating(item.voteAverage > 0 ? item.voteAverage : 8.5);
    if (item.tmdbId) {
      setSelectedTmdbMatch({
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        title: item.title,
        originalTitle: item.originalTitle,
        overview: item.overview,
        posterUrl: item.posterUrl,
        backdropUrl: item.backdropUrl,
        releaseDate: item.releaseDate,
        voteAverage: item.voteAverage,
      });
    } else {
      setSelectedTmdbMatch(null);
    }
    scrollBodyTop();
  };

  const handleSelectEdit = (work: CustomWorkRecord) => {
    const firstEpId =
      work.category === 'movie' ? `${work.workId}-movie-1` : `${work.workId}-ep-1`;
    const existingSource = getCustomEpisodeSource(firstEpId);
    setModalMode('manual');
    setEditingWorkId(work.workId);
    setCategory(work.category);
    setTitle(work.title);
    setOriginalTitle(work.originalTitle);
    setCoverImage(work.coverImage);
    setSynopsis(work.synopsis);
    setGenresText(work.genres.join('، '));
    setDubStudio(work.dubStudio);
    setVideoLink(existingSource?.driveLink || existingSource?.videoUrl || '');
    setSeasonsCount(work.seasonsCount);
    setEpisodesCount(work.episodesCount);
    setRating(work.rating);
    setSavedWork(null);
    setSavedWorkHasLink(false);
    setErrorMsg(null);
    scrollBodyTop();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageProcessing(true);
    setErrorMsg(null);
    try {
      const compressed = await compressImageFileToDataUrl(file);
      setCoverImage(compressed);
    } catch (err) {
      setErrorMsg(formatCloudErrorMessage(err, 'تعذر تحميل الصورة'));
      scrollBodyTop();
    } finally {
      setImageProcessing(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isOwnerVerified) {
      setErrorMsg(`يرجى الضغط على زر "تسجيل دخول المالك بحساب Google" بالأعلى أولاً (${ADMIN_EMAIL}) لحفظ العمل في السحابة.`);
      scrollBodyTop();
      return;
    }
    if (!title.trim()) {
      setErrorMsg('يرجى كتابة اسم العمل.');
      scrollBodyTop();
      return;
    }
    if (!coverImage.trim()) {
      setErrorMsg('يرجى رفع صورة غلاف من جهازك أو وضع رابط الصورة.');
      scrollBodyTop();
      return;
    }
    if (!synopsis.trim()) {
      setErrorMsg('يرجى كتابة وصف (Description) للعمل.');
      scrollBodyTop();
      return;
    }

    setSaving(true);
    try {
      const parsedGenres = genresText
        .split(/[،,]+/)
        .map((g) => g.trim())
        .filter(Boolean);

      const saved = await saveCustomWorkToCloud({
        workId: editingWorkId || undefined,
        category,
        title: title.trim(),
        originalTitle: originalTitle.trim(),
        coverImage: coverImage.trim(),
        bannerImage: coverImage.trim(),
        genres: parsedGenres.length > 0 ? parsedGenres : [category === 'movie' ? 'سينما' : 'مغامرات'],
        dubStudio: dubStudio.trim() || 'إضافة المالك',
        rating,
        seasonsCount: category === 'movie' ? 1 : seasonsCount,
        episodesCount: category === 'movie' ? 1 : episodesCount,
        synopsis: synopsis.trim(),
      });

      if (selectedTmdbMatch) {
        void saveTmdbWorkMapping(
          saved.workId,
          selectedTmdbMatch.tmdbId,
          selectedTmdbMatch.mediaType,
          saved.originalTitle || saved.title
        );
        if (!editingWorkId) {
          await autoPopulateTmdbSeasonsForWork(saved, selectedTmdbMatch.mediaType);
        }
      }

      let linkSaved = false;
      const cleanedVideoInput = videoLink.trim();
      if (cleanedVideoInput) {
        const firstEpId =
          saved.category === 'movie' ? `${saved.workId}-movie-1` : `${saved.workId}-ep-1`;
        const normalizedLink = normalizeDriveDirectUrl(cleanedVideoInput);
        const existingCfg = getCustomEpisodeSource(firstEpId);
        const linkResult = await saveCustomEpisodeSource(firstEpId, {
          driveLink: normalizedLink,
          videoUrl: normalizedLink,
          accountLabel: existingCfg?.accountLabel || '',
          backupDriveLinks: existingCfg?.backupDriveLinks || [],
          subtitles: existingCfg?.subtitles?.length ? existingCfg.subtitles : DEFAULT_SUBTITLE_TRACKS,
        });

        if (!linkResult.savedToCloud) {
          setSavedWork(saved);
          setSavedWorkHasLink(false);
          setErrorMsg(
            `تم حفظ العمل «${saved.title}»، لكن تعذر حفظ رابط الفيديو في السحابة: ${formatCloudErrorMessage(
              linkResult.cloudError,
              'تحقق من الرابط أو أعد المحاولة من لوحة الروابط.'
            )}`
          );
          scrollBodyTop();
          return;
        }
        linkSaved = true;
      }

      setSavedWork(saved);
      setSavedWorkHasLink(linkSaved);
      resetForm();
      scrollBodyTop();
    } catch (err) {
      setErrorMsg(formatCloudErrorMessage(err, 'حدث خطأ أثناء الحفظ في السحابة'));
      scrollBodyTop();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (work: CustomWorkRecord) => {
    if (!window.confirm(`هل تريد حذف «${work.title}» من الموقع نهائياً؟`)) return;
    try {
      await deleteCustomWorkFromCloud(work.workId);
      if (editingWorkId === work.workId) {
        resetForm();
      }
    } catch (err) {
      setErrorMsg(formatCloudErrorMessage(err, 'تعذر حذف العمل'));
      scrollBodyTop();
    }
  };

  const info = CATEGORY_INFO[category];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2 sm:p-4 backdrop-blur-md overflow-y-auto"
      dir="rtl"
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      <div className="relative w-full max-w-3xl bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl flex flex-col my-auto max-h-[92vh] overflow-hidden text-neutral-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center">
              {info.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black text-white">
                  {editingWorkId ? 'تعديل العمل المضاف' : 'إضافة عمل جديد للموقع'}
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  خاص بالمالك فقط (مخفي عن الزوار)
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                ضع الصورة والاسم والوصف وسيظهر العمل فوراً في القسم ويُحفظ في سحابة Firebase للأبد، ثم أضف روابط الحلقات.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div ref={modalBodyRef} className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-5">
          {/* Owner Google Sign-in Gate Notice (shown only when entered via passcode without Google login) */}
          {!isOwnerVerified && (
            <div className="p-3.5 rounded-xl bg-blue-950/50 border border-blue-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-blue-200 font-bold">
                <Cloud className="w-4 h-4 text-blue-400 shrink-0" />
                <span>
                  لتفعيل إضافة ونشر المسلسلات والأفلام في السحابة، سجّل الدخول بحساب المالك ({ADMIN_EMAIL}).
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleOwnerLogin()}
                disabled={authLoading}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shrink-0 cursor-pointer shadow"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>{authLoading ? 'جاري فتح Google...' : 'تسجيل دخول المالك (Google)'}</span>
              </button>
            </div>
          )}

          {/* Category Picker */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-neutral-950 p-1.5 rounded-xl border border-neutral-800">
            {(['anime', 'movie', 'tv', 'dubbed'] as CustomWorkCategory[]).map((cat) => {
              const catInfo = CATEGORY_INFO[cat];
              const active = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setCategory(cat);
                    setSavedWork(null);
                    setBulkSuccessMsg(null);
                    setSelectedGrabKeys([]);
                    setGrabPage(1);
                    setArchivePage(1);
                    if (!editingWorkId) {
                      setEpisodesCount(cat === 'movie' ? 1 : 12);
                    }
                  }}
                  className={`py-2 px-2.5 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-rose-600 text-white shadow'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                  }`}
                >
                  {catInfo.icon}
                  <span>{catInfo.label}</span>
                </button>
              );
            })}
          </div>

          {/* Mode Switcher: Archive.org Full Playable Videos vs Metadata Grabber vs Manual Form */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-neutral-950 p-1 rounded-xl border border-neutral-800">
            <button
              type="button"
              onClick={() => {
                setModalMode('archive');
                setErrorMsg(null);
              }}
              className={`py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                modalMode === 'archive'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Play className="w-4 h-4" />
              <span>فيديوهات كاملة للتشغيل (Archive.org)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setModalMode('grab');
                setErrorMsg(null);
              }}
              className={`py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                modalMode === 'grab'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>جلب بيانات (TMDB · AniList · Kitsu)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setModalMode('manual');
                setErrorMsg(null);
              }}
              className={`py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                modalMode === 'manual'
                  ? 'bg-neutral-800 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>{editingWorkId ? 'تعديل العمل المحدد' : 'إضافة يدوية / Drive'}</span>
            </button>
          </div>

          {/* Bulk Success Banner */}
          {bulkSuccessMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{bulkSuccessMsg}</span>
              </div>
              {savedWork && onOpenLinksDashboard && (
                <button
                  type="button"
                  onClick={() => {
                    const firstEpId =
                      savedWork.category === 'movie'
                        ? `${savedWork.workId}-movie-1`
                        : `${savedWork.workId}-ep-1`;
                    onClose();
                    onOpenLinksDashboard(savedWork.workId, firstEpId);
                  }}
                  className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-xs rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer shadow"
                >
                  <Link2 className="w-4 h-4" />
                  <span>إضافة الروابط / الحلقات الآن</span>
                </button>
              )}
            </div>
          )}

          {/* Success Banner with Direct Link-Adding Button */}
          {savedWork && !bulkSuccessMsg && (
            <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs sm:text-sm font-black text-emerald-300">
                    {savedWorkHasLink
                      ? `تم نشر «${savedWork.title}» وحفظ رابط المشاهدة في السحابة بنجاح!`
                      : `تم نشر «${savedWork.title}» وحفظه في السحابة للأبد!`}
                  </div>
                  <div className="text-[11px] text-emerald-200/80 mt-0.5">
                    {savedWorkHasLink
                      ? 'أصبح العمل جاهزاً للمشاهدة فوراً لكل الزوار. يمكنك تعديل الروابط أو الترجمات في أي وقت.'
                      : 'يظهر الآن في القسم لجميع الزوار. يمكنك الآن إضافة روابط Google Drive للحلقات.'}
                  </div>
                </div>
              </div>

              {onOpenLinksDashboard && (
                <button
                  type="button"
                  onClick={() => {
                    const firstEpId =
                      savedWork.category === 'movie'
                        ? `${savedWork.workId}-movie-1`
                        : `${savedWork.workId}-ep-1`;
                    onClose();
                    onOpenLinksDashboard(savedWork.workId, firstEpId);
                  }}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-xs rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer shadow"
                >
                  <Link2 className="w-4 h-4" />
                  <span>{savedWorkHasLink ? 'تعديل الروابط والترجمة' : 'إضافة الروابط الآن'}</span>
                </button>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* MODE 0: INTERNET ARCHIVE FULL PLAYABLE VIDEOS */}
          {modalMode === 'archive' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-emerald-500/35 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                    <Play className="w-4 h-4 text-emerald-400" />
                    <span>جلب أفلام وسلاسل كاملة بفيديوهاتها الجاهزة للتشغيل الفوري (Archive.org)</span>
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    MP4 مباشر بدون مفتاح
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-neutral-500 absolute top-1/2 right-3 -translate-y-1/2" />
                    <input
                      type="text"
                      value={archiveQuery}
                      onChange={(e) => setArchiveQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          setArchivePage(1);
                          setArchiveSubmittedQuery(archiveQuery.trim());
                        }
                      }}
                      placeholder="ابحث في Archive.org (مثال: Death Note أو Popeye أو Elephants Dream أو Chaplin)..."
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-xl py-2 pr-9 pl-3 text-xs text-white focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setArchivePage(1);
                      setArchiveSubmittedQuery(archiveQuery.trim());
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black cursor-pointer shrink-0"
                  >
                    بحث
                  </button>
                  {archiveSubmittedQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setArchiveQuery('');
                        setArchiveSubmittedQuery('');
                        setArchivePage(1);
                      }}
                      className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold cursor-pointer shrink-0"
                    >
                      الأشهر
                    </button>
                  )}
                </div>

                {importingArchiveId && bulkProgress && (
                  <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/30 text-xs text-emerald-200 font-bold flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
                    <span>
                      جاري حفظ وربط الفيديوهات ({bulkProgress.done}/{bulkProgress.total})...
                    </span>
                  </div>
                )}
              </div>

              {archiveLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-neutral-400 text-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                  <span>جاري البحث في مكتبة الفيديوهات الكاملة (Archive.org)...</span>
                </div>
              ) : archiveResults.length === 0 ? (
                <div className="py-10 text-center text-xs text-neutral-400 bg-neutral-950 rounded-2xl border border-neutral-800">
                  لم يتم العثور على نتائج في Archive.org. جرب البحث بكلمة إنجليزية أخرى.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {archiveResults.map((item) => {
                    const predictedId = buildArchiveWorkId(item.identifier);
                    const alreadyInSite = existingWorkIdsSet.has(predictedId);
                    const isImportingThis = importingArchiveId === item.identifier;

                    return (
                      <div
                        key={item.identifier}
                        className="p-2.5 rounded-xl border border-neutral-800 bg-neutral-950 flex gap-3 hover:border-emerald-500/40 transition-colors"
                      >
                        <img
                          src={item.posterUrl}
                          alt={item.title}
                          className="w-16 h-24 object-cover rounded-lg bg-neutral-800 shrink-0"
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <h4 className="text-xs font-black text-white line-clamp-1">
                              {item.title}
                            </h4>
                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-neutral-400 mt-0.5">
                              {item.year && <span>{item.year}</span>}
                              {item.runtime && <span>· {item.runtime}</span>}
                              <span>· {(item.downloads || 0).toLocaleString()} مشاهدة</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {typeof item.episodesCount === 'number' && item.episodesCount > 0 && (
                                <span className="inline-block text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                                  {item.episodesCount === 1
                                    ? 'فيديو MP4 جاهز'
                                    : `${item.episodesCount} حلقة/فيديو MP4`}
                                </span>
                              )}
                              {alreadyInSite && (
                                <span className="inline-block text-[10px] font-bold text-sky-300 bg-sky-500/15 px-1.5 py-0.5 rounded">
                                  مضاف بالموقع ✓
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-[10px] text-neutral-400 line-clamp-2 mt-1 leading-relaxed">
                                {item.description}
                              </p>
                            )}
                          </div>

                          <div className="pt-2">
                            <button
                              type="button"
                              disabled={Boolean(importingArchiveId)}
                              onClick={() => void handleImportArchiveItem(item)}
                              className="w-full px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-black flex items-center justify-center gap-1.5 cursor-pointer shadow"
                            >
                              {isImportingThis ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>جاري جلب الفيديوهات...</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-3.5 h-3.5" />
                                  <span>
                                    {alreadyInSite
                                      ? 'تحديث الفيديوهات من Archive'
                                      : 'جلب العمل + جميع فيديوهاته الآن'}
                                  </span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {archiveResults.length > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-neutral-800 text-xs">
                  <button
                    type="button"
                    disabled={archivePage <= 1 || archiveLoading}
                    onClick={() => setArchivePage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                    <span>السابق</span>
                  </button>
                  <span className="text-neutral-400 font-mono">
                    صفحة {archivePage} / {archiveTotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={archivePage >= archiveTotalPages || archiveLoading}
                    onClick={() => setArchivePage((p) => p + 1)}
                    className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    <span>التالي</span>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* MODE 1: MULTI-SOURCE API CATALOG GRABBER */}
          {modalMode === 'grab' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/35 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span>
                  تنبيه: مصادر TMDB و AniList و Kitsu تجلب الأسماء والصور فقط بدون ملفات فيديو. للحصول على حلقات وأفلام بفيديو جاهز للتشغيل استعمل تبويب Archive.org.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setModalMode('archive');
                    setErrorMsg(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] shrink-0 cursor-pointer"
                >
                  الانتقال إلى Archive.org
                </button>
              </div>

              {/* Feed Controls & Search */}
              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-sky-500/30 space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'popular', label: 'الأكثر شعبية', icon: <Flame className="w-3.5 h-3.5" /> },
                      { id: 'trending', label: 'الرائج الآن', icon: <TrendingUp className="w-3.5 h-3.5" /> },
                      { id: 'top_rated', label: 'الأعلى تقييماً', icon: <Award className="w-3.5 h-3.5" /> },
                      { id: 'upcoming', label: 'جديد وقريباً', icon: <Sparkles className="w-3.5 h-3.5" /> },
                      { id: 'animation', label: 'أنيميشن', icon: <Film className="w-3.5 h-3.5" /> },
                    ] as Array<{ id: ApiDiscoverFeed; label: string; icon: React.ReactNode }>
                  ).map((f) => {
                    const active = !grabSubmittedQuery && grabFeed === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          setGrabSubmittedQuery('');
                          setGrabQuery('');
                          setGrabFeed(f.id);
                          setGrabPage(1);
                          setSelectedGrabKeys([]);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors border ${
                          active
                            ? 'bg-sky-600 text-white border-sky-400'
                            : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:text-white'
                        }`}
                      >
                        {f.icon}
                        <span>{f.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-neutral-500 absolute top-1/2 right-3 -translate-y-1/2" />
                    <input
                      type="text"
                      value={grabQuery}
                      onChange={(e) => setGrabQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          setGrabPage(1);
                          setGrabSubmittedQuery(grabQuery.trim());
                        }
                      }}
                      placeholder="ابحث بالاسم أو معرف IMDb (مثل: Interstellar أو tt3896198)..."
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-xl py-2 pr-9 pl-3 text-xs text-white focus:outline-none focus:border-sky-400"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setGrabPage(1);
                      setGrabSubmittedQuery(grabQuery.trim());
                    }}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black cursor-pointer shrink-0"
                  >
                    بحث شامل
                  </button>
                </div>

                {/* Selection & Bulk Import Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-800/80">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={grabResults.length === 0 || bulkImporting}
                      onClick={() => {
                        const importableKeys = grabResults
                          .filter((it) => !existingWorkIdsSet.has(buildApiImportWorkId(category, it)))
                          .map(getGrabItemKey);
                        if (importableKeys.length > 0 && importableKeys.every((k) => selectedGrabKeys.includes(k))) {
                          setSelectedGrabKeys([]);
                        } else {
                          setSelectedGrabKeys(
                            importableKeys.length > 0 ? importableKeys : grabResults.map(getGrabItemKey)
                          );
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                    >
                      {selectedGrabKeys.length > 0 ? 'إلغاء التحديد' : 'تحديد الكل الجديد'}
                    </button>
                    <span className="text-[11px] text-neutral-400">
                      محدد: <strong className="text-white">{selectedGrabKeys.length}</strong>
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={selectedGrabKeys.length === 0 || bulkImporting}
                    onClick={() => {
                      const picked = grabResults.filter((it) =>
                        selectedGrabKeys.includes(getGrabItemKey(it))
                      );
                      void handleImportDiscoverItems(picked);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-neutral-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow"
                  >
                    {bulkImporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>
                          جاري الجلب والحفظ ({bulkProgress?.done || 0}/{bulkProgress?.total || 0})...
                        </span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>جلب ونشر المحدد الآن ({selectedGrabKeys.length})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* API Results Grid */}
              {grabLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-neutral-400 text-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                  <span>جاري جلب الأعمال من TMDB و AniList و Kitsu...</span>
                </div>
              ) : grabResults.length === 0 ? (
                <div className="py-10 text-center text-xs text-neutral-400 bg-neutral-950 rounded-2xl border border-neutral-800">
                  لم يتم العثور على نتائج مطابقة. جرب كلمة بحث أخرى أو اختر تبويباً آخر.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {grabResults.map((item) => {
                    const key = getGrabItemKey(item);
                    const isSelected = selectedGrabKeys.includes(key);
                    const predictedId = buildApiImportWorkId(category, item);
                    const alreadyInSite = existingWorkIdsSet.has(predictedId);

                    return (
                      <div
                        key={key}
                        onClick={() => toggleGrabSelection(item)}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex gap-3 ${
                          isSelected
                            ? 'bg-sky-950/40 border-sky-400 shadow'
                            : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        <div className="relative shrink-0">
                          <img
                            src={item.posterUrl}
                            alt={item.title}
                            className="w-16 h-24 object-cover rounded-lg bg-neutral-800"
                            loading="lazy"
                          />
                          <div
                            className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-md border flex items-center justify-center ${
                              isSelected
                                ? 'bg-sky-500 border-sky-400 text-white'
                                : 'bg-black/70 border-white/40 text-transparent'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between gap-1.5">
                              <h4 className="text-xs font-black text-white line-clamp-1">
                                {item.title}
                              </h4>
                              <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-neutral-800 text-sky-300 shrink-0">
                                {item.source}
                              </span>
                            </div>
                            <div className="text-[10px] text-neutral-400 truncate mt-0.5" dir="ltr">
                              {item.originalTitle} {item.releaseDate ? `· ${item.releaseDate.slice(0, 4)}` : ''}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {item.voteAverage > 0 && (
                                <span className="text-[10px] font-bold text-amber-400">
                                  ★ {item.voteAverage}
                                </span>
                              )}
                              {alreadyInSite && (
                                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">
                                  مضاف بالموقع ✓
                                </span>
                              )}
                            </div>
                            {item.overview && (
                              <p className="text-[10px] text-neutral-400 line-clamp-2 mt-1 leading-relaxed">
                                {item.overview}
                              </p>
                            )}
                          </div>

                          <div
                            className="flex items-center gap-1.5 pt-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              disabled={bulkImporting}
                              onClick={() => void handleImportDiscoverItems([item])}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[10px] font-black cursor-pointer"
                            >
                              {alreadyInSite ? 'تحديث البيانات' : 'جلب ونشر الآن'}
                            </button>
                            <button
                              type="button"
                              disabled={bulkImporting}
                              onClick={() => void handleFillManualFromDiscover(item)}
                              className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[10px] font-bold cursor-pointer"
                            >
                              مع رابط Drive
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {grabResults.length > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-neutral-800 text-xs">
                  <button
                    type="button"
                    disabled={grabPage <= 1 || grabLoading}
                    onClick={() => setGrabPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                    <span>السابق</span>
                  </button>
                  <span className="text-neutral-400 font-mono">
                    صفحة {grabPage} / {grabTotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={grabPage >= grabTotalPages || grabLoading}
                    onClick={() => setGrabPage((p) => p + 1)}
                    className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    <span>التالي</span>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* MODE 2: MANUAL FORM + SINGLE SEARCH */}
          {modalMode === 'manual' && (
            <>
              {/* Optional TMDB One-Click Auto-Fill */}
              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-sky-500/30 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black text-sky-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    <span>جلب وتعبئة البيانات تلقائياً من TMDB (اختياري)</span>
                  </span>
                  {selectedTmdbMatch && (
                    <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                      مرتبط بـ TMDB #{selectedTmdbMatch.tmdbId}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tmdbQuery}
                    onChange={(e) => setTmdbQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleTmdbSearch();
                      }
                    }}
                    placeholder="اكتب اسم المسلسل أو الفيلم أو الأنمي بالإنجليزية أو العربية (مثال: Game of Thrones)..."
                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
                  />
                  <button
                    type="button"
                    disabled={tmdbSearching}
                    onClick={() => void handleTmdbSearch()}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-black text-xs shrink-0 cursor-pointer"
                  >
                    {tmdbSearching ? 'جاري البحث...' : 'بحث TMDB'}
                  </button>
                </div>

                {tmdbResults.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 max-h-56 overflow-y-auto">
                    {tmdbResults.map((res) => (
                      <button
                        key={`${res.mediaType}-${res.tmdbId}`}
                        type="button"
                        onClick={() => void handlePickTmdbResult(res)}
                        className="flex items-center gap-2.5 p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-sky-400/50 text-right cursor-pointer transition-colors"
                      >
                        {res.posterUrl ? (
                          <img
                            src={res.posterUrl}
                            alt={res.title}
                            className="w-10 h-14 object-cover rounded-lg shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-14 rounded-lg bg-neutral-800 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white truncate">{res.title}</div>
                          <div className="text-[10px] text-neutral-400 truncate" dir="ltr">
                            {res.originalTitle} · {res.releaseDate?.slice(0, 4) || ''}
                          </div>
                          <div className="text-[10px] text-amber-400 font-bold mt-0.5">
                            ★ {res.voteAverage}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Create / Edit Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
            {/* Cover Image + Title Row */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
              {/* Image Preview & Upload */}
              <div className="sm:col-span-4 space-y-2">
                <label className="text-xs font-bold text-neutral-200 block">
                  صورة الغلاف:
                </label>
                <div
                  onClick={() => imageInputRef.current?.click()}
                  className="aspect-[2/3] w-full max-w-[180px] mx-auto rounded-2xl border-2 border-dashed border-neutral-700 hover:border-rose-500 bg-neutral-950 overflow-hidden flex flex-col items-center justify-center cursor-pointer relative group transition-colors"
                >
                  {coverImage ? (
                    <>
                      <img
                        src={coverImage}
                        alt="معاينة الغلاف"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-bold gap-1">
                        <Upload className="w-5 h-5" />
                        <span>تغيير الصورة</span>
                      </div>
                    </>
                  ) : (
                    <div className="p-4 text-center space-y-2">
                      <ImageIcon className="w-8 h-8 text-neutral-500 mx-auto" />
                      <div className="text-xs font-bold text-neutral-300">
                        {imageProcessing ? 'جاري ضغط الصورة...' : 'اضغط لرفع صورة من جهازك'}
                      </div>
                    </div>
                  )}
                </div>

                <input
                  type="text"
                  value={coverImage.startsWith('data:') ? '' : coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  placeholder="أو الصق رابط الصورة هنا..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-neutral-200 focus:outline-none focus:border-rose-500"
                  dir="ltr"
                />
              </div>

              {/* Fields */}
              <div className="sm:col-span-8 space-y-3">
                <div>
                  <label className="text-xs font-bold text-neutral-200 block mb-1">
                    اسم العمل (يظهر للزوار):
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      category === 'movie'
                        ? 'مثال: فيلم اسمك (Your Name)'
                        : category === 'anime'
                        ? 'مثال: هجوم العمالقة'
                        : category === 'tv'
                        ? 'مثال: صراع العروش (Game of Thrones)'
                        : 'مثال: عالم غامبول المدهش'
                    }
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                {/* Direct Video / Google Drive Link Input */}
                <div className="p-3 rounded-xl bg-neutral-950 border border-blue-500/30 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-blue-400" />
                      <span>
                        {category === 'movie'
                          ? 'رابط مشاهدة الفيلم (Google Drive أو رابط مباشر):'
                          : 'رابط الحلقة الأولى (اختياري — Google Drive):'}
                      </span>
                    </label>
                    {extractDriveFileId(videoLink) && (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full">
                        رابط Drive صحيح
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={videoLink}
                    onChange={(e) => setVideoLink(e.target.value)}
                    placeholder="https://drive.google.com/file/d/.../view"
                    dir="ltr"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-[10px] text-neutral-400">
                    ضعه هنا وسيُربط {category === 'movie' ? 'الفيلم' : 'المسلسل'} للمشاهدة فوراً، أو اتركه فارغاً وأضفه لاحقاً من لوحة الروابط.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-neutral-300 block mb-1">
                      الاسم الإنجليزي / الأصلي (اختياري):
                    </label>
                    <input
                      type="text"
                      value={originalTitle}
                      onChange={(e) => setOriginalTitle(e.target.value)}
                      placeholder="Your Name / Attack on Titan"
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-neutral-300 block mb-1">
                      التصنيفات (افصل بفاصلة):
                    </label>
                    <input
                      type="text"
                      value={genresText}
                      onChange={(e) => setGenresText(e.target.value)}
                      placeholder="أكشن، مغامرات، فانتازيا"
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-neutral-200 block mb-1">
                    الوصف (Description / قصة العمل):
                  </label>
                  <textarea
                    rows={4}
                    value={synopsis}
                    onChange={(e) => setSynopsis(e.target.value)}
                    placeholder="اكتب نبذة القصة التي ستظهر للزوار..."
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl p-3 text-xs text-white leading-relaxed focus:outline-none focus:border-rose-500"
                  />
                </div>

                {category !== 'movie' ? (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold text-neutral-300 block mb-1">
                        عدد المواسم:
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={seasonsCount}
                        onChange={(e) => setSeasonsCount(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-neutral-300 block mb-1">
                        عدد الحلقات:
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={300}
                        value={episodesCount}
                        onChange={(e) => setEpisodesCount(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-neutral-300 block mb-1">
                        التقييم:
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        max={10}
                        value={rating}
                        onChange={(e) => setRating(Math.min(10, Math.max(0, Number(e.target.value) || 0)))}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-neutral-300 block mb-1">
                        التقييم (من 10):
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        max={10}
                        value={rating}
                        onChange={(e) => setRating(Math.min(10, Math.max(0, Number(e.target.value) || 0)))}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-neutral-300 block mb-1">
                        الاستوديو / المترجم (اختياري):
                      </label>
                      <input
                        type="text"
                        value={dubStudio}
                        onChange={(e) => setDubStudio(e.target.value)}
                        placeholder="مثال: دبلجة عربية / ترجمة خاصة"
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>
                )}

                {category !== 'movie' && (
                  <div>
                    <label className="text-xs font-bold text-neutral-300 block mb-1">
                      الاستوديو / المترجم (اختياري):
                    </label>
                    <input
                      type="text"
                      value={dubStudio}
                      onChange={(e) => setDubStudio(e.target.value)}
                      placeholder="مثال: دبلجة عربية / ترجمة خاصة"
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Submit Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-800">
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={saving || imageProcessing}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-lg shadow-rose-950 flex items-center gap-2 cursor-pointer transition-all"
                >
                  {editingWorkId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  <span>
                    {saving
                      ? 'جاري الحفظ في السحابة...'
                      : editingWorkId
                      ? 'حفظ التعديلات في السحابة'
                      : info.buttonText}
                  </span>
                </button>

                {editingWorkId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    إلغاء التعديل
                  </button>
                )}
              </div>

              <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>يُحفظ في Firebase ويظهر فوراً لكل الزوار</span>
              </span>
            </div>
          </form>
            </>
          )}

          {/* Existing Owner-Added Works in This Section */}
          {existingList.length > 0 && (
            <div className="pt-4 border-t border-neutral-800 space-y-2.5">
              <h3 className="text-xs font-bold text-neutral-300">
                الأعمال التي أضفتها في {info.label} ({existingList.length}):
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {existingList.map((work) => (
                  <div
                    key={work.workId}
                    className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center gap-3"
                  >
                    <img
                      src={work.coverImage}
                      alt={work.title}
                      className="w-11 h-14 object-cover rounded-lg shrink-0 bg-neutral-800"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate">{work.title}</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">
                        {work.category === 'movie'
                          ? 'فيلم كامل'
                          : `${work.episodesCount} حلقة · ${work.seasonsCount} موسم`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {onOpenLinksDashboard && (
                        <button
                          type="button"
                          onClick={() => {
                            const firstEp =
                              work.category === 'movie'
                                ? `${work.workId}-movie-1`
                                : `${work.workId}-ep-1`;
                            onClose();
                            onOpenLinksDashboard(work.workId, firstEp);
                          }}
                          className="p-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 cursor-pointer"
                          title="إضافة / تعديل روابط الحلقات"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSelectEdit(work)}
                        className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 cursor-pointer"
                        title="تعديل الوصف أو الصورة أو عدد الحلقات"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(work)}
                        className="p-1.5 rounded-lg bg-neutral-800 hover:bg-rose-600/30 text-neutral-400 hover:text-rose-400 cursor-pointer"
                        title="حذف العمل"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
