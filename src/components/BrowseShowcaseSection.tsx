import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Play,
  BookOpen,
  Info,
  Heart,
  Plus,
  ChevronLeft,
  ChevronRight,
  Compass,
  X,
  Sparkles,
} from 'lucide-react';
import { Comic, DubEpisode, DubSeries } from '../data/mockData.ts';
import { getCustomEpisodeSource } from '../utils/videoSource.ts';
import { useFavorites } from '../utils/favorites.ts';

type BrowseCategoryFilter = 'all' | 'dubbed' | 'movie' | 'anime' | 'tv' | 'comics';

export type BrowseItem =
  | {
      key: string;
      id: string;
      kind: 'media';
      filterGroup: Exclude<BrowseCategoryFilter, 'all' | 'comics'>;
      categoryLabel: string;
      title: string;
      synopsis: string;
      coverImage: string;
      rating: number;
      metaSummary: string;
      series: DubSeries;
    }
  | {
      key: string;
      id: string;
      kind: 'comic';
      filterGroup: 'comics';
      categoryLabel: string;
      title: string;
      synopsis: string;
      coverImage: string;
      rating: number;
      metaSummary: string;
      comic: Comic;
    };

interface BrowseShowcaseSectionProps {
  mediaWorks: DubSeries[];
  comics: Comic[];
  onSelectMedia: (series: DubSeries) => void;
  onPlayMedia: (episode: DubEpisode, series: DubSeries) => void;
  onSelectComic: (comic: Comic) => void;
  onReadComic: (comic: Comic) => void;
}

