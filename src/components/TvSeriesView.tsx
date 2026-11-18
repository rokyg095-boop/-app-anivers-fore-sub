import React, { useState, useEffect } from 'react';
import {
  Clapperboard,
  Play,
  Clock,
  Layers,
  ChevronLeft,
  Search,
  Star,
  CheckCircle2,
  ShieldCheck,
  Plus,
  MonitorPlay,
} from 'lucide-react';
import { DubSeries, DubEpisode } from '../data/mockData';
import { getCustomEpisodeSource, SOURCES_UPDATED_EVENT } from '../utils/videoSource';
import { CUSTOM_WORKS_UPDATED_EVENT } from '../utils/customWorks';
import {
  CATALOG_OVERRIDES_UPDATED_EVENT,
  getEffectiveWorksByCategory,
} from '../utils/catalogOverrides';

interface TvSeriesViewProps {
  onSelectSeries: (series: DubSeries) => void;
  onPlayEpisode: (episode: DubEpisode, series: DubSeries) => void;
  onOpenAdmin: () => void;
  isOwnerAdmin?: boolean;
  onOpenCreateWork?: () => void;
}

export const TvSeriesView: React.FC<TvSeriesViewProps> = ({
  onSelectSeries,
  onPlayEpisode,
  onOpenAdmin,
  isOwnerAdmin = false,
  onOpenCreateWork,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>('');
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState<number>(0);
  const [, setVersionTick] = useState<number>(0);

  useEffect(() => {
    const onUpdate = () => setVersionTick((v) => v + 1);
    window.addEventListener(SOURCES_UPDATED_EVENT, onUpdate);
    window.addEventListener(CUSTOM_WORKS_UPDATED_EVENT, onUpdate);
    window.addEventListener(CATALOG_OVERRIDES_UPDATED_EVENT, onUpdate);
    return () => {
      window.removeEventListener(SOURCES_UPDATED_EVENT, onUpdate);
      window.removeEventListener(CUSTOM_WORKS_UPDATED_EVENT, onUpdate);
      window.removeEventListener(CATALOG_OVERRIDES_UPDATED_EVENT, onUpdate);
    };
  }, []);

  const allTvWorks = getEffectiveWorksByCategory('tv');

  if (allTvWorks.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8" dir="rtl">
        {/* Section Header */}
        <div className="border-b border-neutral-800 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-sky-400 tracking-wider mb-1">
              <MonitorPlay className="w-4 h-4" />
              <span>قسم المسلسلات التلفزيونية العالمية والمترجمة</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-white mt-1">
              المسلسلات التلفزيونية
            </h1>
            <p className="text-sm text-neutral-400 mt-2 max-w-2xl leading-relaxed">
              قسم مخصص للمسلسلات التلفزيونية والدرامية والملحمية مثل صراع العروش (Game of Thrones) وغيرها، مرتباً حسب المواسم والحلقات.
            </p>
          </div>
        </div>

        {/* Clean Empty Showcase */}
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-8 sm:p-14 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center mx-auto text-sky-400">
            <Clapperboard className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">
            قسم المسلسلات التلفزيونية جاهز لإضافة الأعمال
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 max-w-lg mx-auto leading-relaxed">
            لم تُضف مسلسلات تلفزيونية بعد. ستظهر هنا جميع المسلسلات والمواسم والحلقات فور إضافتها ونشرها.
          </p>

          {isOwnerAdmin && (
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              {onOpenCreateWork && (
                <button
                  onClick={onOpenCreateWork}
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-black inline-flex items-center gap-2 cursor-pointer shadow-lg shadow-sky-950/50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة مسلسل تلفزيوني جديد</span>
                </button>
              )}
              <button
                onClick={onOpenAdmin}
                className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer border border-neutral-700 transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                <span>فتح لوحة المشرف</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const activeSeries =
    allTvWorks.find((s) => s.id === selectedSeriesId) || allTvWorks[0];

  const currentSeason =
    activeSeries.seasons && activeSeries.seasons.length > 0
      ? activeSeries.seasons[Math.min(selectedSeasonIdx, activeSeries.seasons.length - 1)]
      : null;

  const displayedEpisodes = currentSeason?.episodes || activeSeries.episodes || [];

  const firstPlayableEpisode =
    displayedEpisodes.find(
      (e) => !e.isComingSoon || Boolean(getCustomEpisodeSource(e.id)?.driveLink)
    ) || displayedEpisodes[0];

  const availableGenres = Array.from(
    new Set(allTvWorks.flatMap((w) => w.genres || []).filter(Boolean))
  );

  const filteredSeries = allTvWorks.filter((series) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      series.title.toLowerCase().includes(q) ||
      series.originalTitle.toLowerCase().includes(q) ||
      series.genres.some((g) => g.toLowerCase().includes(q));
    const matchesGenre =
      selectedGenre === 'all' || series.genres.some((g) => g.includes(selectedGenre));
    return matchesSearch && matchesGenre;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12" dir="rtl">
      {/* Section Header */}
      <div className="border-b border-neutral-800 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-sky-400 tracking-wider mb-1">
            <MonitorPlay className="w-4 h-4" />
            <span>المسلسلات التلفزيونية العالمية</span>
            <span aria-hidden="true">·</span>
            <span className="text-neutral-400 font-mono tabular-nums">
              {allTvWorks.length} {allTvWorks.length === 1 ? 'مسلسل' : 'مسلسلات'}
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white mt-1">
            المسلسلات التلفزيونية
          </h1>
          <p className="text-sm text-neutral-400 mt-2 max-w-2xl leading-relaxed">
            تصفح أقوى المسلسلات التلفزيونية والدرامية بكامل مواسمها وحلقاتها، مع دعم المشاهدة الفورية والبحث بالتصنيفات.
          </p>
        </div>

        {/* Search & Admin Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-neutral-500 absolute top-1/2 right-3 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ابحث في المسلسلات التلفزيونية..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 text-white text-xs rounded-xl py-2.5 pr-9 pl-3 focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>

          {isOwnerAdmin && (
            <button
              onClick={onOpenAdmin}
              className="px-3.5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <span>إدارة المسلسلات التلفزيونية</span>
            </button>
          )}
        </div>
      </div>

      {/* Genre Filters */}
      {availableGenres.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedGenre('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              selectedGenre === 'all'
                ? 'bg-sky-600 text-white shadow'
                : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
            }`}
          >
            جميع التصنيفات
          </button>
          {availableGenres.map((genre) => (
            <button
              key={genre}
              onClick={() => setSelectedGenre(genre)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                selectedGenre === genre
                  ? 'bg-sky-600 text-white shadow'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      )}

      {/* Quick Series Switcher */}
      {allTvWorks.length > 1 && (
        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          {allTvWorks.map((series) => {
            const isSelected = activeSeries.id === series.id;
            return (
              <button
                key={series.id}
                onClick={() => {
                  setSelectedSeriesId(series.id);
                  setSelectedSeasonIdx(0);
                }}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
                  isSelected
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-950/40 border border-sky-500 font-black'
                    : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800 border border-neutral-800'
                }`}
              >
                <MonitorPlay className="w-4 h-4" />
                <span>{series.title}</span>
                <span className="text-[11px] font-mono opacity-80 tabular-nums">
                  {series.episodesCount} حلقة
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Featured TV Series Showcase */}
      <div className="relative rounded-3xl overflow-hidden border border-sky-500/35 bg-gradient-to-br from-neutral-900 via-neutral-900 to-sky-950/30 p-6 sm:p-10 shadow-2xl">
        <div className="relative z-10 flex flex-col lg:flex-row items-center lg:items-start gap-8">
          <div
            onClick={() => onSelectSeries(activeSeries)}
            className="w-48 sm:w-64 aspect-[2/3] rounded-2xl overflow-hidden shrink-0 shadow-2xl border border-sky-500/40 cursor-pointer group bg-neutral-950 relative"
          >
            <img
              src={activeSeries.coverImage}
              alt={activeSeries.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-transparent to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
              <div className="w-14 h-14 rounded-full bg-sky-600/90 text-white flex items-center justify-center shadow-2xl">
                <Play className="w-7 h-7 fill-white translate-x-0.5" />
              </div>
            </div>
          </div>

          <div className="flex-1 text-right flex flex-col justify-between h-full space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400 mb-2">
                <span className="font-bold text-sky-400">{activeSeries.genres[0]}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-amber-400 flex items-center gap-1 tabular-nums">
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                  <span>{activeSeries.rating}</span>
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {activeSeries.seasons.length} {activeSeries.seasons.length === 1 ? 'موسم' : 'مواسم'} · {activeSeries.episodesCount} حلقة
                </span>
                <span aria-hidden="true">·</span>
                <span>{activeSeries.dubStudio}</span>
              </div>

              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight mb-1">
                {activeSeries.title}
              </h2>
              {activeSeries.originalTitle &&
                activeSeries.originalTitle.trim() !== activeSeries.title.trim() && (
                  <p className="text-xs sm:text-sm font-mono text-sky-400/90 mb-3" dir="ltr">
                    {activeSeries.originalTitle}
                  </p>
                )}

              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed max-w-3xl mb-4">
                {activeSeries.synopsis}
              </p>

              <div className="text-xs text-neutral-400">
                <span className="font-bold text-white ml-1.5">التصنيفات:</span>
                <span>{activeSeries.genres.join(' · ')}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-800/80 flex flex-wrap items-center gap-3">
              {firstPlayableEpisode && (
                <button
                  onClick={() => onPlayEpisode(firstPlayableEpisode, activeSeries)}
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-sky-950 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>مشاهدة الحلقة الأولى الآن</span>
                </button>
              )}

              <button
                onClick={() => onSelectSeries(activeSeries)}
                className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs sm:text-sm rounded-xl border border-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Layers className="w-4 h-4 text-sky-400" />
                <span>عرض المواسم والحلقات ({activeSeries.episodesCount})</span>
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
              <Layers className="w-5 h-5 text-sky-400" />
              <span>
                حلقات {activeSeries.title} {currentSeason ? `- ${currentSeason.title}` : ''}
              </span>
            </h3>
          </div>
          <span className="text-xs font-mono text-neutral-400 tabular-nums">
            {displayedEpisodes.length} حلقة معروضة
          </span>
        </div>

        {activeSeries.seasons && activeSeries.seasons.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {activeSeries.seasons.map((season, sIdx) => {
              const isSeasonActive = selectedSeasonIdx === sIdx;
              return (
                <button
                  key={season.id}
                  onClick={() => setSelectedSeasonIdx(sIdx)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    isSeasonActive
                      ? 'bg-sky-600 text-white border border-sky-500 shadow'
                      : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800 border border-neutral-800'
                  }`}
                >
                  <span>الموسم {season.seasonNumber}</span>
                  <span className="text-[11px] opacity-75 font-mono tabular-nums">
                    ({season.episodesCount})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {displayedEpisodes.map((ep) => {
            const custom = getCustomEpisodeSource(ep.id);
            const hasDrive = Boolean(custom?.driveLink);

            return (
              <div
                key={ep.id}
                onClick={() => onPlayEpisode(ep, activeSeries)}
                className="group relative bg-neutral-900 border border-neutral-800 hover:border-sky-500/50 rounded-2xl p-3 flex flex-col justify-between transition-all duration-300 hover:shadow-xl cursor-pointer"
              >
                <div>
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-neutral-950 mb-2.5">
                    <img
                      src={ep.thumbnail || activeSeries.coverImage}
                      alt={ep.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute top-2 right-2 bg-sky-600/90 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded-md tabular-nums">
                      الحلقة {ep.episodeNumber}
                    </div>
                    <div className="absolute bottom-2 left-2 text-[10px] font-mono text-neutral-300 bg-black/70 px-1.5 py-0.5 rounded tabular-nums">
                      {ep.duration}
                    </div>
                  </div>

                  <h4 className="text-sm font-bold text-white group-hover:text-sky-400 transition-colors line-clamp-1 mb-1">
                    {ep.title}
                  </h4>
                  <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed mb-3">
                    {ep.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-neutral-800 flex items-center justify-between text-[11px]">
                  {hasDrive ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1 font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>متوفر عبر Drive</span>
                    </span>
                  ) : (
                    <span className="text-amber-400/90 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>جاهز للربط</span>
                    </span>
                  )}

                  <span className="text-sky-400 font-bold group-hover:underline flex items-center gap-0.5">
                    <span>تشغيل</span>
                    <ChevronLeft className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Catalog Grid */}
      <div className="space-y-6 pt-6 border-t border-neutral-800">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <MonitorPlay className="w-5 h-5 text-sky-400" />
            <span>قائمة المسلسلات التلفزيونية</span>
          </h3>
          <span className="text-xs font-mono text-neutral-400 tabular-nums">
            {filteredSeries.length} أعمال
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {filteredSeries.map((series) => {
            const isCurrentlySelected = activeSeries.id === series.id;
            return (
              <div
                key={series.id}
                onClick={() => {
                  setSelectedSeriesId(series.id);
                  setSelectedSeasonIdx(0);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`group relative bg-neutral-900 border rounded-3xl overflow-hidden p-4 flex flex-col justify-between transition-all duration-300 hover:shadow-2xl cursor-pointer ${
                  isCurrentlySelected
                    ? 'border-sky-500 ring-1 ring-sky-500/40'
                    : 'border-neutral-800 hover:border-sky-500/50'
                }`}
              >
                <div>
                  <div className="relative aspect-[16/10] rounded-2xl overflow-hidden bg-neutral-950 mb-3">
                    <img
                      src={series.coverImage}
                      alt={series.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent" />
                    <div className="absolute bottom-2.5 right-3 text-[11px] font-mono text-neutral-200 flex items-center gap-2">
                      <span>{series.seasons.length} مواسم</span>
                      <span aria-hidden="true">·</span>
                      <span>{series.episodesCount} حلقة</span>
                    </div>
                  </div>

                  <h4 className="text-lg font-black text-white group-hover:text-sky-400 transition-colors line-clamp-1 mb-1">
                    {series.title}
                  </h4>
                  <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed mb-4">
                    {series.synopsis}
                  </p>
                </div>

                <div className="pt-3 border-t border-neutral-800 flex items-center justify-between text-xs">
                  <span className="text-neutral-400 font-mono text-[11px] truncate">
                    {series.genres.slice(0, 2).join(' · ')}
                  </span>
                  <span className="text-sky-400 font-bold flex items-center gap-1 group-hover:underline shrink-0">
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
