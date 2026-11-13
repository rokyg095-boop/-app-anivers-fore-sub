import React, { useState } from 'react';
import {
  COMICS_DATA,
  DUBBED_WORKS,
  ANIME_WORKS,
  MOVIES_WORKS,
  Comic,
  ComicChapter,
  DubEpisode,
  DubSeries,
} from './data/mockData.ts';
import { Navbar, NavTabType } from './components/Navbar.tsx';
import { AnimeView } from './components/AnimeView.tsx';
import { MoviesView } from './components/MoviesView.tsx';
import { HeroSection } from './components/HeroSection.tsx';
import { ComicReader } from './components/ComicReader.tsx';
import { ComicCard } from './components/ComicCard.tsx';
import { DubCard } from './components/DubCard.tsx';
import { DubSeriesCard } from './components/DubSeriesCard.tsx';
import { DubSeriesDetailModal } from './components/DubSeriesDetailModal.tsx';
import { VideoPlayerModal } from './components/VideoPlayerModal.tsx';
import { ComicDetailModal } from './components/ComicDetailModal.tsx';
import { BackToTopButton } from './components/BackToTopButton.tsx';

// Admin-only screens are split into separate chunks: regular visitors never download their code.
const AdminMediaDashboard = React.lazy(() =>
  import('./components/AdminMediaDashboard.tsx').then((m) => ({ default: m.AdminMediaDashboard }))
);
const AdminCreateWorkModal = React.lazy(() =>
  import('./components/AdminCreateWorkModal.tsx').then((m) => ({ default: m.AdminCreateWorkModal }))
);
import { AccessGateScreen } from './components/AccessGateScreen.tsx';
import {
  syncEpisodeSourcesFromServer,
  attachRealtimeCloudListener,
  isEpisodePlayable,
  SOURCES_UPDATED_EVENT,
} from './utils/videoSource.ts';
import {
  CustomWorkCategory,
  getCustomSeriesByCategory,
  syncCustomWorksFromCloud,
  attachCustomWorksRealtimeListener,
  CUSTOM_WORKS_UPDATED_EVENT,
} from './utils/customWorks.ts';
import {
  AccessGateConfig,
  ACCESS_GATE_UPDATED_EVENT,
  fetchAccessGateConfig,
  getDefaultAccessGateConfig,
  isAccessUnlockedLocally,
} from './utils/accessGate.ts';
import { isVerifiedAdminUser, subscribeAuthState } from './firebase.ts';
import {
  BookOpen,
  Film,
  Sparkles,
  Search,
  Filter,
  Flame,
  Volume2,
  ChevronLeft,
  Tv,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  Heart,
  Grid,
  Layers,
  Play,
  Clock,
  Lock,
  Plus
} from 'lucide-react';

function isAdminEntryHash(): boolean {
  return typeof window !== 'undefined' && window.location.hash.toLowerCase() === '#admin';
}

// Background retries when Firestore doesn't answer the access-gate read (timeout → 'fallback', or a thrown error)
const GATE_RETRY_DELAYS_MS = [1500, 4000, 8000];
// Last access-gate config that Firestore actually confirmed. Used only to let an already-unlocked
// visitor in immediately on the next visit; the gate itself is never shown from this cached copy.
const GATE_CONFIG_CACHE_KEY = 'aniverse_access_gate_config_cache_v1';