const FILTER_TABS: { id: BrowseCategoryFilter; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'dubbed', label: 'الأنميشن والكرتون' },
  { id: 'movie', label: 'الأفلام' },
  { id: 'anime', label: 'الأنمي' },
  { id: 'tv', label: 'المسلسلات التلفزيونية' },
  { id: 'comics', label: 'الكوميكس' },
];

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export const BrowseShowcaseSection: React.FC<BrowseShowcaseSectionProps> = ({
  mediaWorks,
  comics,
  onSelectMedia,
  onPlayMedia,
  onSelectComic,
  onReadComic,
}) => {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [isBrowseOpen, setIsBrowseOpen] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<BrowseCategoryFilter>('all');
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const allItems = useMemo<BrowseItem[]>(() => {
    const mediaList: BrowseItem[] = mediaWorks.map((series) => {
      const cat = series.category || 'dubbed';
      const catLabel =
        cat === 'movie'
          ? 'الأفلام السينمائية'
          : cat === 'anime'
          ? 'عالم الأنمي'
          : cat === 'tv'
          ? 'المسلسلات التلفزيونية'
          : 'الأنميشن والكرتون';
      const seasonsCount = series.seasons?.length || 1;
      const epCount = series.episodesCount || series.episodes?.length || 0;
      const metaSummary =
        cat === 'movie'
          ? 'فيلم كامل'
          : `${seasonsCount} ${seasonsCount === 1 ? 'موسم' : 'مواسم'} · ${epCount} حلقة`;

      return {
        key: `media-${series.id}`,
        id: series.id,
        kind: 'media',
        filterGroup: cat,
        categoryLabel: catLabel,
        title: series.title,
        synopsis: series.synopsis,
        coverImage: series.coverImage || series.bannerImage,
        rating: series.rating,
        metaSummary,
        series,
      };
    });

    const comicList: BrowseItem[] = comics.map((comic) => ({
      key: `comic-${comic.id}`,
      id: comic.id,
      kind: 'comic',
      filterGroup: 'comics',
      categoryLabel: 'مكتبة الكوميكس',
      title: comic.title,
      synopsis: comic.synopsis,
      coverImage: comic.coverImage,
      rating: comic.rating,
      metaSummary: `${comic.chapters.length} ${comic.chapters.length === 1 ? 'فصل' : 'فصول'}`,
      comic,
    }));

    return [...mediaList, ...comicList];
  }, [mediaWorks, comics]);

  const filteredItems = useMemo<BrowseItem[]>(() => {
    if (activeFilter === 'all') return allItems;
    return allItems.filter((item) => item.filterGroup === activeFilter);
  }, [allItems, activeFilter]);

  const previewPosters = useMemo(() => allItems.slice(0, 5), [allItems]);

  // Kinetic 3D Carousel Engine Refs
  const stageRef = useRef<HTMLDivElement | null>(null);
  const backdropGlowRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const artRefs = useRef<(HTMLImageElement | null)[]>([]);

  const targetPosRef = useRef<number>(0);
  const currentPosRef = useRef<number>(0);
  const velocityRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const hasDraggedRef = useRef<boolean>(false);
  const dragStartXRef = useRef<number>(0);
  const dragStartPosRef = useRef<number>(0);
  const lastPointerXRef = useRef<number>(0);
  const lastPointerTimeRef = useRef<number>(0);
  const wheelSnapTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeIndexRef = useRef<number>(0);
  const reducedMotionRef = useRef<boolean>(false);

  const getCardStep = useCallback(() => {
    if (typeof window === 'undefined') return 260;
    if (window.innerWidth < 480) return 175;
    if (window.innerWidth < 768) return 215;
    if (window.innerWidth < 1024) return 250;
    return 285;
  }, []);

  const applyFrameTransforms = useCallback(
    (pos: number, count: number) => {
      if (count === 0) return;
      const step = getCardStep();
      const reduceMotion = reducedMotionRef.current;

      if (backdropGlowRef.current && !reduceMotion) {
        const shiftX = -((pos * 26) % 240);
        backdropGlowRef.current.style.transform = `translate3d(${shiftX}px, 0, 0)`;
      }

      for (let i = 0; i < count; i++) {
        const cardEl = cardRefs.current[i];
        if (!cardEl) continue;

        const delta = i - pos;
        const absDelta = Math.abs(delta);

        if (absDelta > 4.4) {
          cardEl.style.opacity = '0';
          cardEl.style.pointerEvents = 'none';
          cardEl.style.transform = 'translate3d(0, 0, 0) scale(0.5)';
          continue;
        }

        // Arabic RTL order: index 0 centered, next indices (+1, +2) flow to the LEFT
        const x =
          -delta * step +
          (delta === 0 ? 0 : Math.sign(-delta) * Math.min(absDelta, 2) * 14);
        const y = reduceMotion
          ? 0
          : absDelta < 0.25
          ? -10 * (1 - absDelta * 4)
          : Math.min(absDelta * 14, 46);
        const scale = reduceMotion
          ? Math.max(0.84, 1.04 - absDelta * 0.08)
          : Math.max(0.62, 1.07 - absDelta * 0.16);
        const rotateY = reduceMotion ? 0 : clamp(delta * 20, -40, 40);
        const opacity = clamp(1.06 - absDelta * 0.23, 0, 1);
        const zIndex = Math.round(60 - absDelta * 10);

        cardEl.style.opacity = opacity.toFixed(3);
        cardEl.style.pointerEvents = absDelta < 3.6 ? 'auto' : 'none';
        cardEl.style.zIndex = String(zIndex);
        cardEl.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(
          2
        )}px, 0) scale(${scale.toFixed(4)}) rotateY(${rotateY.toFixed(2)}deg)`;

        const artEl = artRefs.current[i];
        if (artEl && !reduceMotion) {
          const panX = clamp(delta * 16, -34, 34);
          artEl.style.transform = `translate3d(${panX.toFixed(2)}px, 0, 0) scale(1.08)`;
        }
      }
    },
    [getCardStep]
  );

  // Physics loop while Browse Stage is open
  useEffect(() => {
    if (!isBrowseOpen) return;

    reducedMotionRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const count = filteredItems.length;
    if (count === 0) return;

    // Entry sweep animation: start slightly offset so cards glide horizontally into formation
    targetPosRef.current = 0;
    currentPosRef.current = reducedMotionRef.current ? 0 : Math.min(count - 1, 2.2);
    velocityRef.current = 0;
    activeIndexRef.current = 0;
    setActiveIndex(0);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      const maxIdx = Math.max(0, filteredItems.length - 1);

      if (!isDraggingRef.current) {
        if (Math.abs(velocityRef.current) > 0.002) {
          targetPosRef.current = clamp(
            targetPosRef.current + velocityRef.current,
            0,
            maxIdx
          );
          velocityRef.current *= 0.88;
          if (Math.abs(velocityRef.current) <= 0.015) {
            velocityRef.current = 0;
            targetPosRef.current = clamp(Math.round(targetPosRef.current), 0, maxIdx);
          }
        }

        const diff = targetPosRef.current - currentPosRef.current;
        if (Math.abs(diff) > 0.0008) {
          currentPosRef.current += diff * (reducedMotionRef.current ? 0.35 : 0.16);
        } else {
          currentPosRef.current = targetPosRef.current;
        }
      }

      applyFrameTransforms(currentPosRef.current, filteredItems.length);

      const nearest = clamp(Math.round(currentPosRef.current), 0, maxIdx);
      if (nearest !== activeIndexRef.current) {
        activeIndexRef.current = nearest;
        setActiveIndex(nearest);
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);

    const handleResize = () => {
      applyFrameTransforms(currentPosRef.current, filteredItems.length);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      mounted = false;
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('resize', handleResize);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      if (wheelSnapTimerRef.current !== null) {
        window.clearTimeout(wheelSnapTimerRef.current);
      }
    };
  }, [isBrowseOpen, filteredItems, applyFrameTransforms]);

  const goToIndex = useCallback(
    (index: number) => {
      const maxIdx = Math.max(0, filteredItems.length - 1);
      velocityRef.current = 0;
      targetPosRef.current = clamp(index, 0, maxIdx);
    },
    [filteredItems.length]
  );

  const openItemPlayOrRead = useCallback(
    (item: BrowseItem) => {
      setIsBrowseOpen(false);
      if (item.kind === 'comic') {
        onReadComic(item.comic);
        return;
      }
      const firstEp =
        item.series.episodes?.find(
          (ep) =>
            !ep.isComingSoon ||
            Boolean(
              getCustomEpisodeSource(ep.id)?.driveLink ||
                getCustomEpisodeSource(ep.id)?.videoUrl
            )
        ) ||
        item.series.episodes?.[0] ||
        item.series.seasons?.[0]?.episodes?.[0];
      if (firstEp) {
        onPlayMedia(firstEp, item.series);
      } else {
        onSelectMedia(item.series);
      }
    },
    [onPlayMedia, onReadComic, onSelectMedia]
  );

  const openItemDetails = useCallback(
    (item: BrowseItem) => {
      setIsBrowseOpen(false);
      if (item.kind === 'comic') {
        onSelectComic(item.comic);
      } else {
        onSelectMedia(item.series);
      }
    },
    [onSelectComic, onSelectMedia]
  );

  // Keyboard navigation when Browse Stage is open
  useEffect(() => {
    if (!isBrowseOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsBrowseOpen(false);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToIndex(Math.round(targetPosRef.current) + 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToIndex(Math.round(targetPosRef.current) - 1);
      } else if (e.key === 'Enter') {
        const current = filteredItems[activeIndexRef.current];
        if (current) {
          e.preventDefault();
          openItemDetails(current);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBrowseOpen, filteredItems, goToIndex, openItemDetails]);

  // Pointer Drag Handling (1:1 finger/mouse tracking + throw inertia)
  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    velocityRef.current = 0;
    dragStartXRef.current = e.clientX;
    dragStartPosRef.current = currentPosRef.current;
    lastPointerXRef.current = e.clientX;
    lastPointerTimeRef.current = performance.now();

    const step = getCardStep();
    const maxIdx = Math.max(0, filteredItems.length - 1);

    const handleWindowMove = (ev: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = ev.clientX - dragStartXRef.current;
      if (Math.abs(dx) > 7) {
        hasDraggedRef.current = true;
      }

      const rawPos = dragStartPosRef.current + dx / step;
      // Soft rubber-band resistance past ends
      const clamped =
        rawPos < 0
          ? rawPos * 0.25
          : rawPos > maxIdx
          ? maxIdx + (rawPos - maxIdx) * 0.25
          : rawPos;
      currentPosRef.current = clamped;
      targetPosRef.current = clamp(clamped, 0, maxIdx);

      const now = performance.now();
      const dt = Math.max(8, now - lastPointerTimeRef.current);
      const vx = ((ev.clientX - lastPointerXRef.current) / step) * (16 / dt);
      velocityRef.current = clamp(vx * 0.65, -0.55, 0.55);
      lastPointerXRef.current = ev.clientX;
      lastPointerTimeRef.current = now;
    };

    const handleWindowUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      window.removeEventListener('pointermove', handleWindowMove);
      window.removeEventListener('pointerup', handleWindowUp);
      window.removeEventListener('pointercancel', handleWindowUp);

      if (Math.abs(velocityRef.current) < 0.04) {
        velocityRef.current = 0;
        targetPosRef.current = clamp(Math.round(currentPosRef.current), 0, maxIdx);
      }
      window.setTimeout(() => {
        hasDraggedRef.current = false;
      }, 60);
    };

    window.addEventListener('pointermove', handleWindowMove);
    window.addEventListener('pointerup', handleWindowUp);
    window.addEventListener('pointercancel', handleWindowUp);
  };

  // Smooth Wheel / Trackpad gliding
  const handleStageWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const maxIdx = Math.max(0, filteredItems.length - 1);
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? -e.deltaX : e.deltaY;
    if (Math.abs(delta) < 1) return;

    velocityRef.current = 0;
    targetPosRef.current = clamp(targetPosRef.current + delta / 220, 0, maxIdx);

    if (wheelSnapTimerRef.current !== null) {
      window.clearTimeout(wheelSnapTimerRef.current);
    }
    wheelSnapTimerRef.current = window.setTimeout(() => {
      targetPosRef.current = clamp(Math.round(targetPosRef.current), 0, maxIdx);
    }, 110);
  };

  const activeItem = filteredItems[activeIndex] || filteredItems[0] || null;
  const activeFav = activeItem ? isFavorite(activeItem.id) : false;

  return (
    <>
      {/* Front-Page Entry Box ("خانة التصفح") placed directly below the Hero */}
      <section
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
        aria-label="التصفح التفاعلي"
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsBrowseOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsBrowseOpen(true);
            }
          }}
          className="group relative overflow-hidden rounded-3xl border border-white/15 hover:border-violet-400/55 bg-[#0b1020]/90 backdrop-blur-xl p-5 sm:p-7 shadow-2xl cursor-pointer transition-colors duration-200"
        >
          {/* Color-matched ambient backdrop from preview posters */}
          {previewPosters[0] && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <img
                src={previewPosters[0].coverImage}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover blur-3xl opacity-25 scale-125 group-hover:opacity-35 transition-opacity duration-300"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-l from-[#070b15]/95 via-[#090e1c]/80 to-[#090e1c]/60" />
            </div>
          )}

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Right Side: Clear "التصفح" Title & Description */}
            <div className="text-right space-y-2 max-w-xl w-full">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 via-fuchsia-500 to-amber-400 flex items-center justify-center text-white shadow-lg shadow-violet-950/50 shrink-0 group-hover:scale-105 transition-transform duration-200">
                  <Compass className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    التصفح
                  </h2>
                  <div className="text-xs text-violet-300 font-semibold tabular-nums">
                    {allItems.length} عمل · مسلسلات وأفلام وأنمي وكوميكس
                  </div>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-white/75 leading-relaxed">
                ادخل لاستعراض المسلسلات والأفلام مرتبة عرضياً بحركة ثلاثية الأبعاد سلسة — اسحب
                وقلّب بين البوسترات وكأنك تتحرك داخل العرض.
              </p>
            </div>

            {/* Left Side: Live Fanned Horizontal Poster Preview + Enter Action */}
            <div className="flex items-center justify-between md:justify-end gap-5 w-full md:w-auto">
              <div
                className="flex items-center -space-x-4 space-x-reverse sm:-space-x-3 sm:space-x-reverse py-1"
                aria-hidden="true"
              >
                {previewPosters.map((poster, idx) => {
                  const tilt = (idx - 2) * 5;
                  return (
                    <div
                      key={poster.key}
                      style={{
                        transform: `rotate(${tilt}deg) translateY(${Math.abs(idx - 2) * 3}px)`,
                      }}
                      className="w-12 h-16 sm:w-14 sm:h-20 rounded-xl overflow-hidden border border-white/25 bg-neutral-900 shadow-lg transition-transform duration-300 group-hover:scale-105"
                    >
                      <img
                        src={poster.coverImage}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  );
                })}
              </div>

              <span className="min-h-[46px] px-6 py-2.5 rounded-full bg-violet-600 group-hover:bg-violet-500 text-white font-black text-sm shadow-xl shadow-violet-950/60 flex items-center gap-2 whitespace-nowrap shrink-0 transition-all duration-150 group-active:scale-95">
                <Sparkles className="w-4 h-4 text-amber-200" />
                <span>دخول التصفح</span>
                <ChevronLeft className="w-4 h-4" />
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Full-Viewport Kinetic 3D Horizontal Browse Stage */}
      {isBrowseOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-[#050811] text-white flex flex-col overflow-hidden select-none"
            dir="rtl"
            role="dialog"
            aria-modal="true"
            aria-label="التصفح العرضي التفاعلي"
          >
            {/* Dynamic Color-Matched Ambient Backdrop synced to Active Centered Work */}
            {activeItem && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div
                  ref={backdropGlowRef}
                  className="absolute -inset-12 will-change-transform"
                >
                  <img
                    key={activeItem.key}
                    src={activeItem.coverImage}
                    alt=""
                    aria-hidden="true"
                    className="w-full h-full object-cover blur-3xl opacity-55 saturate-150 scale-110 transition-opacity duration-500"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(124,58,237,0.16),transparent_60%)]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050811] via-[#050811]/55 to-[#050811]/85" />
              </div>
            )}

            {/* Top Header & Category Filter Strip */}
            <header className="relative z-20 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-2 flex flex-col gap-3 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 via-fuchsia-500 to-amber-400 flex items-center justify-center shadow-lg">
                    <Compass className="w-4 h-4 text-white" />
                  </span>
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-white leading-tight">
                      التصفح
                    </h2>
                    <p className="text-[11px] sm:text-xs text-white/65">
                      اسحب يميناً أو يساراً للتقليب بسلاسة بين الأعمال
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsBrowseOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
                  aria-label="إغلاق التصفح"
                >
                  <X className="w-4 h-4" />
                  <span>عودة</span>
                </button>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {FILTER_TABS.map((tab) => {
                  const selected = activeFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveFilter(tab.id);
                        setActiveIndex(0);
                      }}
                      className={`min-h-[38px] px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer transition-colors border shrink-0 ${
                        selected
                          ? 'bg-white text-neutral-950 border-white shadow-lg'
                          : 'bg-white/[0.06] hover:bg-white/[0.12] text-white/75 hover:text-white border-white/15'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </header>

            {/* Kinetic Horizontal 3D Coverflow Stage */}
            <div
              ref={stageRef}
              onPointerDown={handleStagePointerDown}
              onWheel={handleStageWheel}
              className="relative z-10 flex-1 min-h-[260px] flex items-center justify-center overflow-hidden touch-pan-y cursor-grab active:cursor-grabbing"
              style={{ perspective: '1250px' }}
              dir="ltr"
            >
              {filteredItems.length === 0 ? (
                <div className="text-center text-white/70 text-sm px-6" dir="rtl">
                  لا توجد أعمال في هذا التصنيف حالياً.
                </div>
              ) : (
                <div className="relative w-full h-full flex items-center justify-center">
                  {filteredItems.map((item, idx) => {
                    const isCenter = idx === activeIndex;
                    return (
                      <div
                        key={item.key}
                        ref={(el) => {
                          cardRefs.current[idx] = el;
                        }}
                        onClick={() => {
                          if (hasDraggedRef.current) return;
                          if (isCenter) {
                            openItemDetails(item);
                          } else {
                            goToIndex(idx);
                          }
                        }}
                        className="absolute w-[170px] sm:w-[210px] md:w-[240px] aspect-[2/3] will-change-transform cursor-pointer"
                        style={{ transformStyle: 'preserve-3d' }}
                      >
                        <div
                          className={`relative w-full h-full rounded-2xl overflow-hidden bg-neutral-900 border transition-shadow duration-300 ${
                            isCenter
                              ? 'border-violet-300/90 ring-2 ring-violet-400/50 shadow-[0_24px_60px_rgba(0,0,0,0.85)]'
                              : 'border-white/20 shadow-[0_14px_35px_rgba(0,0,0,0.65)]'
                          }`}
                        >
                          <img
                            ref={(el) => {
                              artRefs.current[idx] = el;
                            }}
                            src={item.coverImage}
                            alt={item.title}
                            draggable={false}
                            className="w-full h-full object-cover will-change-transform pointer-events-none"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent pointer-events-none" />

                          {/* Subtle card title badge inside poster for quick scanning */}
                          <div
                            className="absolute inset-x-0 bottom-0 p-3 text-right pointer-events-none"
                            dir="rtl"
                          >
                            <div className="text-[10px] text-white/75 font-semibold truncate">
                              {item.categoryLabel} · ★ {item.rating}
                            </div>
                            <div className="text-xs sm:text-sm font-black text-white line-clamp-1">
                              {item.title}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Left/Right Desktop Floating Arrow Controls */}
              {filteredItems.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToIndex(activeIndex - 1);
                    }}
                    disabled={activeIndex <= 0}
                    className="hidden sm:flex absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/50 hover:bg-white/20 disabled:opacity-25 border border-white/20 backdrop-blur-md text-white items-center justify-center cursor-pointer disabled:cursor-default transition-colors"
                    aria-label="العمل السابق"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToIndex(activeIndex + 1);
                    }}
                    disabled={activeIndex >= filteredItems.length - 1}
                    className="hidden sm:flex absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/50 hover:bg-white/20 disabled:opacity-25 border border-white/20 backdrop-blur-md text-white items-center justify-center cursor-pointer disabled:cursor-default transition-colors"
                    aria-label="العمل التالي"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            {/* Bottom Active Item Spotlight Info, Actions & Position Scrubber */}
            {activeItem && (
              <footer className="relative z-20 max-w-3xl w-full mx-auto px-4 sm:px-6 pb-5 pt-2 shrink-0 text-center space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-center gap-2 text-xs text-white/80 font-semibold flex-wrap">
                    <span className="text-violet-300 font-bold">{activeItem.categoryLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-300 font-bold tabular-nums">
                      ★ {activeItem.rating}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{activeItem.metaSummary}</span>
                  </div>

                  <h3 className="text-xl sm:text-3xl font-black text-white tracking-tight [text-wrap:balance] line-clamp-1">
                    {activeItem.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-white/70 max-w-xl mx-auto line-clamp-2 leading-relaxed">
                    {activeItem.synopsis}
                  </p>
                </div>

                {/* Primary CTA Row */}
                <div className="flex items-center justify-center gap-2.5 flex-wrap pt-1">
                  <button
                    type="button"
                    onClick={() => openItemPlayOrRead(activeItem)}
                    className="min-h-[44px] px-6 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-black text-xs sm:text-sm shadow-xl shadow-violet-950/60 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                  >
                    {activeItem.kind === 'comic' ? (
                      <>
                        <BookOpen className="w-4 h-4" />
                        <span>اقرأ الآن</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-white" />
                        <span>مشاهدة الآن</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => openItemDetails(activeItem)}
                    className="min-h-[44px] px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 backdrop-blur-md text-white font-bold text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Info className="w-4 h-4 text-violet-200" />
                    <span>{activeItem.kind === 'comic' ? 'الفصول والتفاصيل' : 'التفاصيل والمواسم'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleFavorite(activeItem.id)}
                    className={`min-h-[44px] min-w-[44px] w-11 h-11 rounded-full border backdrop-blur-md flex items-center justify-center cursor-pointer transition-colors ${
                      activeFav
                        ? 'bg-rose-500/30 border-rose-300/80 text-rose-100'
                        : 'bg-white/10 hover:bg-white/20 border-white/25 text-white'
                    }`}
                    aria-label={activeFav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                    title={activeFav ? 'في قائمتك' : 'أضف لقائمتي'}
                  >
                    {activeFav ? (
                      <Heart className="w-4 h-4 fill-rose-400 text-rose-400" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Mobile Arrows + Interactive Progress Dots */}
                {filteredItems.length > 1 && (
                  <div className="flex items-center justify-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => goToIndex(activeIndex - 1)}
                      disabled={activeIndex <= 0}
                      className="sm:hidden min-h-[40px] min-w-[40px] rounded-full bg-white/10 disabled:opacity-25 border border-white/20 flex items-center justify-center cursor-pointer"
                      aria-label="العمل السابق"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-1.5 overflow-x-auto max-w-[220px] sm:max-w-md py-1 px-2">
                      {filteredItems.map((item, idx) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => goToIndex(idx)}
                          aria-label={item.title}
                          className={`h-2 rounded-full transition-all cursor-pointer shrink-0 ${
                            idx === activeIndex
                              ? 'w-7 bg-violet-400'
                              : 'w-2 bg-white/25 hover:bg-white/50'
                          }`}
                        />
                      ))}
                    </div>

                    <span className="text-[11px] font-mono text-white/65 tabular-nums">
                      {activeIndex + 1} / {filteredItems.length}
                    </span>

                    <button
                      type="button"
                      onClick={() => goToIndex(activeIndex + 1)}
                      disabled={activeIndex >= filteredItems.length - 1}
                      className="sm:hidden min-h-[40px] min-w-[40px] rounded-full bg-white/10 disabled:opacity-25 border border-white/20 flex items-center justify-center cursor-pointer"
                      aria-label="العمل التالي"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </footer>
            )}
          </div>,
          document.body
        )}
    </>
  );
};
