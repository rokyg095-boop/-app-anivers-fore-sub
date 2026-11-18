import React, { useEffect, useMemo, useState } from 'react';
import {
  Play,
  Plus,
  Check,
  Info,
  ChevronRight,
  ChevronLeft,
  BookOpen,
  Heart,
} from 'lucide-react';
import { Comic, DubEpisode, DubSeries } from '../data/mockData.ts';
import { getCustomEpisodeSource } from '../utils/videoSource';
import { useFavorites } from '../utils/favorites';

interface HeroSectionProps {
  featuredWorks: DubSeries[];
  comics: Comic[];
  onSelectMedia: (series: DubSeries) => void;
  onPlayMedia: (episode: DubEpisode, series: DubSeries) => void;
  onSelectComic: (comic: Comic) => void;
  onReadComic: (comic: Comic) => void;
}

type ShelfItem =
  | {
      key: string;
      id: string;
      kind: 'media';
      title: string;
      subtitle: string;
      coverImage: string;
      rating: number;
      series: DubSeries;
    }
  | {
      key: string;
      id: string;
      kind: 'comic';
      title: string;
      subtitle: string;
      coverImage: string;
      rating: number;
      comic: Comic;
    };

export const HeroSection: React.FC<HeroSectionProps> = ({
  featuredWorks,
  comics,
  onSelectMedia,
  onPlayMedia,
  onSelectComic,
  onReadComic,
}) => {
  const { favoriteIds, isFavorite, toggleFavorite } = useFavorites();
  const [spotlightIndex, setSpotlightIndex] = useState<number>(0);
  const [railMode, setRailMode] = useState<'all' | 'favorites'>('all');
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const spotlightWorks = useMemo(() => {
    const priorityIds = [
      'over-the-garden-wall',
      'avatar-the-last-airbender',
      'adventure-time-dub',
      'amphibia-dub',
      'spider-man-across-the-spider-verse',
      'harry-potter-and-the-philosophers-stone',
      'naruto',
      'the-fragrant-flower-blooms-with-dignity',
      'fionna-and-cake',
    ];
    return [...featuredWorks].sort((a, b) => {
      const idxA = priorityIds.indexOf(a.id);
      const idxB = priorityIds.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [featuredWorks]);

  const safeIndex =
    spotlightWorks.length > 0 ? spotlightIndex % spotlightWorks.length : 0;
  const activeWork = spotlightWorks[safeIndex] || featuredWorks[0];

  useEffect(() => {
    if (spotlightWorks.length <= 1 || isPaused) return;
    const timer = window.setInterval(() => {
      setSpotlightIndex((prev) => (prev + 1) % spotlightWorks.length);
    }, 9000);
    return () => window.clearInterval(timer);
  }, [spotlightWorks.length, isPaused]);

  const shelfItems = useMemo<ShelfItem[]>(() => {
    const mediaItems: ShelfItem[] = spotlightWorks.map((series) => {
      const catLabel =
        series.category === 'movie'
          ? 'فيلم'
          : series.category === 'anime'
          ? 'أنمي'
          : series.category === 'tv'
          ? 'مسلسل'
          : 'أنميشن وكرتون';
      return {
        key: `media-${series.id}`,
        id: series.id,
        kind: 'media',
        title: series.title,
        subtitle: catLabel,
        coverImage: series.coverImage || series.bannerImage,
        rating: series.rating,
        series,
      };
    });

    const comicItems: ShelfItem[] = comics.map((comic) => ({
      key: `comic-${comic.id}`,
      id: comic.id,
      kind: 'comic',
      title: comic.title,
      subtitle: 'كوميكس',
      coverImage: comic.coverImage,
      rating: comic.rating,
      comic,
    }));

    const combined = [...mediaItems, ...comicItems];
    if (railMode === 'favorites') {
      return combined.filter((item) => favoriteIds.includes(item.id));
    }
    return combined;
  }, [spotlightWorks, comics, railMode, favoriteIds]);

  if (!activeWork) return null;

  const activeFavorite = isFavorite(activeWork.id);
  const firstEpisode =
    activeWork.episodes.find(
      (ep) =>
        !ep.isComingSoon ||
        Boolean(
          getCustomEpisodeSource(ep.id)?.driveLink ||
            getCustomEpisodeSource(ep.id)?.videoUrl
        )
    ) ||
    activeWork.episodes[0] ||
    activeWork.seasons[0]?.episodes[0];

  const categoryLabel =
    activeWork.category === 'movie'
      ? 'الأفلام السينمائية'
      : activeWork.category === 'anime'
      ? 'عالم الأنمي'
      : activeWork.category === 'tv'
      ? 'المسلسلات التلفزيونية'
      : 'قسم الأنميشن والكرتون';

  const heroArtSrc = activeWork.coverImage || activeWork.bannerImage;
  const ambientBackdropSrc = activeWork.coverImage || activeWork.bannerImage;

  return (
    <section
      className="relative w-full overflow-hidden bg-[#060911] border-b border-white/10"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Full-Bleed Color-Matched Atmospheric Lighting Backdrop */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Layer 1: 100% width blurred ambient lighting & colors pulled from the active artwork */}
        <img
          src={ambientBackdropSrc}
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover scale-125 blur-3xl opacity-65 saturate-150 transition-all duration-700"
          referrerPolicy="no-referrer"
        />

        {/* Layer 2: Softly feathered focal artwork dissolved into the ambient lighting (zero hard seam!) */}
        <div
          className="absolute inset-y-0 left-0 w-full lg:w-[78%] overflow-hidden"
          style={{
            maskImage:
              'radial-gradient(ellipse 80% 90% at 32% 44%, rgba(0,0,0,1) 20%, rgba(0,0,0,0.72) 52%, rgba(0,0,0,0) 92%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 80% 90% at 32% 44%, rgba(0,0,0,1) 20%, rgba(0,0,0,0.72) 52%, rgba(0,0,0,0) 92%)',
          }}
        >
          <img
            src={heroArtSrc}
            alt={activeWork.title}
            className="w-full h-full object-cover object-[center_22%] opacity-85 transition-all duration-700"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Layer 3: Subtle cinema contrast scrims preserving the work's own color tone */}
        <div className="absolute inset-0 bg-gradient-to-l from-[#060911]/90 via-[#060911]/45 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#060911] via-[#060911]/25 to-[#060911]/45" />
      </div>

      {/* Main Hero Content Container */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-8">
        <div className="flex flex-col justify-end min-h-[340px] sm:min-h-[410px]">
          <div className="max-w-2xl text-right space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-white/80 font-medium">
              <span className="text-violet-300 font-bold">{categoryLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-300 font-bold tabular-nums">
                ★ {activeWork.rating}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {activeWork.seasons.length}{' '}
                {activeWork.seasons.length === 1 ? 'موسم' : 'مواسم'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{activeWork.episodesCount} حلقة</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.12] [text-wrap:balance] drop-shadow-[0_4px_24px_rgba(0,0,0,0.65)]">
              {activeWork.title}
            </h1>

            <p className="text-sm sm:text-base text-white/85 leading-relaxed max-w-xl line-clamp-3 drop-shadow">
              {activeWork.synopsis}
            </p>

            {/* Primary Cinema Action Row + Compact Spotlight Switcher */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (firstEpisode) {
                    onPlayMedia(firstEpisode, activeWork);
                  } else {
                    onSelectMedia(activeWork);
                  }
                }}
                className="min-h-[46px] px-7 py-2.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm shadow-xl shadow-violet-950/60 flex items-center gap-2 transition-all duration-150 cursor-pointer active:scale-95"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>تشغيل</span>
              </button>

              <button
                type="button"
                onClick={() => toggleFavorite(activeWork.id)}
                className={`min-h-[46px] min-w-[46px] w-11 h-11 rounded-full border backdrop-blur-md flex items-center justify-center transition-all duration-150 cursor-pointer ${
                  activeFavorite
                    ? 'bg-rose-500/30 border-rose-300/75 text-rose-100'
                    : 'bg-white/10 hover:bg-white/20 border-white/30 text-white'
                }`}
                aria-label={activeFavorite ? 'إزالة من قائمتي' : 'أضف إلى قائمتي'}
                title={activeFavorite ? 'موجود في قائمتي' : 'أضف إلى قائمتي'}
              >
                {activeFavorite ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <Plus className="w-5 h-5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => onSelectMedia(activeWork)}
                className="min-h-[46px] px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 backdrop-blur-md text-white font-semibold text-sm flex items-center gap-2 transition-all duration-150 cursor-pointer"
              >
                <Info className="w-4 h-4 text-violet-200" />
                <span>التفاصيل والمواسم</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Hero Shelf: Vertical Poster Rail + Spotlight Arrows */}
        <div className="mt-8 pt-6 border-t border-white/15">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                {railMode === 'favorites' ? 'قائمتي المفضلة' : 'قائمتي وأبرز الأعمال'}
              </h2>

              <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.08] border border-white/15 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setRailMode('all')}
                  className={`px-3.5 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    railMode === 'all'
                      ? 'bg-white text-neutral-950'
                      : 'text-white/75 hover:text-white'
                  }`}
                >
                  جميع الأعمال
                </button>
                <button
                  type="button"
                  onClick={() => setRailMode('favorites')}
                  className={`px-3.5 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    railMode === 'favorites'
                      ? 'bg-white text-neutral-950'
                      : 'text-white/75 hover:text-white'
                  }`}
                >
                  <Heart className="w-3 h-3" />
                  <span className="tabular-nums">المفضلة ({favoriteIds.length})</span>
                </button>
              </div>
            </div>

            {/* Clean Spotlight Switcher Controls */}
            {spotlightWorks.length > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSpotlightIndex(
                      (prev) => (prev - 1 + spotlightWorks.length) % spotlightWorks.length
                    )
                  }
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md text-white flex items-center justify-center cursor-pointer transition-colors"
                  aria-label="العمل السابق"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono text-white/75 tabular-nums px-1.5">
                  {safeIndex + 1} / {spotlightWorks.length}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSpotlightIndex((prev) => (prev + 1) % spotlightWorks.length)
                  }
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md text-white flex items-center justify-center cursor-pointer transition-colors"
                  aria-label="العمل التالي"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {shelfItems.length === 0 ? (
            <div className="rounded-2xl bg-white/[0.05] border border-white/15 backdrop-blur-md p-6 text-center text-xs sm:text-sm text-white/75">
              قائمتك المفضلة فارغة حالياً — اضغط على زر (+) في أي عمل أو مسلسل لإضافته هنا.
            </div>
          ) : (
            <div className="flex items-stretch gap-3.5 sm:gap-4 overflow-x-auto pb-3 pt-1">
              {shelfItems.map((item) => {
                const isSpotlighted =
                  item.kind === 'media' && item.id === activeWork.id;
                const itemFav = isFavorite(item.id);

                return (
                  <div
                    key={item.key}
                    className="group relative w-28 sm:w-32 md:w-36 shrink-0 flex flex-col"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (item.kind === 'comic') {
                          onSelectComic(item.comic);
                        } else {
                          const idx = spotlightWorks.findIndex(
                            (w) => w.id === item.id
                          );
                          if (idx !== -1) setSpotlightIndex(idx);
                          onSelectMedia(item.series);
                        }
                      }}
                      className={`relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-neutral-900 border transition-all duration-200 cursor-pointer shadow-lg ${
                        isSpotlighted
                          ? 'border-violet-400 ring-2 ring-violet-400/50 -translate-y-1'
                          : 'border-white/20 group-hover:border-white/50 group-hover:-translate-y-1'
                      }`}
                    >
                      <img
                        src={item.coverImage}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />

                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="w-10 h-10 rounded-full bg-white/20 border border-white/40 backdrop-blur-md text-white flex items-center justify-center shadow-lg">
                          {item.kind === 'comic' ? (
                            <BookOpen className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4 fill-white translate-x-0.5" />
                          )}
                        </span>
                      </div>

                      <div className="absolute inset-x-0 bottom-0 p-2.5 text-right">
                        <div className="text-[10px] text-white/75 truncate">
                          {item.subtitle} · ★ {item.rating}
                        </div>
                        <div className="text-xs font-bold text-white line-clamp-1">
                          {item.title}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.kind === 'comic') {
                          onReadComic(item.comic);
                        } else {
                          toggleFavorite(item.id);
                        }
                      }}
                      aria-label={
                        item.kind === 'comic'
                          ? `قراءة ${item.title}`
                          : itemFav
                          ? `إزالة ${item.title} من المفضلة`
                          : `إضافة ${item.title} للمفضلة`
                      }
                      className={`absolute top-2 left-2 w-7 h-7 rounded-full backdrop-blur-md border flex items-center justify-center transition-all cursor-pointer ${
                        itemFav
                          ? 'bg-rose-500/80 border-rose-300 text-white opacity-100'
                          : 'bg-black/55 border-white/25 text-white/85 opacity-0 group-hover:opacity-100 hover:bg-white/25'
                      }`}
                    >
                      {item.kind === 'comic' ? (
                        <BookOpen className="w-3.5 h-3.5" />
                      ) : itemFav ? (
                        <Heart className="w-3.5 h-3.5 fill-white" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
