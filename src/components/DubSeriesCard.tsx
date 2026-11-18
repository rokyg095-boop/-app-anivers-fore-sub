import React, { useState, useEffect } from 'react';
import { Play, Heart, Plus, ChevronLeft } from 'lucide-react';
import { DubSeries, DubEpisode } from '../data/mockData.ts';
import { getCustomEpisodeSource, SOURCES_UPDATED_EVENT } from '../utils/videoSource';
import { useFavorites } from '../utils/favorites';

interface DubSeriesCardProps {
  series: DubSeries;
  onSelectSeries: (series: DubSeries) => void;
  onQuickPlay: (episode: DubEpisode, series: DubSeries) => void;
}

export const DubSeriesCard: React.FC<DubSeriesCardProps> = ({
  series,
  onSelectSeries,
  onQuickPlay,
}) => {
  const [, setVersionTick] = useState(0);
  const { isFavorite, toggleFavorite } = useFavorites();

  useEffect(() => {
    const onUpdate = () => setVersionTick((v) => v + 1);
    window.addEventListener(SOURCES_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(SOURCES_UPDATED_EVENT, onUpdate);
  }, []);

  const seriesEpisodes =
    series.episodes && series.episodes.length > 0
      ? series.episodes
      : series.seasons[0]?.episodes || [];
  const firstPlayableEpisode =
    seriesEpisodes.find(
      (e) =>
        !e.isComingSoon ||
        Boolean(getCustomEpisodeSource(e.id)?.driveLink || getCustomEpisodeSource(e.id)?.videoUrl)
    ) || seriesEpisodes[0];

  const hasQuickPlay =
    firstPlayableEpisode &&
    (!firstPlayableEpisode.isComingSoon ||
      Boolean(
        getCustomEpisodeSource(firstPlayableEpisode.id)?.driveLink ||
          getCustomEpisodeSource(firstPlayableEpisode.id)?.videoUrl
      ));

  const favorited = isFavorite(series.id);

  return (
    <div className="group relative bg-white/[0.03] border border-white/10 hover:border-violet-400/50 rounded-2xl overflow-hidden transition-all duration-300 flex flex-col shadow-xl">
      {/* Vertical Cinema Poster Area */}
      <div
        onClick={() => onSelectSeries(series)}
        className="relative aspect-[2/3] w-full overflow-hidden bg-neutral-950 cursor-pointer"
      >
        <img
          src={series.coverImage || series.bannerImage}
          alt={series.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          referrerPolicy="no-referrer"
        />

        {/* Contrast Scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#060911] via-[#060911]/25 to-transparent" />

        {/* Favorite Quick Toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(series.id);
          }}
          aria-label={favorited ? 'إزالة من المفضلة' : 'أضف إلى المفضلة'}
          className={`absolute top-3 left-3 w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center transition-all cursor-pointer ${
            favorited
              ? 'bg-rose-500/80 border-rose-300 text-white'
              : 'bg-black/50 border-white/25 text-white/85 hover:bg-white/20'
          }`}
        >
          {favorited ? (
            <Heart className="w-4 h-4 fill-white" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
        </button>

        {/* Center Hover Play Affordance */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/25">
          <div className="w-12 h-12 rounded-full bg-white/20 border border-white/50 backdrop-blur-md text-white flex items-center justify-center shadow-2xl scale-90 group-hover:scale-100 transition-transform">
            <Play className="w-5 h-5 fill-white translate-x-[1px]" />
          </div>
        </div>

        {/* Clean Unboxed Bottom Overlay Metadata */}
        <div className="absolute inset-x-0 bottom-0 p-3.5 text-right space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] text-white/75 tabular-nums">
            <span className="text-amber-300 font-bold">★ {series.rating}</span>
            <span aria-hidden="true">·</span>
            <span>
              {series.seasons.length}{' '}
              {series.seasons.length === 1 ? 'موسم' : 'مواسم'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{series.episodesCount} حلقة</span>
          </div>
          <h3 className="text-sm sm:text-base font-black text-white group-hover:text-violet-200 transition-colors line-clamp-1">
            {series.title}
          </h3>
        </div>
      </div>

      {/* Minimalist Info & Action Footer */}
      <div className="p-3.5 flex-1 flex flex-col justify-between text-right gap-3 bg-[#090d18]/90">
        <p className="text-xs text-white/60 line-clamp-2 leading-relaxed">
          {series.synopsis}
        </p>

        <div className="pt-2.5 border-t border-white/10 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectSeries(series)}
            className="flex-1 min-h-[38px] py-1.5 px-3 bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 text-white text-xs font-bold rounded-full flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
          >
            <span>التفاصيل والمواسم</span>
            <ChevronLeft className="w-3.5 h-3.5 text-white/60" />
          </button>

          {hasQuickPlay && firstPlayableEpisode && (
            <button
              type="button"
              onClick={() => onQuickPlay(firstPlayableEpisode, series)}
              className="min-h-[38px] py-1.5 px-3.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-full flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shadow-md shadow-violet-950/50"
              title="تشغيل الحلقة الأولى"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>تشغيل</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
