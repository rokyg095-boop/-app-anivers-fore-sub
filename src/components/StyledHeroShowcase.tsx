import React, { useMemo, useState } from 'react';
import {
  Play,
  Plus,
  Check,
  Info,
  ChevronRight,
  ChevronLeft,
  Search,
  Sparkles,
  Heart,
} from 'lucide-react';
import { Comic, DubEpisode, DubSeries } from '../data/mockData.ts';
import { getCustomEpisodeSource } from '../utils/videoSource.ts';
import { useFavorites } from '../utils/favorites.ts';
import { SiteStyleId } from '../utils/siteStyle.ts';
import { HeroSection } from './HeroSection.tsx';
import { BrandLogo } from './BrandLogo.tsx';

interface StyledHeroShowcaseProps {
  styleId: SiteStyleId;
  featuredWorks: DubSeries[];
  comics: Comic[];
  onSelectMedia: (series: DubSeries) => void;
  onPlayMedia: (episode: DubEpisode, series: DubSeries) => void;
  onSelectComic: (comic: Comic) => void;
  onReadComic: (comic: Comic) => void;
  onOpenSearch: () => void;
}

function getFirstPlayableEpisode(series: DubSeries): DubEpisode | undefined {
  const list =
    series.episodes && series.episodes.length > 0
      ? series.episodes
      : series.seasons?.[0]?.episodes || [];
  return (
    list.find(
      (ep) =>
        !ep.isComingSoon ||
        Boolean(
          getCustomEpisodeSource(ep.id)?.driveLink ||
            getCustomEpisodeSource(ep.id)?.videoUrl
        )
    ) || list[0]
  );
}

function getCategoryLabel(series: DubSeries): string {
  return series.category === 'movie'
    ? 'الأفلام السينمائية'
    : series.category === 'anime'
    ? 'عالم الأنمي'
    : series.category === 'tv'
    ? 'المسلسلات التلفزيونية'
    : 'قسم الأنميشن والكرتون';
}