function readCachedGateConfig(): AccessGateConfig | null {
  try {
    const raw = window.localStorage.getItem(GATE_CONFIG_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<AccessGateConfig>;
    if (
      typeof c.enabled !== 'boolean' ||
      typeof c.passcodeHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(c.passcodeHash) ||
      typeof c.gateVersion !== 'number' ||
      (c.source !== 'cloud' && c.source !== 'default')
    ) {
      return null;
    }
    return {
      enabled: c.enabled,
      passcodeHash: c.passcodeHash,
      gateVersion: c.gateVersion,
      source: c.source,
    };
  } catch {
    return null;
  }
}

function writeCachedGateConfig(cfg: AccessGateConfig): void {
  if (cfg.source === 'fallback') return;
  try {
    window.localStorage.setItem(GATE_CONFIG_CACHE_KEY, JSON.stringify(cfg));
  } catch {
    // Storage unavailable (private mode etc.) — the cache is only an optimization
  }
}

function getInitialGateConfig(): AccessGateConfig {
  return readCachedGateConfig() || { ...getDefaultAccessGateConfig(), source: 'fallback' };
}

function getAllSeriesEpisodes(series: DubSeries): DubEpisode[] {
  return series.seasons && series.seasons.length > 0
    ? series.seasons.flatMap((s) => s.episodes || [])
    : series.episodes;
}

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTabType>('home');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [isOwnerAdmin, setIsOwnerAdmin] = useState<boolean>(false);
  // Hidden owner entry: open the site with "#admin" at the end of the URL (works on phones too),
  // or press Ctrl+Shift+A. Nothing admin-related is shown to regular visitors otherwise.
  const [ownerEntryRequested, setOwnerEntryRequested] = useState<boolean>(isAdminEntryHash);
  const [authReadyUser, setAuthReadyUser] = useState<boolean>(false);
  // Starts from the last Firestore-confirmed config (or an 'unknown' fallback) until Firestore answers.
  const [gateConfig, setGateConfig] = useState<AccessGateConfig>(getInitialGateConfig);
  const [isUnlockedLocally, setIsUnlockedLocally] = useState<boolean>(() =>
    isAccessUnlockedLocally(getInitialGateConfig())
  );
  // True once Firestore has given an authoritative answer ('cloud' or 'default'). The passcode screen
  // is only rendered after that, so a guessed default config can never reject the real code.
  const [gateSettled, setGateSettled] = useState<boolean>(false);
  const [gateLoadFailed, setGateLoadFailed] = useState<boolean>(false);
  const [gateRetryNonce, setGateRetryNonce] = useState<number>(0);
  const [createWorkCategory, setCreateWorkCategory] = useState<CustomWorkCategory | null>(null);
  const [adminPreselect, setAdminPreselect] = useState<{
    seriesId?: string;
    episodeId?: string;
  }>({});

  // Reader Modal State - Dedicated to whichever comic & chapter is chosen
  const [activeReadingSession, setActiveReadingSession] = useState<{
    comic: Comic;
    chapter: ComicChapter;
  } | null>(null);

  // Video Modal State - Dedicated to whichever episode & series is chosen
  const [activeVideoSession, setActiveVideoSession] = useState<{
    episode: DubEpisode;
    series: DubSeries;
  } | null>(null);

  // Comic Detail Modal State - Opens full dedicated series page with chapters
  const [selectedComicForDetail, setSelectedComicForDetail] = useState<Comic | null>(null);

  // Dubbed Series Detail Modal State - Opens series seasons & episodes selection
  const [selectedDubForDetail, setSelectedDubForDetail] = useState<DubSeries | null>(null);

  // The 2 flagship distinct comic series: Adventure Time (#0) and I Hate You, Please Die (#1)
  const adventureTimeComic = COMICS_DATA[0];
  const hateYouComic = COMICS_DATA[1];

  // The flagship dubbed series: Over The Garden Wall (خلف حائط الحديقة)
  const gardenWallSeries = DUBBED_WORKS[0];

  const handleOpenAdventureTimeReader = () => {
    setActiveReadingSession({
      comic: adventureTimeComic,
      chapter: adventureTimeComic.chapters[0],
    });
  };

  const handleOpenHateYouReader = () => {
    setActiveReadingSession({
      comic: hateYouComic,
      chapter: hateYouComic.chapters[0],
    });
  };

  // Filtered Comics
  const filteredComics = COMICS_DATA.filter((comic) => {
    const matchesSearch =
      comic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      comic.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      comic.genres.some((g) => g.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesGenre =
      selectedGenre === 'all' || comic.genres.includes(selectedGenre);
    return matchesSearch && matchesGenre;
  });

  const [, setSourcesTick] = useState<number>(0);

  // A config that isn't confirmed by Firestore ('fallback') never grants access. A cached confirmed
  // config lets an already-unlocked visitor straight in while the fresh read is still in flight.
  const isGateUnlocked =
    gateConfig.source !== 'fallback' && (!gateConfig.enabled || isUnlockedLocally);
  const canAccessSite = isGateUnlocked || isOwnerAdmin;

  // Initialize Auth & Access Gate listeners first
  React.useEffect(() => {
    let active = true;

    const unsubscribeAuth = subscribeAuthState((user, ready) => {
      if (!active) return;
      setAuthReadyUser(Boolean(ready && user));
      setIsOwnerAdmin(Boolean(ready && user && isVerifiedAdminUser(user)));
    });

    const handleGateUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<AccessGateConfig | undefined>;
      if (customEvent.detail) {
        setGateConfig(customEvent.detail);
        setIsUnlockedLocally(isAccessUnlockedLocally(customEvent.detail));
        if (customEvent.detail.source !== 'fallback') {
          setGateSettled(true);
          writeCachedGateConfig(customEvent.detail);
        }
      } else {
        setGateConfig((current) => {
          setIsUnlockedLocally(isAccessUnlockedLocally(current));
          return current;
        });
      }
    };

    window.addEventListener(ACCESS_GATE_UPDATED_EVENT, handleGateUpdated);
    return () => {
      active = false;
      unsubscribeAuth();
      window.removeEventListener(ACCESS_GATE_UPDATED_EVENT, handleGateUpdated);
    };
  }, []);

  // Load the access-gate config from Firestore. A timeout ('fallback') or a read error is retried in
  // the background instead of being trusted; the retry button on the loader restarts this effect.
  React.useEffect(() => {
    let active = true;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRetry = () => {
      if (!active) return;
      if (attempt < GATE_RETRY_DELAYS_MS.length) {
        retryTimer = setTimeout(load, GATE_RETRY_DELAYS_MS[attempt]);
        attempt += 1;
      } else {
        setGateLoadFailed(true);
      }
    };

    const load = () => {
      fetchAccessGateConfig()
        .then((cfg) => {
          if (!active) return;
          if (cfg.source === 'fallback') {
            scheduleRetry();
            return;
          }
          setGateConfig(cfg);
          setIsUnlockedLocally(isAccessUnlockedLocally(cfg));
          setGateSettled(true);
          setGateLoadFailed(false);
          writeCachedGateConfig(cfg);
        })
        .catch((err) => {
          console.error('Access gate load failed:', err);
          scheduleRetry();
        });
    };

    load();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [gateRetryNonce]);

  // Sync saved episode links + custom works ONLY after site access is unlocked
  React.useEffect(() => {
    if (!canAccessSite) return;

    void syncEpisodeSourcesFromServer();
    void syncCustomWorksFromCloud();

    let unsubscribeRealtime: (() => void) | null = null;
    let unsubscribeWorksRealtime: (() => void) | null = null;
    if (authReadyUser) {
      unsubscribeRealtime = attachRealtimeCloudListener();
      unsubscribeWorksRealtime = attachCustomWorksRealtimeListener();
    }

    const handleSourcesUpdate = () => setSourcesTick((t) => t + 1);
    window.addEventListener(SOURCES_UPDATED_EVENT, handleSourcesUpdate);
    window.addEventListener(CUSTOM_WORKS_UPDATED_EVENT, handleSourcesUpdate);

    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setIsAdminOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
      }
      if (unsubscribeWorksRealtime) {
        unsubscribeWorksRealtime();
      }
      window.removeEventListener(SOURCES_UPDATED_EVENT, handleSourcesUpdate);
      window.removeEventListener(CUSTOM_WORKS_UPDATED_EVENT, handleSourcesUpdate);
      window.removeEventListener('keydown', handleKey);
    };
  }, [canAccessSite, authReadyUser]);

  // Hidden owner entry via "#admin" in the URL
  React.useEffect(() => {
    const handleHashChange = () => {
      if (isAdminEntryHash()) setOwnerEntryRequested(true);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  React.useEffect(() => {
    if (!ownerEntryRequested || !canAccessSite) return;
    setIsAdminOpen(true);
    setOwnerEntryRequested(false);
    if (isAdminEntryHash()) {
      // Remove "#admin" so it isn't left in the address bar or shared links
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [ownerEntryRequested, canAccessSite]);

  // Whenever the admin dashboard opens (footer, player button, Ctrl+Shift+A, "#admin") close the video
  // player so its keyboard shortcuts and audio don't keep running under the dashboard. Its series/episode
  // are copied into adminPreselect first so the dashboard still opens on that episode.
  React.useEffect(() => {
    if (!isAdminOpen || !activeVideoSession) return;
    setAdminPreselect((prev) => ({
      seriesId: prev.seriesId || activeVideoSession.series.id,
      episodeId: prev.episodeId || activeVideoSession.episode.id,
    }));
    setActiveVideoSession(null);
  }, [isAdminOpen, activeVideoSession]);

  // Same for the comic reader: its window key handler would otherwise keep reacting under the dashboard
  React.useEffect(() => {
    if (isAdminOpen && activeReadingSession) setActiveReadingSession(null);
  }, [isAdminOpen, activeReadingSession]);

  // Every tab switch (navbar, footer, "view all" links) starts at the top of the new page
  const goToTab = (tab: NavTabType) => {
    setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const allDubbedWorks = [...DUBBED_WORKS, ...getCustomSeriesByCategory('dubbed')];

  // Hero "watch the dubbed version": the Adventure Time dub when it has something playable
  const adventureTimeDub = DUBBED_WORKS.find((s) => s.id === 'adventure-time-dub');
  const heroDubSeries =
    adventureTimeDub && getAllSeriesEpisodes(adventureTimeDub).some((e) => isEpisodePlayable(e))
      ? adventureTimeDub
      : gardenWallSeries;

  // Availability shown on the home page / dubbed tab, derived from the data and admin-saved links
  const gardenWallAllEpisodes = getAllSeriesEpisodes(gardenWallSeries);
  const gardenWallPlayable = gardenWallAllEpisodes.filter((ep) => isEpisodePlayable(ep));
  const featuredAnime = ANIME_WORKS[0];
  const featuredAnimeEpisode = getAllSeriesEpisodes(featuredAnime).find((ep) => isEpisodePlayable(ep));
  const featuredMovie = MOVIES_WORKS[0];
  const featuredMovieEpisode = featuredMovie.episodes[0] || featuredMovie.seasons[0]?.episodes[0];
  const featuredMoviePlayable = isEpisodePlayable(featuredMovieEpisode);
  const openFeaturedMovie = () => {
    if (featuredMoviePlayable) {
      setActiveVideoSession({ episode: featuredMovieEpisode, series: featuredMovie });
    } else {
      setSelectedDubForDetail(featuredMovie);
    }
  };

  if (!canAccessSite) {
    if (!gateSettled) {
      // Neutral loader while the access settings load — never a passcode form built on a guessed config
      return (
        <div
          className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4"
          dir="rtl"
        >
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            {gateLoadFailed ? (
              <>
                <p className="text-sm text-neutral-300 leading-relaxed">
                  تعذر الاتصال بالخادم للتحقق من إعدادات الدخول. تأكد من اتصالك بالإنترنت ثم أعد المحاولة.
                </p>
                <button
                  onClick={() => {
                    setGateLoadFailed(false);
                    setGateRetryNonce((n) => n + 1);
                  }}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  إعادة المحاولة
                </button>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full border-2 border-neutral-800 border-t-rose-500 animate-spin" />
                <span className="text-xs text-neutral-500">جاري التحميل...</span>
              </>
            )}
          </div>
        </div>
      );
    }

    return (
      <AccessGateScreen
        gateConfig={gateConfig}
        showOwnerLogin={ownerEntryRequested}
        onUnlocked={() => setIsUnlockedLocally(true)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans" dir="rtl">
      {/* Navigation Header */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={goToTab}
        onOpenFeaturedReader={handleOpenAdventureTimeReader}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {/* VIEW: HOME PAGE */}
        {currentTab === 'home' && (
          <div className="space-y-16">
            {/* Top Hero Section */}
            <HeroSection
              featuredComic={adventureTimeComic}
              featuredDub={heroDubSeries}
              onReadComic={(c) =>
                setActiveReadingSession({ comic: c, chapter: c.chapters[0] })
              }
              onWatchDub={(d) => {
                const allEps = getAllSeriesEpisodes(d);
                const ep1 = allEps.find((e) => isEpisodePlayable(e)) || allEps[0];
                setActiveVideoSession({ episode: ep1, series: d });
              }}
              onSelectComicSeries={(c) => setSelectedComicForDetail(c)}
            />

            {/* Featured Premier Dubbed Series Showcase: "خلف حائط الحديقة" */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="relative rounded-3xl overflow-hidden border-2 border-rose-500/30 bg-gradient-to-r from-neutral-900 via-neutral-900 to-rose-950/30 p-6 sm:p-8 shadow-2xl">
                <div className="flex flex-col lg:flex-row items-center gap-8">
                  {/* Banner Image / Poster */}
                  <div
                    onClick={() => setSelectedDubForDetail(gardenWallSeries)}
                    className="relative w-full lg:w-96 aspect-video rounded-2xl overflow-hidden shrink-0 shadow-2xl border border-rose-500/40 cursor-pointer group bg-neutral-950"
                  >
                    <img loading="lazy" decoding="async"
                      src={gardenWallSeries.bannerImage}
                      alt={gardenWallSeries.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent" />
                    
                    <div className="absolute top-3 right-3 bg-rose-600 text-white font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow">
                      العمل المدبلج الأول الحصري
                    </div>

                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-14 h-14 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-xl group-hover:scale-110 group-hover:bg-rose-500 transition-all">
                        <Play className="w-7 h-7 fill-white translate-x-0.5" />
                      </div>
                    </div>

                    <div className="absolute bottom-2.5 right-3 text-xs font-bold text-white flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>الحلقة الأولى: {gardenWallAllEpisodes[0]?.duration} دقيقة</span>
                    </div>
                  </div>

                  {/* Info Column */}
                  <div className="flex-1 text-right">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-rose-500 font-mono tracking-wider">
                        {gardenWallSeries.dubStudio}
                      </span>
                      <span className="text-neutral-500">·</span>
                      <span className="text-xs font-mono text-amber-400">تقييم {gardenWallSeries.rating} ★</span>
                      <span className="text-neutral-500">·</span>
                      <span className="text-xs text-neutral-400">
                        {gardenWallSeries.seasons.length} موسم (الموسم الأول)
                      </span>
                    </div>

                    <h2 className="text-2xl sm:text-4xl font-black text-white mb-2">
                      مسلسل «{gardenWallSeries.title}» المدبلج
                    </h2>

                    <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed mb-6 max-w-2xl">
                      {gardenWallSeries.synopsis}
                    </p>

                    {/* Action buttons with quick access to every playable episode (catalog or admin-linked) */}
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {gardenWallPlayable.map((ep) => (
                          <button
                            key={ep.id}
                            onClick={() => {
                              setActiveVideoSession({ episode: ep, series: gardenWallSeries });
                            }}
                            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-rose-950/60 transition-all cursor-pointer hover:scale-105 border border-rose-500/40"
                          >
                            <Play className="w-3.5 h-3.5 fill-white" />
                            <span>حلقة {ep.episodeNumber} ({ep.duration})</span>
                          </button>
                        ))}

                        <button
                          onClick={() => setSelectedDubForDetail(gardenWallSeries)}
                          className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-colors cursor-pointer border border-neutral-700"
                        >
                          <Layers className="w-3.5 h-3.5 text-amber-400" />
                          <span>عرض كل الحلقات ({gardenWallAllEpisodes.length})</span>
                        </button>
                      </div>
                      {gardenWallPlayable.length > 0 ? (
                        <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>
                            الحلقات ({gardenWallPlayable.map((ep) => ep.episodeNumber).join('، ')}) متوفرة الآن للمشاهدة الفورية بالدبلجة الرسمية كاملة وبجودة عالية!
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-amber-400 font-bold">
                          <Clock className="w-4 h-4 shrink-0" />
                          <span>الحلقات قيد التجهيز والدبلجة وستتوفر قريباً.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Side-by-Side Featured Duo Banner (وقت المغامرة & أكرهك، أرجوك مت) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="border-b border-neutral-800 pb-4 mb-6 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-amber-500 font-mono tracking-wider">
                    السلاسل الرئيسية المستقلة
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
                    أبرز سلاسل الكوميكس في المنصة
                  </h2>
                </div>
                <span className="text-xs text-neutral-400 font-mono">
                  لكل سلسلة غلافها وعارضها وفصولها الخاصة دون اختلاط
                </span>
              </div>

              {/* 2-Column Grid showcasing both distinct series with independent reader launch */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Adventure Time Box */}
                <div className="relative rounded-3xl overflow-hidden border-2 border-amber-500/30 bg-gradient-to-br from-neutral-900 via-neutral-900 to-amber-950/20 p-6 flex flex-col sm:flex-row gap-5 shadow-xl hover:border-amber-500/60 transition-all">
                  <div className="w-36 aspect-[2/3] rounded-2xl overflow-hidden shrink-0 shadow-xl border border-amber-500/40 mx-auto sm:mx-0">
                    <img loading="lazy" decoding="async"
                      src={adventureTimeComic.coverImage}
                      alt={adventureTimeComic.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="flex flex-col justify-between flex-1 text-right">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-amber-400 font-bold mb-1">
                        <span>{adventureTimeComic.arabicPublisher}</span>
                        <span>·</span>
                        <span>{adventureTimeComic.chapters[0].pagesCount} صفحة</span>
                      </div>
                      <h3 className="text-xl font-black text-white mb-1">
                        {adventureTimeComic.title}
                      </h3>
                      <p className="text-xs text-neutral-400 line-clamp-3 leading-relaxed mb-4">
                        {adventureTimeComic.synopsis}
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={handleOpenAdventureTimeReader}
                        className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-amber-950"
                      >
                        <BookOpen className="w-4 h-4" />
                        <span>فتح عارض الصفحات</span>
                      </button>
                      <button
                        onClick={() => setSelectedComicForDetail(adventureTimeComic)}
                        className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-750 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                      >
                        قائمة الفصول
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. I Hate You, Please Die Box */}
                <div className="relative rounded-3xl overflow-hidden border-2 border-rose-500/30 bg-gradient-to-br from-neutral-900 via-neutral-900 to-rose-950/20 p-6 flex flex-col sm:flex-row gap-5 shadow-xl hover:border-rose-500/60 transition-all">
                  <div className="w-36 aspect-[2/3] rounded-2xl overflow-hidden shrink-0 shadow-xl border border-rose-500/40 mx-auto sm:mx-0">
                    <img loading="lazy" decoding="async"
                      src={hateYouComic.coverImage}
                      alt={hateYouComic.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="flex flex-col justify-between flex-1 text-right">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-rose-500 font-bold mb-1">
                        <span>{hateYouComic.arabicPublisher}</span>
                        <span>·</span>
                        <span>{hateYouComic.chapters[0].pagesCount} صفحة</span>
                      </div>
                      <h3 className="text-xl font-black text-white mb-1">
                        {hateYouComic.title}
                      </h3>
                      <p className="text-xs text-neutral-400 line-clamp-3 leading-relaxed mb-4">
                        {hateYouComic.synopsis}
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={handleOpenHateYouReader}
                        className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-rose-950"
                      >
                        <BookOpen className="w-4 h-4" />
                        <span>فتح عارض الصفحات</span>
                      </button>
                      <button
                        onClick={() => setSelectedComicForDetail(hateYouComic)}
                        className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-750 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                      >
                        قائمة الفصول
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 1: Latest Comic Chapters (أحدث فصول الكوميكس) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-end justify-between mb-8 pb-4 border-b border-neutral-800">
                <div>
                  <div className="flex items-center gap-2 text-xs text-rose-500 font-bold uppercase tracking-wider mb-1">
                    <Flame className="w-4 h-4" />
                    <span>تحديثات مستمرة</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white">
                    أحدث فصول الكوميكس المترجمة
                  </h2>
                </div>

                <button
                  onClick={() => goToTab('comics')}
                  className="text-xs sm:text-sm font-bold text-neutral-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>عرض مكتبة الكوميكس كاملة</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              {/* Grid of latest comics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                {COMICS_DATA.map((comic) => (
                  <ComicCard
                    key={comic.id}
                    comic={comic}
                    onSelect={(c) => setSelectedComicForDetail(c)}
                    onQuickRead={(c) =>
                      setActiveReadingSession({ comic: c, chapter: c.chapters[0] })
                    }
                  />
                ))}
              </div>
            </section>

            {/* Section 2: Latest Dubbed Shows (أحدث الأعمال المدبلجة مع المواسم والحلقات) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-end justify-between mb-8 pb-4 border-b border-neutral-800">
                <div>
                  <div className="flex items-center gap-2 text-xs text-amber-500 font-bold uppercase tracking-wider mb-1">
                    <Tv className="w-4 h-4" />
                    <span>أداء صوتي عربي</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white">
                    الأعمال والمسلسلات المدبلجة
                  </h2>
                </div>

                <button
                  onClick={() => goToTab('dubbed')}
                  className="text-xs sm:text-sm font-bold text-neutral-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>عرض جميع الأعمال المدبلجة</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              {/* Grid of Dubbed Series */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {allDubbedWorks.map((series) => (
                  <DubSeriesCard
                    key={series.id}
                    series={series}
                    onSelectSeries={(s) => setSelectedDubForDetail(s)}
                    onQuickPlay={(ep, s) => setActiveVideoSession({ episode: ep, series: s })}
                  />
                ))}
              </div>
            </section>

            {/* Section 3: Anime Showcase (قسم الأنمي المخصص: الزهرة تزهر بالكرامة) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-end justify-between mb-8 pb-4 border-b border-neutral-800">
                <div>
                  <div className="flex items-center gap-2 text-xs text-rose-500 font-bold uppercase tracking-wider mb-1">
                    <Tv className="w-4 h-4" />
                    <span>أنمي مترجم ومدبلج</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white">
                    قسم الأنمي المميز
                  </h2>
                </div>

                <button
                  onClick={() => goToTab('anime')}
                  className="text-xs sm:text-sm font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>عرض جميع مسلسلات وحلقات الأنمي</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              {/* Anime Featured Banner */}
              <div className="relative rounded-3xl overflow-hidden border-2 border-rose-500/40 bg-gradient-to-r from-neutral-900 via-neutral-900 to-rose-950/30 p-6 sm:p-8 shadow-2xl">
                <div className="flex flex-col lg:flex-row items-center gap-6 sm:gap-8">
                  <div
                    onClick={() => goToTab('anime')}
                    className="w-40 sm:w-56 aspect-[2/3] rounded-2xl overflow-hidden shrink-0 shadow-2xl border-2 border-rose-500/50 cursor-pointer group bg-neutral-950 relative"
                  >
                    <img loading="lazy" decoding="async"
                      src={ANIME_WORKS[0].coverImage}
                      alt={ANIME_WORKS[0].title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-transparent to-transparent" />
                    <div className="absolute top-2 right-2 bg-rose-600 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                      أنمي جديد
                    </div>
                  </div>

                  <div className="flex-1 text-right">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-rose-600 text-white">
                        {ANIME_WORKS[0].genres[0]}
                      </span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-neutral-800 text-amber-400 border border-neutral-700">
                        ★ {ANIME_WORKS[0].rating}
                      </span>
                      <span className="text-xs font-mono text-neutral-400">
                        {ANIME_WORKS[0].episodesCount} حلقة كاملة
                      </span>
                      <span className="text-xs text-neutral-400 font-mono">
                        {ANIME_WORKS[0].dubStudio}
                      </span>
                    </div>

                    <h3 className="text-2xl sm:text-3xl font-black text-white mb-2">
                      {ANIME_WORKS[0].title}
                    </h3>
                    <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed mb-6 max-w-2xl line-clamp-3">
                      {ANIME_WORKS[0].synopsis}
                    </p>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => {
                          if (featuredAnimeEpisode) {
                            setActiveVideoSession({ episode: featuredAnimeEpisode, series: featuredAnime });
                          } else {
                            setSelectedDubForDetail(featuredAnime);
                          }
                        }}
                        className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-rose-950 flex items-center gap-2 transition-all cursor-pointer hover:scale-105 active:scale-95"
                      >
                        <Play className="w-4 h-4 fill-white" />
                        <span>
                          {featuredAnimeEpisode
                            ? `مشاهدة الحلقة ${String(featuredAnimeEpisode.episodeNumber).padStart(2, '0')} الآن`
                            : 'تفاصيل الحلقات (قريباً)'}
                        </span>
                      </button>

                      <button
                        onClick={() => goToTab('anime')}
                        className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-750 text-white font-bold text-xs sm:text-sm rounded-xl border border-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Layers className="w-4 h-4 text-rose-400" />
                        <span>استعراض حلقات الأنمي ({featuredAnime.episodesCount})</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 4: Movies Showcase (قسم الأفلام السينمائية: سبايدرمان) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-end justify-between mb-8 pb-4 border-b border-neutral-800">
                <div>
                  <div className="flex items-center gap-2 text-xs text-amber-500 font-bold uppercase tracking-wider mb-1">
                    <Film className="w-4 h-4" />
                    <span>صالة السينما</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white">
                    الأفلام السينمائية
                  </h2>
                </div>

                <button
                  onClick={() => goToTab('movies')}
                  className="text-xs sm:text-sm font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>عرض قسم الأفلام</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              {/* Spider-Verse Cinema Card */}
              <div className="relative rounded-3xl overflow-hidden border-2 border-amber-500/40 bg-gradient-to-r from-neutral-900 via-neutral-900 to-amber-950/30 p-6 sm:p-8 shadow-2xl">
                <div className="flex flex-col lg:flex-row items-center gap-6 sm:gap-8">
                  <div
                    onClick={openFeaturedMovie}
                    className="w-40 sm:w-56 aspect-[2/3] rounded-2xl overflow-hidden shrink-0 shadow-2xl border-2 border-amber-500/50 cursor-pointer group bg-neutral-950 relative"
                  >
                    <img loading="lazy" decoding="async"
                      src={MOVIES_WORKS[0].coverImage}
                      alt={MOVIES_WORKS[0].title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-transparent to-transparent" />
                    <div className="absolute top-2 right-2 bg-amber-500 text-neutral-950 font-mono text-[10px] font-black px-2 py-0.5 rounded-full shadow">
                      فيلم كامل
                    </div>
                  </div>

                  <div className="flex-1 text-right">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-500 text-neutral-950">
                        {MOVIES_WORKS[0].genres[0]}
                      </span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-neutral-800 text-amber-400 border border-neutral-700">
                        ★ {MOVIES_WORKS[0].rating}
                      </span>
                      <span className="text-xs font-mono text-neutral-400">
                        المدة: {featuredMovieEpisode?.duration}
                      </span>
                    </div>

                    <h3 className="text-2xl sm:text-3xl font-black text-white mb-2">
                      {MOVIES_WORKS[0].title}
                    </h3>
                    <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed mb-6 max-w-2xl line-clamp-3">
                      {MOVIES_WORKS[0].synopsis}
                    </p>

                    <button
                      onClick={openFeaturedMovie}
                      className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-950 flex items-center gap-2 transition-all cursor-pointer hover:scale-105 active:scale-95"
                    >
                      <Play className="w-4 h-4 fill-neutral-950" />
                      <span>{featuredMoviePlayable ? 'مشاهدة الفيلم السينمائي الآن' : 'تفاصيل الفيلم (قريباً)'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* VIEW: ANIME SECTION PAGE */}
        {currentTab === 'anime' && (
          <AnimeView
            onSelectSeries={(s) => setSelectedDubForDetail(s)}
            onPlayEpisode={(ep, s) => setActiveVideoSession({ episode: ep, series: s })}
            onOpenAdmin={() => setIsAdminOpen(true)}
            isOwnerAdmin={isOwnerAdmin}
            onOpenCreateWork={() => setCreateWorkCategory('anime')}
          />
        )}

        {/* VIEW: MOVIES SECTION PAGE */}
        {currentTab === 'movies' && (
          <MoviesView
            onSelectSeries={(s) => setSelectedDubForDetail(s)}
            onPlayEpisode={(ep, s) => setActiveVideoSession({ episode: ep, series: s })}
            onOpenAdmin={() => setIsAdminOpen(true)}
            isOwnerAdmin={isOwnerAdmin}
            onOpenCreateWork={() => setCreateWorkCategory('movie')}
          />
        )}

        {/* VIEW: COMICS CATALOG & READER PAGE */}
        {currentTab === 'comics' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
            {/* Header banner */}
            <div className="border-b border-neutral-800 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-rose-500 font-mono tracking-wider">
                  مكتبة الكوميكس التفاعلية
                </span>
                <h1 className="text-3xl sm:text-4xl font-black text-white mt-1">
                  قسم الكوميكس والمانجا المترجمة
                </h1>
                <p className="text-sm text-neutral-400 mt-1 max-w-xl">
                  تصفح فصول الكوميكس الكاملة، كل سلسلة تمتلك صفحاتها وفصولها وغلافها المستقل دون اختلاط.
                </p>
              </div>

              {/* Search input */}
              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 text-neutral-500 absolute top-1/2 right-3 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ابحث عن اسم العمل أو المؤلف..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 text-white text-xs rounded-xl py-2.5 pr-9 pl-3 focus:outline-none focus:border-rose-500 transition-colors"
                />
              </div>
            </div>

            {/* Quick Filter tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setSelectedGenre('all')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  selectedGenre === 'all'
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-950'
                    : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
                }`}
              >
                جميع الأعمال
              </button>
              {['مغامرات', 'فانتازيا وخيال', 'رعب نفسي', 'كوميديا سوداء'].map((genre) => (
                <button
                  key={genre}
                  onClick={() => setSelectedGenre(genre)}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    selectedGenre === genre
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-950'
                      : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>

            {/* Comics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredComics.map((comic) => (
                <ComicCard
                  key={comic.id}
                  comic={comic}
                  onSelect={(c) => setSelectedComicForDetail(c)}
                  onQuickRead={(c) =>
                    setActiveReadingSession({ comic: c, chapter: c.chapters[0] })
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* VIEW: DUBBED WORKS & HIERARCHICAL SERIES NAVIGATION */}
        {currentTab === 'dubbed' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
            {/* Header */}
            <div className="border-b border-neutral-800 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-amber-500 font-mono tracking-wider">
                  قسم الدبلجة الصوتية
                </span>
                <h1 className="text-3xl sm:text-4xl font-black text-white mt-1">
                  الأعمال والمسلسلات الكرتونية المدبلجة
                </h1>
                <p className="text-sm text-neutral-400 mt-1 max-w-xl">
                  اختر المسلسل، تصفح مواسمه وفصوله، ثم استعرض قائمة الحلقات وشاهد الفيديو بجودة عالية ومؤثرات صوتية متقنة.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {isOwnerAdmin && (
                  <button
                    onClick={() => setCreateWorkCategory('dubbed')}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-lg shadow-rose-950/50 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة مسلسل مدبلج جديد (للمالك)</span>
                  </button>
                )}

                <div className="flex items-center gap-2 text-xs text-neutral-400 bg-neutral-900 border border-neutral-800 px-3.5 py-2 rounded-xl">
                  <Volume2 className="w-4 h-4 text-amber-500" />
                  <span>دبلجة رسمية باللغة العربية الفصحى</span>
                </div>
              </div>
            </div>

            {/* Standalone Series Cards Grid (كما تم عمله في الكوميكس تماماً) */}
            <div>
              <div className="mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Film className="w-4 h-4 text-rose-500" />
                  <span>المسلسلات المتاحة (اضغط على المسلسل لاستعراض مواسمه وحلقاته)</span>
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {allDubbedWorks.map((series) => (
                  <DubSeriesCard
                    key={series.id}
                    series={series}
                    onSelectSeries={(s) => setSelectedDubForDetail(s)}
                    onQuickPlay={(ep, s) => setActiveVideoSession({ episode: ep, series: s })}
                  />
                ))}
              </div>
            </div>

            {/* Featured Section for "خلف حائط الحديقة" inside Dubbed tab */}
            <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 p-6 sm:p-8 rounded-3xl border border-neutral-800">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-6 bg-rose-600 rounded-full" />
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      حلقات مسلسل «{gardenWallSeries.title}» - الموسم الأول
                    </h3>
                    <p className="text-xs text-neutral-400">
                      {gardenWallPlayable.length === 0
                        ? 'الحلقات قيد التجهيز والدبلجة (قريباً).'
                        : gardenWallPlayable.length === gardenWallAllEpisodes.length
                          ? 'جميع الحلقات متوفرة للمشاهدة الآن.'
                          : `${gardenWallPlayable.length} من ${gardenWallAllEpisodes.length} حلقات متوفرة للمشاهدة الآن، والحلقات الأخرى قيد التجهيز والدبلجة (قريباً).`}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedDubForDetail(gardenWallSeries)}
                  className="text-xs font-bold text-rose-500 hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>استعراض تفاصيل المسلسل والمواسم</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              {/* Episodes Grid for Over the Garden Wall */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {gardenWallSeries.episodes.map((ep) => (
                  <DubCard
                    key={ep.id}
                    episode={ep}
                    series={gardenWallSeries}
                    onPlay={(e, s) => setActiveVideoSession({ episode: e, series: s })}
                    onSelectSeries={(s) => setSelectedDubForDetail(s)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-900 bg-neutral-950 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-neutral-500">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-rose-600 flex items-center justify-center text-white font-mono font-bold text-xs">
              AV
            </div>
            <span>
              منصة <strong className="text-neutral-300">AniVerse</strong> لعرض الكوميكس والأعمال المدبلجة. جميع حقوق الترجمة والرسم محفوظة لمبدعيها.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <button
              onClick={() => goToTab('home')}
              className="hover:text-neutral-300 transition-colors cursor-pointer"
            >
              الرئيسية
            </button>
            <button
              onClick={() => goToTab('anime')}
              className="hover:text-rose-400 transition-colors cursor-pointer text-rose-300/90 font-medium"
            >
              الأنمي
            </button>
            <button
              onClick={() => goToTab('movies')}
              className="hover:text-amber-400 transition-colors cursor-pointer text-amber-300/90 font-medium"
            >
              الأفلام
            </button>
            <button
              onClick={() => goToTab('dubbed')}
              className="hover:text-neutral-300 transition-colors cursor-pointer"
            >
              الأعمال المدبلجة
            </button>
            <button
              onClick={() => goToTab('comics')}
              className="hover:text-neutral-300 transition-colors cursor-pointer"
            >
              الكوميكس
            </button>

            {/* Admin Gateway in Footer — rendered only for the signed-in owner */}
            {isOwnerAdmin && (
              <button
                onClick={() => setIsAdminOpen(true)}
                className="flex items-center gap-1 text-neutral-600 hover:text-amber-400 transition-colors cursor-pointer text-[11px]"
                title="لوحة تحكم المشرف لإدارة روابط درايف والترجمات (Ctrl+Shift+A)"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-rose-500" />
                <span>لوحة المشرف</span>
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Comic Reader Modal - Opens only the selected comic's pages */}
      {activeReadingSession && (
        <ComicReader
          comicId={activeReadingSession.comic.id}
          chapterId={activeReadingSession.chapter.id}
          title={activeReadingSession.comic.title}
          chapterTitle={activeReadingSession.chapter.title}
          pages={activeReadingSession.chapter.pages}
          onClose={() => setActiveReadingSession(null)}
        />
      )}

      {/* Dubbed Series Detail Modal - Shows series info, seasons list, and episodes */}
      {selectedDubForDetail && (
        <DubSeriesDetailModal
          series={selectedDubForDetail}
          onClose={() => setSelectedDubForDetail(null)}
          onPlayEpisode={(ep, ser) => {
            setActiveVideoSession({ episode: ep, series: ser });
          }}
        />
      )}

      {/* Embedded Cinema Video Player Modal (Pure Cinema for Viewer) */}
      {activeVideoSession && (
        <VideoPlayerModal
          episode={activeVideoSession.episode}
          seriesTitle={activeVideoSession.series.title}
          allEpisodes={
            activeVideoSession.series.seasons && activeVideoSession.series.seasons.length > 0
              ? activeVideoSession.series.seasons.flatMap((s) => s.episodes || [])
              : activeVideoSession.series.episodes
          }
          onSelectEpisode={(newEp) =>
            setActiveVideoSession({
              episode: newEp,
              series: activeVideoSession.series,
            })
          }
          onClose={() => setActiveVideoSession(null)}
          onOpenAdmin={isOwnerAdmin ? () => setIsAdminOpen(true) : undefined}
        />
      )}

      {/* Comic Detail Modal - Lists only the chapters for that comic */}
      {selectedComicForDetail && (
        <ComicDetailModal
          comic={selectedComicForDetail}
          onClose={() => setSelectedComicForDetail(null)}
          onReadChapter={(chapter) =>
            setActiveReadingSession({
              comic: selectedComicForDetail,
              chapter: chapter,
            })
          }
        />
      )}

      <BackToTopButton />

      <React.Suspense
        fallback={
          isAdminOpen || createWorkCategory !== null ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="w-10 h-10 rounded-full border-4 border-neutral-700 border-t-rose-500 animate-spin" />
            </div>
          ) : null
        }
      >
      {/* Admin Media Dashboard Modal (Hidden from Regular Viewers).
          Mounted only while open so it loads fresh data each time and runs no effects in the background. */}
      {isAdminOpen && (
      <AdminMediaDashboard
        isOpen={isAdminOpen}
        onClose={() => {
          setIsAdminOpen(false);
          setAdminPreselect({});
        }}
        initialSeriesId={
          adminPreselect.seriesId || activeVideoSession?.series.id || selectedDubForDetail?.id
        }
        initialEpisodeId={adminPreselect.episodeId || activeVideoSession?.episode.id}
        onOpenCreateWork={() => {
          const defaultCat: CustomWorkCategory =
            currentTab === 'movies' ? 'movie' : currentTab === 'dubbed' ? 'dubbed' : 'anime';
          setCreateWorkCategory(defaultCat);
        }}
      />
      )}

      {/* Owner-Only Add/Edit Custom Work Modal (Anime, Movies, Dubbed).
          Mounted only while open so a cancelled edit can't leak into the next "add work". */}
      {isOwnerAdmin && createWorkCategory !== null && (
        <AdminCreateWorkModal
          isOpen={createWorkCategory !== null}
          defaultCategory={createWorkCategory || 'anime'}
          onClose={() => setCreateWorkCategory(null)}
          onOpenLinksDashboard={(seriesId, episodeId) => {
            setAdminPreselect({ seriesId, episodeId });
            setIsAdminOpen(true);
          }}
        />
      )}
      </React.Suspense>
    </div>
  );
}
