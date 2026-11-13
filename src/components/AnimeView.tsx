import React, { useState, useEffect } from 'react';
import {
  Tv,
  Sparkles,
  Play,
  Clock,
  Layers,
  ChevronLeft,
  Search,
  Star,
  CheckCircle2,
  ShieldCheck,
  Flame,
  Film,
  Plus
} from 'lucide-react';
import { ANIME_WORKS, DubSeries, DubEpisode } from '../data/mockData';
import { getCustomEpisodeSource, SOURCES_UPDATED_EVENT } from '../utils/videoSource';
import { getCustomSeriesByCategory, CUSTOM_WORKS_UPDATED_EVENT } from '../utils/customWorks';

interface AnimeViewProps {
  onSelectSeries: (series: DubSeries) => void;
  onPlayEpisode: (episode: DubEpisode, series: DubSeries) => void;
  onOpenAdmin: () => void;
  isOwnerAdmin?: boolean;
  onOpenCreateWork?: () => void;
}

export const AnimeView: React.FC<AnimeViewProps> = ({
  onSelectSeries,
  onPlayEpisode,
  onOpenAdmin,
  isOwnerAdmin = false,
  onOpenCreateWork,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [selectedAnimeId, setSelectedAnimeId] = useState<string>(ANIME_WORKS[0]?.id || '');
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState<number>(0);
  const [, setVersionTick] = useState<number>(0);

  useEffect(() => {
    const onUpdate = () => setVersionTick((v) => v + 1);
    window.addEventListener(SOURCES_UPDATED_EVENT, onUpdate);
    window.addEventListener(CUSTOM_WORKS_UPDATED_EVENT, onUpdate);
    return () => {
      window.removeEventListener(SOURCES_UPDATED_EVENT, onUpdate);
      window.removeEventListener(CUSTOM_WORKS_UPDATED_EVENT, onUpdate);
    };
  }, []);

  const allAnimeWorks = [...ANIME_WORKS, ...getCustomSeriesByCategory('anime')];

  // Active highlighted anime
  const activeAnime =
    allAnimeWorks.find((a) => a.id === selectedAnimeId) || allAnimeWorks[0];

  const currentSeason =
    activeAnime.seasons && activeAnime.seasons.length > 0
      ? activeAnime.seasons[Math.min(selectedSeasonIdx, activeAnime.seasons.length - 1)]
      : null;

  const displayedEpisodes = currentSeason?.episodes || activeAnime.episodes || [];

  const firstPlayableEpisode =
    displayedEpisodes.find((e) => !e.isComingSoon || Boolean(getCustomEpisodeSource(e.id)?.driveLink)) ||
    displayedEpisodes[0];

  // Filtering for Catalog
  const filteredAnime = allAnimeWorks.filter((anime) => {
    const matchesSearch =
      anime.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      anime.originalTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      anime.genres.some((g) => g.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesGenre =
      selectedGenre === 'all' || anime.genres.some((g) => g.includes(selectedGenre));
    return matchesSearch && matchesGenre;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12" dir="rtl">
      {/* Anime Section Header Banner */}
      <div className="border-b border-neutral-800 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-rose-500 font-mono tracking-wider mb-1">
            <Tv className="w-4 h-4" />
            <span>قسم الأنمي الياباني المترجم والمدبلج</span>
            <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px]">
              {allAnimeWorks.length} أعمال متاحة
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white mt-1">
            عالم الأنمي (AniVerse Anime)
          </h1>
          <p className="text-sm text-neutral-400 mt-2 max-w-2xl leading-relaxed">
            استمتع بأروع مسلسلات الأنمي الكلاسيكية والحديثة بأعلى دقة أصلية، مع إمكانية ربط كل حلقة مباشرة بروابط التخزين السحابي (Google Drive) ودعم المشاهدة السلسة.
          </p>
        </div>

        {/* Search & Action Box */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-neutral-500 absolute top-1/2 right-3 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ابحث عن أنمي..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 text-white text-xs rounded-xl py-2.5 pr-9 pl-3 focus:outline-none focus:border-rose-500 transition-colors"
            />
          </div>

          {isOwnerAdmin && onOpenCreateWork && (
            <button
              onClick={onOpenCreateWork}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-rose-950/60"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة أنمي جديد (للمالك)</span>
            </button>
          )}

          <button
            onClick={onOpenAdmin}
            className="px-3.5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            title="إدارة روابط درايف للأنمي"
          >
            <ShieldCheck className="w-4 h-4 text-rose-500" />
            <span>إدارة روابط الأنمي (المشرف)</span>
          </button>
        </div>
      </div>

      {/* Anime Quick Switcher Bar */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        {allAnimeWorks.map((anime) => {
          const isSelected = activeAnime.id === anime.id;
          return (
            <button
              key={anime.id}
              onClick={() => {
                setSelectedAnimeId(anime.id);
                setSelectedSeasonIdx(0);
              }}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
                isSelected
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/40 border border-rose-500 font-black'
                  : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800 border border-neutral-800'
              }`}
            >
              <Tv className="w-4 h-4" />
              <span>{anime.title}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/25">
                {anime.episodesCount} حلقة
              </span>
            </button>
          );
        })}
      </div>

      {/* Featured Anime Hero Showcase */}
      <div className="relative rounded-3xl overflow-hidden border-2 border-rose-500/40 bg-gradient-to-br from-neutral-900 via-neutral-900 to-rose-950/40 p-6 sm:p-10 shadow-2xl">
        {/* Ambient Backlight */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-center lg:items-start gap-8">
          {/* Poster Box */}
          <div
            onClick={() => onSelectSeries(activeAnime)}
            className="w-48 sm:w-64 aspect-[2/3] rounded-2xl overflow-hidden shrink-0 shadow-2xl border-2 border-rose-500/50 cursor-pointer group bg-neutral-950 relative"
          >
            <img
              src={activeAnime.coverImage}
              alt={activeAnime.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-transparent to-transparent" />

            <div className="absolute top-3 right-3 bg-rose-600 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded-full shadow flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>{activeAnime.id === 'naruto' ? 'الأنمي الأسطوري' : 'أنمي مميز'}</span>
            </div>

            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
              <div className="w-14 h-14 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-2xl">
                <Play className="w-7 h-7 fill-white translate-x-0.5" />
              </div>
            </div>
          </div>

          {/* Details & Info */}
          <div className="flex-1 text-right flex flex-col justify-between h-full space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-rose-600 text-white">
                  {activeAnime.genres[0]}
                </span>
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-neutral-800 text-amber-400 border border-neutral-700 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                  <span>{activeAnime.rating}</span>
                </span>
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300">
                  {activeAnime.episodesCount} حلقة ({activeAnime.seasons.length} مواسم)
                </span>
                <span className="text-xs text-neutral-400 font-mono">
                  {activeAnime.dubStudio}
                </span>
              </div>

              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight mb-1">
                {activeAnime.title}
              </h2>
              <p className="text-xs sm:text-sm font-mono text-rose-400/90 mb-3" dir="ltr">
                {activeAnime.originalTitle}
              </p>

              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed max-w-3xl mb-4">
                {activeAnime.synopsis}
              </p>

              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                <span className="font-bold text-white">التصنيفات:</span>
                {activeAnime.genres.map((g, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-lg bg-neutral-800/80 text-neutral-300 border border-neutral-700 text-[11px]"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="pt-4 border-t border-neutral-800/80 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onPlayEpisode(firstPlayableEpisode, activeAnime)}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-rose-950 flex items-center gap-2 transition-all cursor-pointer hover:scale-105 active:scale-95"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>مشاهدة الحلقة الأولى الآن</span>
              </button>

              <button
                onClick={() => onSelectSeries(activeAnime)}
                className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-750 text-white font-bold text-xs sm:text-sm rounded-xl border border-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Layers className="w-4 h-4 text-rose-400" />
                <span>عرض المواسم والحلقات الـ {activeAnime.episodesCount} كاملة</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Episodes Navigation Grid with Season Switcher */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-neutral-800 pb-4 gap-3">
          <div>
            <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-rose-500" />
              <span>
                حلقات {activeAnime.title} {currentSeason ? `- ${currentSeason.title}` : ''}
              </span>
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              جميع الحلقات مجهزة وجاهزة للربط المباشر بروابط Google Drive أو المشاهدة السحابية الفورية.
            </p>
          </div>
          <span className="text-xs font-mono text-neutral-400">
            {displayedEpisodes.length} حلقة معروضة
          </span>
        </div>

        {/* Season Selector Tabs (if multiple seasons exist) */}
        {activeAnime.seasons && activeAnime.seasons.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {activeAnime.seasons.map((season, sIdx) => {
              const isSeasonActive = selectedSeasonIdx === sIdx;
              return (
                <button
                  key={season.id}
                  onClick={() => setSelectedSeasonIdx(sIdx)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    isSeasonActive
                      ? 'bg-rose-600 text-white border border-rose-500 shadow'
                      : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-850 border border-neutral-800'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5 text-rose-300" />
                  <span>الموسم {season.seasonNumber}</span>
                  <span className="text-[10px] opacity-75 font-mono">
                    ({season.episodesCount} حلقة)
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Episodes Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {displayedEpisodes.map((ep) => {
            const custom = getCustomEpisodeSource(ep.id);
            const hasDrive = Boolean(custom?.driveLink);

            return (
              <div
                key={ep.id}
                onClick={() => onPlayEpisode(ep, activeAnime)}
                className="group relative bg-neutral-900 border border-neutral-800 hover:border-rose-500/50 rounded-2xl p-3 flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:shadow-rose-950/20 cursor-pointer"
              >
                <div>
                  {/* Thumbnail Image */}
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-neutral-950 mb-2.5">
                    <img
                      src={ep.thumbnail || activeAnime.coverImage}
                      alt={ep.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                    <div className="absolute top-2 right-2 bg-rose-600/90 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded-md">
                      الحلقة {ep.episodeNumber}
                    </div>

                    <div className="absolute bottom-2 left-2 text-[10px] font-mono text-neutral-300 bg-black/70 px-1.5 py-0.5 rounded">
                      {ep.duration}
                    </div>

                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                      <div className="w-10 h-10 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg">
                        <Play className="w-5 h-5 fill-white translate-x-0.5" />
                      </div>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h4 className="text-sm font-bold text-white group-hover:text-rose-400 transition-colors line-clamp-1 mb-1">
                    {ep.title}
                  </h4>
                  <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed mb-3">
                    {ep.description}
                  </p>
                </div>

                {/* Footer Tag */}
                <div className="pt-2 border-t border-neutral-800 flex items-center justify-between text-[11px]">
                  {hasDrive ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1 font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>متوفر عبر Drive</span>
                    </span>
                  ) : (
                    <span className="text-amber-400/90 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>جاهز للربط الفوري</span>
                    </span>
                  )}

                  <span className="text-rose-400 font-bold group-hover:underline flex items-center gap-0.5">
                    <span>تشغيل</span>
                    <ChevronLeft className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Anime Catalog Grid */}
      <div className="space-y-6 pt-6 border-t border-neutral-800">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <Tv className="w-5 h-5 text-rose-500" />
            <span>كتالوج مسلسلات الأنمي الكامل</span>
          </h3>
          <span className="text-xs font-mono text-neutral-400">
            {filteredAnime.length} أعمال
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {filteredAnime.map((anime) => {
            const ep = anime.episodes[0] || anime.seasons[0]?.episodes[0];
            const isCurrentlySelected = activeAnime.id === anime.id;

            return (
              <div
                key={anime.id}
                onClick={() => {
                  setSelectedAnimeId(anime.id);
                  setSelectedSeasonIdx(0);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`group relative bg-neutral-900 border rounded-3xl overflow-hidden p-4 flex flex-col justify-between transition-all duration-300 hover:shadow-2xl cursor-pointer ${
                  isCurrentlySelected
                    ? 'border-rose-500 ring-1 ring-rose-500/50 shadow-rose-950/30'
                    : 'border-neutral-800 hover:border-rose-500/50'
                }`}
              >
                <div>
                  <div className="relative aspect-[16/10] rounded-2xl overflow-hidden bg-neutral-950 mb-3">
                    <img
                      src={anime.coverImage}
                      alt={anime.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent" />

                    <div className="absolute top-3 right-3 bg-rose-600 text-white font-mono text-[10px] font-black px-2 py-0.5 rounded-full">
                      {anime.episodesCount} حلقة
                    </div>

                    <div className="absolute top-3 left-3 bg-neutral-900/90 text-amber-400 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Star className="w-3 h-3 fill-amber-400" />
                      <span>{anime.rating}</span>
                    </div>

                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                      <div className="w-12 h-12 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-xl">
                        <Play className="w-6 h-6 fill-white translate-x-0.5" />
                      </div>
                    </div>
                  </div>

                  <h4 className="text-lg font-black text-white group-hover:text-rose-400 transition-colors line-clamp-1 mb-1">
                    {anime.title}
                  </h4>
                  <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed mb-4">
                    {anime.synopsis}
                  </p>
                </div>

                <div className="pt-3 border-t border-neutral-800 flex items-center justify-between text-xs">
                  <span className="text-neutral-400 font-mono text-[11px]">
                    {anime.dubStudio.split('/')[0].trim()}
                  </span>
                  <span className="text-rose-400 font-bold flex items-center gap-1 group-hover:underline">
                    <span>تصفح الحلقات</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