export const StyledHeroShowcase: React.FC<StyledHeroShowcaseProps> = ({
  styleId,
  featuredWorks,
  comics,
  onSelectMedia,
  onPlayMedia,
  onSelectComic,
  onReadComic,
  onOpenSearch,
}) => {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [activeIdx, setActiveIdx] = useState<number>(0);

  const orderedWorks = useMemo(() => {
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

  if (styleId === 'cinema-aura') {
    return (
      <HeroSection
        featuredWorks={featuredWorks}
        comics={comics}
        onSelectMedia={onSelectMedia}
        onPlayMedia={onPlayMedia}
        onSelectComic={onSelectComic}
        onReadComic={onReadComic}
      />
    );
  }

  const total = orderedWorks.length;
  if (total === 0) return null;

  const safeIdx = ((activeIdx % total) + total) % total;
  const activeWork = orderedWorks[safeIdx];
  const activeFav = isFavorite(activeWork.id);
  const firstEp = getFirstPlayableEpisode(activeWork);
  const artSrc = activeWork.coverImage || activeWork.bannerImage;

  const wrapIdx = (offset: number) => ((safeIdx + offset) % total + total) % total;

  const handlePlayActive = () => {
    if (firstEp) {
      onPlayMedia(firstEp, activeWork);
    } else {
      onSelectMedia(activeWork);
    }
  };

  // =========================================================================
  // STYLE 2: Spider-Verse Dramatic Focal Stage (Template 1 inspiration)
  // =========================================================================
  if (styleId === 'spiderverse-stage') {
    const previewStrip = orderedWorks.slice(0, 6);
    return (
      <section className="relative w-full overflow-hidden bg-[#080614] border-b border-rose-500/20">
        {/* Deep Night City Atmosphere + Crimson Radial Aura */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <img
            src={artSrc}
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover scale-125 blur-3xl opacity-45 saturate-150 transition-all duration-700"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_45%,rgba(225,29,72,0.38),transparent_48%),radial-gradient(circle_at_75%_30%,rgba(79,70,229,0.28),transparent_55%)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#080614] via-[#080614]/45 to-[#080614]/70" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-8 space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Right: Dramatic Display Typography & Actions */}
            <div className="lg:col-span-7 text-right space-y-4 order-2 lg:order-1">
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-rose-200/90 font-bold">
                <span>{getCategoryLabel(activeWork)}</span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-300 tabular-nums">★ {activeWork.rating}</span>
                <span aria-hidden="true">·</span>
                <span className="text-white/80 tabular-nums">
                  {activeWork.seasons.length}{' '}
                  {activeWork.seasons.length === 1 ? 'موسم' : 'مواسم'} · {activeWork.episodesCount}{' '}
                  حلقة
                </span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.12] [text-wrap:balance] drop-shadow-[0_6px_28px_rgba(225,29,72,0.35)]">
                {activeWork.title}
              </h1>

              <p className="text-sm sm:text-base text-white/80 leading-relaxed max-w-xl line-clamp-3">
                {activeWork.synopsis}
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handlePlayActive}
                  className="min-h-[46px] px-7 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-black text-sm shadow-xl shadow-rose-950/60 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>مشاهدة الآن</span>
                </button>

                <button
                  type="button"
                  onClick={() => onSelectMedia(activeWork)}
                  className="min-h-[46px] px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 backdrop-blur-md text-white font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Info className="w-4 h-4 text-rose-300" />
                  <span>التفاصيل والمواسم</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleFavorite(activeWork.id)}
                  className={`min-h-[46px] min-w-[46px] rounded-full border backdrop-blur-md flex items-center justify-center cursor-pointer transition-colors ${
                    activeFav
                      ? 'bg-rose-500/35 border-rose-300 text-white'
                      : 'bg-white/10 hover:bg-white/20 border-white/25 text-white'
                  }`}
                  aria-label="المفضلة"
                >
                  {activeFav ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Left: Floating Dynamic Focal Poster with Crimson Ring Halo */}
            <div className="lg:col-span-5 flex items-center justify-center order-1 lg:order-2">
              <div
                onClick={() => onSelectMedia(activeWork)}
                className="relative w-56 sm:w-64 md:w-72 aspect-[2/3] cursor-pointer group"
              >
                <div
                  aria-hidden="true"
                  className="absolute -inset-4 rounded-[2rem] border-4 border-rose-500/60 blur-[1px] rotate-6 group-hover:rotate-3 transition-transform duration-500"
                />
                <div
                  aria-hidden="true"
                  className="absolute -inset-6 rounded-full bg-rose-600/30 blur-2xl"
                />
                <div className="relative w-full h-full rounded-3xl overflow-hidden border-2 border-white/25 shadow-[0_24px_60px_rgba(0,0,0,0.85)] -rotate-2 group-hover:rotate-0 transition-transform duration-300">
                  <img
                    src={artSrc}
                    alt={activeWork.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Trailer/Scene Switcher Strip with Circular Crimson Arrows */}
          <div className="pt-4 border-t border-white/10 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveIdx((p) => p - 1)}
              className="w-10 h-10 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg cursor-pointer shrink-0 transition-transform active:scale-95"
              aria-label="العمل السابق"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <div className="flex-1 flex items-center gap-3 overflow-x-auto py-1">
              {previewStrip.map((work, i) => {
                const selected = work.id === activeWork.id;
                return (
                  <button
                    key={work.id}
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    className={`group relative w-40 sm:w-48 aspect-video rounded-xl overflow-hidden border shrink-0 cursor-pointer transition-all ${
                      selected
                        ? 'border-rose-400 ring-2 ring-rose-500/50 scale-[1.02]'
                        : 'border-white/15 hover:border-white/45 opacity-75 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={work.bannerImage || work.coverImage}
                      alt={work.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-8 h-8 rounded-full bg-rose-600/85 text-white flex items-center justify-center shadow-md">
                        <Play className="w-3.5 h-3.5 fill-white translate-x-[1px]" />
                      </span>
                    </span>
                    <div className="absolute inset-x-0 bottom-0 p-2 text-right">
                      <div className="text-[11px] font-black text-white line-clamp-1">
                        {work.title}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setActiveIdx((p) => p + 1)}
              className="w-10 h-10 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg cursor-pointer shrink-0 transition-transform active:scale-95"
              aria-label="العمل التالي"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>
    );
  }

  // =========================================================================
  // STYLE 3: Netflix 3D Perspective Wing Stage (Template 2 inspiration)
  // =========================================================================
  if (styleId === 'netflix-3d') {
    const offsets = [-2, -1, 0, 1, 2];
    const continueWatchingWorks = orderedWorks.slice(0, 6);

    return (
      <section className="relative w-full overflow-hidden bg-[#0a0b10] border-b border-white/10 py-8 sm:py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {/* 3D Perspective Showcase Row: Wing Cards Flanking Prominent Center Card */}
          <div
            className="relative flex items-center justify-center min-h-[340px] sm:min-h-[410px]"
            style={{ perspective: '1400px' }}
          >
            {/* Left / Right White Circular Navigation Arrows */}
            <button
              type="button"
              onClick={() => setActiveIdx((p) => p - 1)}
              className="absolute right-1 sm:right-4 z-40 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/90 hover:bg-white text-neutral-950 flex items-center justify-center shadow-xl cursor-pointer transition-transform active:scale-95"
              aria-label="السابق"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => setActiveIdx((p) => p + 1)}
              className="absolute left-1 sm:left-4 z-40 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/90 hover:bg-white text-neutral-950 flex items-center justify-center shadow-xl cursor-pointer transition-transform active:scale-95"
              aria-label="التالي"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center justify-center gap-2 sm:gap-4 w-full overflow-hidden py-4" dir="ltr">
              {offsets.map((offset) => {
                const idx = wrapIdx(offset);
                const work = orderedWorks[idx];
                const isCenter = offset === 0;
                const workFav = isFavorite(work.id);

                if (Math.abs(offset) === 2) {
                  return (
                    <button
                      key={`wing2-${offset}-${work.id}`}
                      type="button"
                      onClick={() => setActiveIdx(idx)}
                      style={{
                        transform: `rotateY(${offset < 0 ? 28 : -28}deg) scale(0.84)`,
                      }}
                      className="hidden md:block relative w-32 lg:w-40 aspect-[2/3] rounded-xl overflow-hidden border border-white/15 opacity-55 hover:opacity-85 transition-all duration-300 cursor-pointer shrink-0 shadow-2xl"
                    >
                      <img
                        src={work.coverImage || work.bannerImage}
                        alt={work.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </button>
                  );
                }

                if (Math.abs(offset) === 1) {
                  return (
                    <button
                      key={`wing1-${offset}-${work.id}`}
                      type="button"
                      onClick={() => setActiveIdx(idx)}
                      style={{
                        transform: `rotateY(${offset < 0 ? 18 : -18}deg) scale(0.92)`,
                      }}
                      className="hidden sm:block relative w-40 md:w-48 lg:w-56 aspect-[2/3] rounded-2xl overflow-hidden border border-white/20 opacity-80 hover:opacity-100 transition-all duration-300 cursor-pointer shrink-0 shadow-2xl"
                    >
                      <img
                        src={work.coverImage || work.bannerImage}
                        alt={work.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-3 text-right" dir="rtl">
                        <div className="text-xs font-black text-white line-clamp-1">
                          {work.title}
                        </div>
                      </div>
                    </button>
                  );
                }

                return (
                  <div
                    key={`center-${work.id}`}
                    className="relative z-30 w-64 sm:w-72 md:w-80 aspect-[3/4] rounded-2xl overflow-hidden border-2 border-white/30 shadow-[0_28px_70px_rgba(0,0,0,0.9)] shrink-0 bg-neutral-900"
                    dir="rtl"
                  >
                    <img
                      src={work.coverImage || work.bannerImage}
                      alt={work.title}
                      onClick={() => onSelectMedia(work)}
                      className="w-full h-full object-cover cursor-pointer"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/15 pointer-events-none" />

                    {/* Top Rating & Duration Row */}
                    <div className="absolute top-3 inset-x-3 flex items-center justify-between text-[11px] font-bold">
                      <span className="px-2 py-0.5 rounded bg-amber-400 text-neutral-950 font-black tabular-nums">
                        ★ {work.rating}
                      </span>
                      <span className="text-white/85 drop-shadow">
                        {work.seasons.length} مواسم · {work.episodesCount} حلقة
                      </span>
                    </div>

                    {/* Centered Bottom Title + Crimson Watch & Yellow Add-List Buttons */}
                    <div className="absolute inset-x-0 bottom-0 p-4 text-center space-y-2.5">
                      <div className="text-[11px] text-rose-300 font-bold">
                        {getCategoryLabel(work)}
                      </div>
                      <h1 className="text-xl sm:text-2xl font-black text-white leading-tight line-clamp-2 drop-shadow">
                        {work.title}
                      </h1>

                      <div className="flex items-center justify-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handlePlayActive}
                          className="min-h-[40px] px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-lg transition-colors"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>مشاهدة</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleFavorite(work.id)}
                          className="min-h-[40px] px-4 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-lg transition-colors"
                        >
                          {workFav ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                          <span>{workFav ? 'في قائمتي' : 'أضف لقائمتي'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Inline Centered Search Bar Bar (Template 2 middle section) */}
          <div className="max-w-md mx-auto text-center space-y-2">
            <button
              type="button"
              onClick={onOpenSearch}
              className="w-full h-11 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/20 flex items-center justify-between text-xs text-white/75 cursor-pointer transition-colors"
            >
              <span className="flex items-center gap-2">
                <Search className="w-4 h-4 text-red-400" />
                <span>ابحث بالاسم أو التصنيف...</span>
              </span>
              <span className="text-red-400 font-black">بحث</span>
            </button>
            <div className="text-[11px] text-white/45">
              أنميشن · أفلام · أنمي · مسلسلات تلفزيونية · كوميكس
            </div>
          </div>

          {/* Bottom Continue Watching / Quick Episodes Widescreen Strip */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-black text-white">
                متابعة المشاهدة وأبرز أعمالك
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveIdx((p) => p - 1)}
                  className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                  aria-label="السابق"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveIdx((p) => p + 1)}
                  className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                  aria-label="التالي"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {continueWatchingWorks.map((work) => {
                const ep = getFirstPlayableEpisode(work);
                return (
                  <button
                    key={work.id}
                    type="button"
                    onClick={() => (ep ? onPlayMedia(ep, work) : onSelectMedia(work))}
                    className="group text-right space-y-1.5 cursor-pointer"
                  >
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-neutral-900 border border-white/15 group-hover:border-red-500/70 transition-colors">
                      <img
                        src={work.bannerImage || work.coverImage}
                        alt={work.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/25 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <span className="w-8 h-8 rounded-full bg-black/60 border border-white/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play className="w-3.5 h-3.5 fill-white" />
                        </span>
                      </div>
                    </div>
                    <div className="text-xs font-bold text-white line-clamp-1">
                      {work.title}
                    </div>
                    <div className="text-[11px] text-white/55 line-clamp-1">
                      {ep ? `الحلقة ${ep.episodeNumber}` : `${work.episodesCount} حلقة`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // =========================================================================
  // STYLE 4: Oli Studio Panoramic Curved Fan Stage (Template 3 inspiration)
  // =========================================================================
  if (styleId === 'oli-studio') {
    const fanOffsets = [-2, -1, 0, 1, 2];
    return (
      <section className="relative w-full overflow-hidden bg-[#0c0c10] border-b border-white/10 py-10 sm:py-14">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_18%,rgba(244,63,94,0.16),transparent_55%)]"
        />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-7">
          {/* Centered Cat Logo Emblem + Studio Heading */}
          <div className="flex flex-col items-center gap-2.5">
            <BrandLogo size="md" />
            <div className="text-base sm:text-lg font-black tracking-tight text-white">
              AniVerse Studio
            </div>
          </div>

          {/* Panoramic Curved Horizontal Gallery Fan of User's Works */}
          <div
            className="relative flex items-center justify-center gap-2.5 sm:gap-4 py-4 overflow-hidden"
            style={{ perspective: '1300px' }}
            dir="ltr"
          >
            {fanOffsets.map((offset) => {
              const idx = wrapIdx(offset);
              const work = orderedWorks[idx];
              const isCenter = offset === 0;
              const abs = Math.abs(offset);

              return (
                <button
                  key={`fan-${offset}-${work.id}`}
                  type="button"
                  onClick={() => (isCenter ? onSelectMedia(work) : setActiveIdx(idx))}
                  style={{
                    transform: `translateY(${abs * 10}px) rotateY(${
                      offset * -14
                    }deg) scale(${isCenter ? 1.06 : abs === 1 ? 0.96 : 0.88})`,
                  }}
                  className={`relative rounded-2xl overflow-hidden border transition-all duration-300 cursor-pointer shrink-0 bg-neutral-900 ${
                    abs === 2 ? 'hidden md:block w-36 lg:w-44' : 'w-28 sm:w-44 md:w-48'
                  } aspect-[2/3] ${
                    isCenter
                      ? 'border-rose-400 ring-2 ring-rose-500/40 shadow-[0_24px_60px_rgba(0,0,0,0.85)] z-20'
                      : 'border-white/15 opacity-80 hover:opacity-100 z-10'
                  }`}
                >
                  <img
                    src={work.coverImage || work.bannerImage}
                    alt={work.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-2.5 text-right" dir="rtl">
                    <div className="text-[10px] text-rose-300 font-bold tabular-nums">
                      ★ {work.rating}
                    </div>
                    <div className="text-xs font-black text-white line-clamp-1">
                      {work.title}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Poetic Active Work Summary + Dual Pill CTAs */}
          <div className="max-w-xl mx-auto space-y-3">
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              {activeWork.title}
            </h1>
            <p className="text-xs sm:text-sm text-white/70 leading-relaxed line-clamp-2">
              {activeWork.synopsis}
            </p>

            <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setActiveIdx((p) => p - 1)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center cursor-pointer"
                aria-label="العمل السابق"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handlePlayActive}
                className="min-h-[44px] px-6 py-2 rounded-xl bg-white text-neutral-950 hover:bg-neutral-200 font-black text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Play className="w-4 h-4 fill-neutral-950" />
                <span>مشاهدة الآن</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectMedia(activeWork)}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/20 text-white font-bold text-xs sm:text-sm cursor-pointer transition-colors"
              >
                التفاصيل والمواسم
              </button>

              <button
                type="button"
                onClick={() => setActiveIdx((p) => p + 1)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center cursor-pointer"
                aria-label="العمل التالي"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // =========================================================================
  // STYLE 5: Aurora Glass Split Stage
  // =========================================================================
  if (styleId === 'aurora-glass') {
    return (
      <section className="relative w-full overflow-hidden bg-[#070c14] border-b border-emerald-400/15 py-8 sm:py-12">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.18),transparent_48%),radial-gradient(circle_at_15%_75%,rgba(99,102,241,0.22),transparent_50%)]"
        />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-white/[0.04] border border-emerald-400/20 backdrop-blur-2xl p-5 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center shadow-2xl">
            <div className="lg:col-span-7 text-right space-y-4">
              <div className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span>{getCategoryLabel(activeWork)} · ★ {activeWork.rating}</span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight">
                {activeWork.title}
              </h1>
              <p className="text-sm text-white/75 leading-relaxed line-clamp-3">
                {activeWork.synopsis}
              </p>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handlePlayActive}
                  className="min-h-[44px] px-6 py-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-sm flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-neutral-950" />
                  <span>تشغيل</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectMedia(activeWork)}
                  className="min-h-[44px] px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm cursor-pointer"
                >
                  التفاصيل
                </button>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pt-3">
                {orderedWorks.slice(0, 7).map((w, i) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    className={`w-14 h-20 rounded-xl overflow-hidden border shrink-0 cursor-pointer transition-all ${
                      w.id === activeWork.id
                        ? 'border-emerald-400 ring-2 ring-emerald-400/40 scale-105'
                        : 'border-white/15 opacity-65 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={w.coverImage || w.bannerImage}
                      alt={w.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 flex justify-center">
              <div
                onClick={() => onSelectMedia(activeWork)}
                className="w-60 sm:w-72 aspect-[2/3] rounded-3xl overflow-hidden border border-emerald-300/35 shadow-2xl cursor-pointer hover:scale-[1.02] transition-transform"
              >
                <img
                  src={artSrc}
                  alt={activeWork.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // =========================================================================
  // STYLE 6: Cyber Neon HUD Stage
  // =========================================================================
  if (styleId === 'cyber-neon') {
    return (
      <section className="relative w-full overflow-hidden bg-[#05050a] border-b border-cyan-400/30 py-8 sm:py-12">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_25%_30%,rgba(6,182,212,0.22),transparent_48%),radial-gradient(circle_at_80%_70%,rgba(217,70,239,0.2),transparent_52%)]"
        />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 text-right space-y-4">
            <div className="text-xs font-mono font-bold text-cyan-300 tracking-wide">
              {getCategoryLabel(activeWork)} // ★ {activeWork.rating} // {activeWork.episodesCount} EP
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight drop-shadow-[0_0_24px_rgba(34,211,238,0.35)]">
              {activeWork.title}
            </h1>
            <p className="text-sm text-white/80 leading-relaxed line-clamp-3">
              {activeWork.synopsis}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handlePlayActive}
                className="min-h-[44px] px-6 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-black text-sm flex items-center gap-2 cursor-pointer shadow-[0_0_24px_rgba(6,182,212,0.45)]"
              >
                <Play className="w-4 h-4 fill-neutral-950" />
                <span>تشغيل الآن</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectMedia(activeWork)}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-fuchsia-600/20 hover:bg-fuchsia-600/35 border border-fuchsia-400/60 text-fuchsia-200 font-bold text-sm cursor-pointer"
              >
                المواسم والتفاصيل
              </button>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveIdx((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-cyan-400/40 text-cyan-300 text-xs font-bold cursor-pointer"
              >
                السابق
              </button>
              <span className="text-xs font-mono text-white/60 tabular-nums">
                {safeIdx + 1} / {total}
              </span>
              <button
                type="button"
                onClick={() => setActiveIdx((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-cyan-400/40 text-cyan-300 text-xs font-bold cursor-pointer"
              >
                التالي
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 flex justify-center">
            <div
              onClick={() => onSelectMedia(activeWork)}
              className="relative w-60 sm:w-72 aspect-[2/3] p-1.5 rounded-2xl border border-cyan-400/60 bg-gradient-to-br from-cyan-500/20 to-fuchsia-500/20 shadow-[0_0_40px_rgba(6,182,212,0.25)] cursor-pointer"
            >
              <img
                src={artSrc}
                alt={activeWork.title}
                className="w-full h-full object-cover rounded-xl"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      </section>
    );
  }

  // =========================================================================
  // STYLE 7: Sakura Warm Ivory Light Editorial Stage
  // =========================================================================
  return (
    <section className="relative w-full overflow-hidden bg-[#f6f2eb] text-neutral-900 border-b border-neutral-300/80 py-8 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="rounded-3xl bg-white border border-neutral-200/90 shadow-xl p-5 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 text-right space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-bold text-rose-600">
              <span>{getCategoryLabel(activeWork)}</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-700 tabular-nums">★ {activeWork.rating}</span>
              <span aria-hidden="true">·</span>
              <span className="text-neutral-600">
                {activeWork.seasons.length} مواسم · {activeWork.episodesCount} حلقة
              </span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-black text-neutral-950 leading-tight">
              {activeWork.title}
            </h1>

            <p className="text-sm sm:text-base text-neutral-600 leading-relaxed line-clamp-3">
              {activeWork.synopsis}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handlePlayActive}
                className="min-h-[46px] px-7 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-black text-sm shadow-lg shadow-rose-200 flex items-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>مشاهدة الآن</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectMedia(activeWork)}
                className="min-h-[46px] px-5 py-2.5 rounded-full bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 text-neutral-900 font-bold text-sm cursor-pointer"
              >
                التفاصيل والمواسم
              </button>

              <button
                type="button"
                onClick={() => toggleFavorite(activeWork.id)}
                className={`min-h-[46px] min-w-[46px] rounded-full border flex items-center justify-center cursor-pointer ${
                  activeFav
                    ? 'bg-rose-50 border-rose-400 text-rose-600'
                    : 'bg-neutral-100 border-neutral-300 text-neutral-700'
                }`}
                aria-label="المفضلة"
              >
                <Heart className={`w-5 h-5 ${activeFav ? 'fill-rose-600' : ''}`} />
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 flex justify-center">
            <div
              onClick={() => onSelectMedia(activeWork)}
              className="w-56 sm:w-68 aspect-[2/3] rounded-3xl overflow-hidden border border-neutral-200 shadow-2xl cursor-pointer hover:-translate-y-1 transition-transform"
            >
              <img
                src={artSrc}
                alt={activeWork.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>

        {/* Light Paper Poster Rail */}
        <div className="flex items-center gap-3 overflow-x-auto pb-2">
          {orderedWorks.map((work, i) => (
            <button
              key={work.id}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={`w-28 sm:w-32 shrink-0 rounded-2xl overflow-hidden border transition-all cursor-pointer bg-white shadow ${
                work.id === activeWork.id
                  ? 'border-rose-500 ring-2 ring-rose-400/50 -translate-y-1'
                  : 'border-neutral-200 hover:border-neutral-400'
              }`}
            >
              <div className="aspect-[2/3] w-full overflow-hidden">
                <img
                  src={work.coverImage || work.bannerImage}
                  alt={work.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="p-2 text-right">
                <div className="text-[11px] font-black text-neutral-900 line-clamp-1">
                  {work.title}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
