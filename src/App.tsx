import React, { useState } from 'react';
import {
  COMICS_DATA,
  DUBBED_WORKS,
  Comic,
  ComicChapter,
  DubEpisode,
  DubSeries,
} from './data/mockData.ts';
import { Navbar, NavTabType } from './components/Navbar.tsx';
import { AnimeView } from './components/AnimeView.tsx';
import { MoviesView } from './components/MoviesView.tsx';
import { TvSeriesView } from './components/TvSeriesView.tsx';
import { GlobalSearchModal, GlobalSearchPanel } from './components/GlobalSearchPanel.tsx';
import { StyledHeroShowcase } from './components/StyledHeroShowcase.tsx';
import { StyleSelectorModal } from './components/StyleSelectorModal.tsx';
import { BrandLogo } from './components/BrandLogo.tsx';
import { ComicReader } from './components/ComicReader.tsx';
import { ComicCard } from './components/ComicCard.tsx';
import { DubCard } from './components/DubCard.tsx';
import { DubSeriesCard } from './components/DubSeriesCard.tsx';
import { DubSeriesDetailModal } from './components/DubSeriesDetailModal.tsx';
import { VideoPlayerModal } from './components/VideoPlayerModal.tsx';
import { ComicDetailModal } from './components/ComicDetailModal.tsx';
import { AdminMediaDashboard } from './components/AdminMediaDashboard.tsx';
import { AdminCreateWorkModal } from './components/AdminCreateWorkModal.tsx';
import { AccessGateScreen } from './components/AccessGateScreen.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { BrowseShowcaseSection } from './components/BrowseShowcaseSection.tsx';
import { PWAInstallButton } from './components/PWAInstallButton.tsx';
import { useSiteStyle } from './utils/siteStyle.ts';
import {
  syncEpisodeSourcesFromServer,
  attachRealtimeCloudListener,
  SOURCES_UPDATED_EVENT,
} from './utils/videoSource.ts';
import {
  CustomWorkCategory,
  syncCustomWorksFromCloud,
  attachCustomWorksRealtimeListener,
  CUSTOM_WORKS_UPDATED_EVENT,
} from './utils/customWorks.ts';
import {
  attachCatalogOverridesRealtimeListener,
  CATALOG_OVERRIDES_UPDATED_EVENT,
  getAllEffectiveMediaWorks,
  getEffectiveWorksByCategory,
  syncCatalogOverridesFromCloud,
} from './utils/catalogOverrides.ts';
import {
  AccessGateConfig,
  ACCESS_GATE_UPDATED_EVENT,
  fetchAccessGateConfig,
  getDefaultAccessGateConfig,
  isAccessUnlockedLocally,
} from './utils/accessGate.ts';
import { isVerifiedAdminUser, subscribeAuthState } from './firebase.ts';
import {
  Film,
  Search,
  Volume2,
  ChevronLeft,
  ShieldCheck,
  MonitorPlay,
} from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTabType>('home');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);
  const [isStyleModalOpen, setIsStyleModalOpen] = useState<boolean>(false);
  const [siteStyleId, setSiteStyleId, siteStyleMeta] = useSiteStyle();
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [isOwnerAdmin, setIsOwnerAdmin] = useState<boolean>(false);
  const [authReadyUser, setAuthReadyUser] = useState<boolean>(false);
  const [gateConfig, setGateConfig] = useState<AccessGateConfig>(() =>
    getDefaultAccessGateConfig()
  );
  const [isUnlockedLocally, setIsUnlockedLocally] = useState<boolean>(() =>
    isAccessUnlockedLocally(getDefaultAccessGateConfig())
  );
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

  const adventureTimeComic = COMICS_DATA[0];

  const handleOpenAdventureTimeReader = () => {
    setActiveReadingSession({
      comic: adventureTimeComic,
      chapter: adventureTimeComic.chapters[0],
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

  const canAccessSite = !gateConfig.enabled || isUnlockedLocally || isOwnerAdmin;

  // Initialize Auth & Access Gate configuration first
  React.useEffect(() => {
    let active = true;

    const unsubscribeAuth = subscribeAuthState((user, ready) => {
      if (!active) return;
      setAuthReadyUser(Boolean(ready && user));
      setIsOwnerAdmin(Boolean(ready && user && isVerifiedAdminUser(user)));
    });

    void fetchAccessGateConfig()
      .then((cfg) => {
        if (!active) return;
        setGateConfig(cfg);
        setIsUnlockedLocally(isAccessUnlockedLocally(cfg));
      })
      .catch((err) => {
        console.error('Access gate load failed:', err);
        if (!active) return;
        const fallback = getDefaultAccessGateConfig();
        setGateConfig(fallback);
        setIsUnlockedLocally(isAccessUnlockedLocally(fallback));
      });

    const handleGateUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<AccessGateConfig | undefined>;
      if (customEvent.detail) {
        setGateConfig(customEvent.detail);
        setIsUnlockedLocally(isAccessUnlockedLocally(customEvent.detail));
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

  // Sync saved episode links + custom works + catalog overrides ONLY after site access is unlocked
  React.useEffect(() => {
    if (!canAccessSite) return;

    void syncEpisodeSourcesFromServer();
    void syncCustomWorksFromCloud();
    void syncCatalogOverridesFromCloud();

    let unsubscribeRealtime: (() => void) | null = null;
    let unsubscribeWorksRealtime: (() => void) | null = null;
    let unsubscribeCatalogRealtime: (() => void) | null = null;
    if (authReadyUser) {
      unsubscribeRealtime = attachRealtimeCloudListener();
      unsubscribeWorksRealtime = attachCustomWorksRealtimeListener();
      unsubscribeCatalogRealtime = attachCatalogOverridesRealtimeListener();
    }

    const handleSourcesUpdate = () => setSourcesTick((t) => t + 1);
    window.addEventListener(SOURCES_UPDATED_EVENT, handleSourcesUpdate);
    window.addEventListener(CUSTOM_WORKS_UPDATED_EVENT, handleSourcesUpdate);
    window.addEventListener(CATALOG_OVERRIDES_UPDATED_EVENT, handleSourcesUpdate);

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
      if (unsubscribeCatalogRealtime) {
        unsubscribeCatalogRealtime();
      }
      window.removeEventListener(SOURCES_UPDATED_EVENT, handleSourcesUpdate);
      window.removeEventListener(CUSTOM_WORKS_UPDATED_EVENT, handleSourcesUpdate);
      window.removeEventListener(CATALOG_OVERRIDES_UPDATED_EVENT, handleSourcesUpdate);
      window.removeEventListener('keydown', handleKey);
    };
  }, [canAccessSite, authReadyUser]);

  const allDubbedWorks = getEffectiveWorksByCategory('dubbed');
  const allAnimeWorks = getEffectiveWorksByCategory('anime');
  const allMovieWorks = getEffectiveWorksByCategory('movie');
  const allTvWorks = getEffectiveWorksByCategory('tv');
  const allEffectiveMedia = getAllEffectiveMediaWorks();

  const featuredDubSeries =
    allDubbedWorks.find((s) => s.id === DUBBED_WORKS[0]?.id) ||
    allDubbedWorks[0] ||
    allEffectiveMedia[0] ||
    null;

  const liveSelectedDub = selectedDubForDetail
    ? allEffectiveMedia.find((s) => s.id === selectedDubForDetail.id) || null
    : null;
  const liveActiveVideoSeries = activeVideoSession
    ? allEffectiveMedia.find((s) => s.id === activeVideoSession.series.id) ||
      activeVideoSession.series
    : null;
  const liveActiveVideoEpisode =
    liveActiveVideoSeries && activeVideoSession
      ? (liveActiveVideoSeries.seasons.flatMap((s) => s.episodes || []).find(
          (e) => e.id === activeVideoSession.episode.id
        ) || activeVideoSession.episode)
      : null;

  if (!canAccessSite) {
    return (
      <AccessGateScreen
        gateConfig={gateConfig}
        onUnlocked={() => setIsUnlockedLocally(true)}
      />
    );
  }

  return (
    <div
      data-site-style={siteStyleId}
      style={{ backgroundColor: siteStyleMeta.bgHex }}
      className={`min-h-screen flex flex-col font-sans transition-colors duration-300 ${
        siteStyleMeta.isLight ? 'text-neutral-900' : 'text-neutral-100'
      }`}
      dir="rtl"
    >
      {/* Navigation Header */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setCurrentTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenFeaturedReader={handleOpenAdventureTimeReader}
        onOpenSearch={() => setIsSearchModalOpen(true)}
        onOpenStyles={() => setIsStyleModalOpen(true)}
        currentStyleName={siteStyleMeta.name}
        isLightMode={Boolean(siteStyleMeta.isLight)}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {/* VIEW: HOME PAGE */}
        {currentTab === 'home' && (
          <div className="space-y-14">
            {/* Dynamic Multi-Style Hero Showcase (100% populated with User's Real Series & Movies) */}
            <StyledHeroShowcase
              styleId={siteStyleId}
              featuredWorks={allEffectiveMedia}
              comics={COMICS_DATA}
              onSelectMedia={(s) => setSelectedDubForDetail(s)}
              onPlayMedia={(ep, s) => setActiveVideoSession({ episode: ep, series: s })}
              onSelectComic={(c) => setSelectedComicForDetail(c)}
              onReadComic={(c) =>
                setActiveReadingSession({ comic: c, chapter: c.chapters[0] })
              }
              onOpenSearch={() => setIsSearchModalOpen(true)}
            />

            {/* Interactive Browse Entry ("التصفح") & Kinetic 3D Horizontal Stage */}
            <BrowseShowcaseSection
              mediaWorks={allEffectiveMedia}
              comics={COMICS_DATA}
              onSelectMedia={(s) => setSelectedDubForDetail(s)}
              onPlayMedia={(ep, s) => setActiveVideoSession({ episode: ep, series: s })}
              onSelectComic={(c) => setSelectedComicForDetail(c)}
              onReadComic={(c) =>
                setActiveReadingSession({ comic: c, chapter: c.chapters[0] })
              }
            />

            {/* Global Search & Genre Classification Explorer */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div
                className={`rounded-3xl border backdrop-blur-xl p-4 sm:p-6 shadow-2xl space-y-4 ${
                  siteStyleMeta.isLight
                    ? 'bg-[#101422] border-neutral-300 text-white'
                    : 'bg-white/[0.03] border-white/10'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2" style={{ color: '#ffffff' }}>
                      <Search className="w-4 h-4 text-violet-400" />
                      <span>البحث الشامل والتصفية حسب التصنيفات</span>
                    </h2>
                    <p className="text-xs text-white/60 mt-0.5">
                      ابحث عن أي مسلسل، فيلم، أنمي، مسلسل تلفزيوني، أو اختر التصنيف المفضل لديك مباشرة
                    </p>
                  </div>
                </div>
                <GlobalSearchPanel
                  onSelectMedia={(s) => setSelectedDubForDetail(s)}
                  onSelectComic={(c) => setSelectedComicForDetail(c)}
                  onNavigateTab={(tab) => {
                    setCurrentTab(tab);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </div>
            </section>

            {/* Section 1: Animation & Cartoon Grid (قسم الأنميشن والكرتون) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-end justify-between mb-6 pb-4 border-b border-white/10">
                <div>
                  <div className="text-xs text-violet-300 font-bold mb-1">
                    مسلسلات الأنميشن والكرتون
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white">
                    قسم الأنميشن والكرتون
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentTab('dubbed');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-xs sm:text-sm font-bold text-white/70 hover:text-white flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>عرض الكل</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
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

            {/* Section 2: Movies Grid (الأفلام السينمائية) */}
            {allMovieWorks.length > 0 && (
              <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-end justify-between mb-6 pb-4 border-b border-white/10">
                  <div>
                    <div className="text-xs text-amber-300 font-bold mb-1">
                      صالة العرض السينمائي
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-white">
                      الأفلام السينمائية
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentTab('movies');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-xs sm:text-sm font-bold text-white/70 hover:text-white flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span>قسم الأفلام</span>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                  {allMovieWorks.map((movie) => (
                    <DubSeriesCard
                      key={movie.id}
                      series={movie}
                      onSelectSeries={(s) => setSelectedDubForDetail(s)}
                      onQuickPlay={(ep, s) => setActiveVideoSession({ episode: ep, series: s })}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Section 3: Anime Showcase & Grid (عالم الأنمي) */}
            {allAnimeWorks.length > 0 && (
              <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-end justify-between mb-6 pb-4 border-b border-white/10">
                  <div>
                    <div className="text-xs text-rose-300 font-bold mb-1">
                      أنمي مترجم ومدبلج
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-white">
                      مسلسلات الأنمي
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentTab('anime');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-xs sm:text-sm font-bold text-white/70 hover:text-white flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span>قسم الأنمي</span>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                  {allAnimeWorks.map((anime) => (
                    <DubSeriesCard
                      key={anime.id}
                      series={anime}
                      onSelectSeries={(s) => setSelectedDubForDetail(s)}
                      onQuickPlay={(ep, s) => setActiveVideoSession({ episode: ep, series: s })}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Section 4: TV Series Section (المسلسلات التلفزيونية) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-end justify-between mb-6 pb-4 border-b border-white/10">
                <div>
                  <div className="text-xs text-sky-300 font-bold mb-1">
                    مسلسلات عالمية ودرامية
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white">
                    المسلسلات التلفزيونية
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentTab('tv');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-xs sm:text-sm font-bold text-white/70 hover:text-white flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>تصفح القسم</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              {allTvWorks.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                  {allTvWorks.map((series) => (
                    <DubSeriesCard
                      key={series.id}
                      series={series}
                      onSelectSeries={(s) => setSelectedDubForDetail(s)}
                      onQuickPlay={(ep, s) => setActiveVideoSession({ episode: ep, series: s })}
                    />
                  ))}
                </div>
              ) : (
                <div
                  onClick={() => {
                    setCurrentTab('tv');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="rounded-3xl border border-white/10 hover:border-sky-400/40 bg-white/[0.03] backdrop-blur-xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
                      <MonitorPlay className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-white">
                        المسلسلات التلفزيونية (جاهز لاستقبال مسلسلات مثل Game of Thrones)
                      </h3>
                      <p className="text-xs text-white/60 mt-0.5">
                        قسم مستقل لمتابعة المسلسلات التلفزيونية العالمية بمواسمها وحلقاتها الكاملة
                      </p>
                    </div>
                  </div>
                  <span className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 text-white font-bold text-xs whitespace-nowrap shrink-0">
                    فتح القسم
                  </span>
                </div>
              )}
            </section>

            {/* Section 5: Comics Library (مكتبة الكوميكس) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-end justify-between mb-6 pb-4 border-b border-white/10">
                <div>
                  <div className="text-xs text-emerald-300 font-bold mb-1">
                    قراءة تفاعلية عالية الدقة
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white">
                    الكوميكس والمانجا المترجمة
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentTab('comics');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-xs sm:text-sm font-bold text-white/70 hover:text-white flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>مكتبة الكوميكس</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
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
          </div>
        )}

        {/* VIEW: ANIME SECTION PAGE */}
        {currentTab === 'anime' && (
          <AnimeView
            onSelectSeries={(s) => setSelectedDubForDetail(s)}
            onPlayEpisode={(ep, s) => setActiveVideoSession({ episode: ep, series: s })}
            onOpenAdmin={() => setIsAdminOpen(true)}
            isOwnerAdmin={isOwnerAdmin}
            onOpenCreateWork={
              isOwnerAdmin ? () => setCreateWorkCategory('anime') : undefined
            }
          />
        )}

        {/* VIEW: MOVIES SECTION PAGE */}
        {currentTab === 'movies' && (
          <MoviesView
            onSelectSeries={(s) => setSelectedDubForDetail(s)}
            onPlayEpisode={(ep, s) => setActiveVideoSession({ episode: ep, series: s })}
            onOpenAdmin={() => setIsAdminOpen(true)}
            isOwnerAdmin={isOwnerAdmin}
            onOpenCreateWork={
              isOwnerAdmin ? () => setCreateWorkCategory('movie') : undefined
            }
          />
        )}

        {/* VIEW: TV SERIES SECTION PAGE */}
        {currentTab === 'tv' && (
          <TvSeriesView
            onSelectSeries={(s) => setSelectedDubForDetail(s)}
            onPlayEpisode={(ep, s) => setActiveVideoSession({ episode: ep, series: s })}
            onOpenAdmin={() => setIsAdminOpen(true)}
            isOwnerAdmin={isOwnerAdmin}
            onOpenCreateWork={
              isOwnerAdmin ? () => setCreateWorkCategory('tv') : undefined
            }
          />
        )}

        {/* VIEW: COMICS CATALOG & READER PAGE */}
        {currentTab === 'comics' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
            <div className="border-b border-white/10 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-violet-300 tracking-wider">
                  مكتبة الكوميكس التفاعلية
                </span>
                <h1 className="text-3xl sm:text-4xl font-black text-white mt-1">
                  قسم الكوميكس والمانجا المترجمة
                </h1>
                <p className="text-sm text-white/65 mt-1 max-w-xl">
                  تصفح فصول الكوميكس الكاملة، كل سلسلة تمتلك صفحاتها وفصولها وغلافها المستقل دون اختلاط.
                </p>
              </div>

              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 text-white/45 absolute top-1/2 right-3 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ابحث عن اسم العمل أو المؤلف..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/15 text-white text-xs rounded-full py-2.5 pr-9 pl-4 focus:outline-none focus:border-violet-400 transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <button
                type="button"
                onClick={() => setSelectedGenre('all')}
                className={`px-4 py-1.5 text-xs font-bold rounded-full transition-colors whitespace-nowrap cursor-pointer border ${
                  selectedGenre === 'all'
                    ? 'bg-white text-slate-950 border-white'
                    : 'bg-white/[0.05] text-white/70 hover:text-white border-white/10'
                }`}
              >
                جميع الأعمال
              </button>
              {['مغامرات', 'فانتازيا وخيال', 'رعب نفسي', 'كوميديا سوداء'].map((genre) => (
                <button
                  type="button"
                  key={genre}
                  onClick={() => setSelectedGenre(genre)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-full transition-colors whitespace-nowrap cursor-pointer border ${
                    selectedGenre === genre
                      ? 'bg-white text-slate-950 border-white'
                      : 'bg-white/[0.05] text-white/70 hover:text-white border-white/10'
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
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
            <div className="border-b border-white/10 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-violet-300 tracking-wider">
                  قسم الأنميشن والكرتون
                </span>
                <h1 className="text-3xl sm:text-4xl font-black text-white mt-1">
                  قسم الأنميشن والكرتون
                </h1>
                <p className="text-sm text-white/65 mt-1 max-w-xl">
                  اختر المسلسل لاستعراض العرض الزجاجي، المواسم، والحلقات الكاملة بأعلى جودة.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {isOwnerAdmin && (
                  <button
                    type="button"
                    onClick={() => setIsAdminOpen(true)}
                    className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/15 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4 text-violet-300" />
                    <span>إدارة المسلسلات والروابط</span>
                  </button>
                )}

                <span className="text-xs text-white/65 flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-amber-300" />
                  <span>دبلجة رسمية باللغة العربية الفصحى</span>
                </span>
              </div>
            </div>

            <div>
              <div className="mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Film className="w-4 h-4 text-violet-300" />
                  <span>المسلسلات المتاحة (اضغط على المسلسل لفتحه)</span>
                </h2>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
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

            {featuredDubSeries && (
              <div className="bg-white/[0.03] backdrop-blur-xl p-6 sm:p-8 rounded-3xl border border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      حلقات مسلسل «{featuredDubSeries.title}» - {featuredDubSeries.seasons[0]?.title || 'الموسم الأول'}
                    </h3>
                    <p className="text-xs text-white/60 mt-0.5">
                      اضغط على أي حلقة للمشاهدة الفورية أو استعرض جميع المواسم والحلقات.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedDubForDetail(featuredDubSeries)}
                    className="text-xs font-bold text-violet-300 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>استعراض تفاصيل المسلسل</span>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {featuredDubSeries.episodes.map((ep) => (
                    <DubCard
                      key={ep.id}
                      episode={ep}
                      series={featuredDubSeries}
                      onPlay={(e, s) => setActiveVideoSession({ episode: e, series: s })}
                      onSelectSeries={(s) => setSelectedDubForDetail(s)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        className={`border-t py-10 ${
          siteStyleMeta.isLight
            ? 'border-neutral-300/80 bg-[#ede7dd] text-neutral-700'
            : 'border-white/10 bg-[#050810]'
        }`}
      >
        <div
          className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6 text-xs ${
            siteStyleMeta.isLight ? 'text-neutral-600' : 'text-white/55'
          }`}
        >
          <div className="flex items-center gap-3">
            <BrandLogo size="xs" />
            <span>
              منصة{' '}
              <strong className={siteStyleMeta.isLight ? 'text-neutral-950' : 'text-white/85'}>
                AniVerse
              </strong>{' '}
              لعرض الكوميكس والأنميشن والكرتون. جميع حقوق الترجمة والرسم محفوظة لمبدعيها.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <button
              onClick={() => setCurrentTab('home')}
              className="hover:text-neutral-300 transition-colors cursor-pointer"
            >
              الرئيسية
            </button>
            <button
              onClick={() => setCurrentTab('anime')}
              className="hover:text-rose-400 transition-colors cursor-pointer text-rose-300/90 font-medium"
            >
              الأنمي
            </button>
            <button
              onClick={() => setCurrentTab('movies')}
              className="hover:text-amber-400 transition-colors cursor-pointer text-amber-300/90 font-medium"
            >
              الأفلام
            </button>
            <button
              onClick={() => setCurrentTab('tv')}
              className="hover:text-sky-400 transition-colors cursor-pointer text-sky-300/90 font-medium"
            >
              المسلسلات التلفزيونية
            </button>
            <button
              onClick={() => setCurrentTab('dubbed')}
              className="hover:text-neutral-300 transition-colors cursor-pointer"
            >
              الأنميشن والكرتون
            </button>
            <button
              onClick={() => setCurrentTab('comics')}
              className="hover:text-neutral-300 transition-colors cursor-pointer"
            >
              الكوميكس
            </button>

            <PWAInstallButton variant="footer" />

            {/* Hidden / Discreet Admin Gateway in Footer */}
            <button
              onClick={() => setIsAdminOpen(true)}
              className="flex items-center gap-1 text-neutral-600 hover:text-amber-400 transition-colors cursor-pointer text-[11px]"
              title="لوحة تحكم المشرف لإدارة روابط درايف والترجمات (Ctrl+Shift+A)"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-rose-500" />
              <span>لوحة المشرف</span>
            </button>
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
      {liveSelectedDub && (
        <DubSeriesDetailModal
          series={liveSelectedDub}
          onClose={() => setSelectedDubForDetail(null)}
          onPlayEpisode={(ep, ser) => {
            setActiveVideoSession({ episode: ep, series: ser });
          }}
        />
      )}

      {/* Embedded Cinema Video Player Modal (Pure Cinema for Viewer) */}
      {liveActiveVideoEpisode && liveActiveVideoSeries && (
        <VideoPlayerModal
          episode={liveActiveVideoEpisode}
          seriesTitle={liveActiveVideoSeries.title}
          allEpisodes={
            liveActiveVideoSeries.seasons && liveActiveVideoSeries.seasons.length > 0
              ? liveActiveVideoSeries.seasons.flatMap((s) => s.episodes || [])
              : liveActiveVideoSeries.episodes
          }
          onSelectEpisode={(newEp) =>
            setActiveVideoSession({
              episode: newEp,
              series: liveActiveVideoSeries,
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

      {/* Admin Media Dashboard Modal (Strictly Locked to Owner Email) */}
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
        onOpenCreateWork={
          isOwnerAdmin
            ? () => {
                const defaultCat: CustomWorkCategory =
                  currentTab === 'movies'
                    ? 'movie'
                    : currentTab === 'tv'
                    ? 'tv'
                    : currentTab === 'dubbed'
                    ? 'dubbed'
                    : 'anime';
                setCreateWorkCategory(defaultCat);
              }
            : undefined
        }
      />

      {/* Global Search & Genre Explorer Modal */}
      <GlobalSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectMedia={(series) => setSelectedDubForDetail(series)}
        onSelectComic={(comic) => setSelectedComicForDetail(comic)}
        onNavigateTab={(tab) => {
          setCurrentTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Interactive Style Selector Modal ("الأنماط") */}
      <StyleSelectorModal
        isOpen={isStyleModalOpen}
        currentStyleId={siteStyleId}
        onSelectStyle={(next) => setSiteStyleId(next)}
        onClose={() => setIsStyleModalOpen(false)}
        sampleCovers={allEffectiveMedia
          .slice(0, 4)
          .map((w) => w.coverImage || w.bannerImage)
          .filter(Boolean)}
      />

      {/* Owner-Only Add/Edit Custom Work Modal (Opened strictly from Admin Panel by verified owner) */}
      {isOwnerAdmin && (
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

      <OfflineIndicator />
    </div>
  );
}
