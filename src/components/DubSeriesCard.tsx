import React, { useState, useEffect } from 'react';
import { Play, Tv, Star, Mic, Layers, ChevronLeft } from 'lucide-react';
import { DubSeries, DubEpisode } from '../data/mockData.ts';
import { getCustomEpisodeSource, SOURCES_UPDATED_EVENT } from '../utils/videoSource';

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

  useEffect(() => {
    const onUpdate = () => setVersionTick((v) => v + 1);
    window.addEventListener(SOURCES_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(SOURCES_UPDATED_EVENT, onUpdate);
  }, []);

  const seriesEpisodes =
    series.episodes && series.episodes.length > 0
      ? series.episodes
      : (series.seasons[0]?.episodes || []);
  const firstPlayableEpisode =
    seriesEpisodes.find(
      (e) => !e.isComingSoon || Boolean(getCustomEpisodeSource(e.id)?.driveLink)
    ) || seriesEpisodes[0];

  return (
    <div className="group relative bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden hover:border-neutral-700 transition-all duration-300 flex flex-col shadow-xl hover:shadow-2xl hover:shadow-rose-950/20">
      {/* Poster Image Area */}
      <div
        onClick={() => onSelectSeries(series)}
        className="relative aspect-[16/10] sm:aspect-video w-full overflow-hidden bg-neutral-950 cursor-pointer"
      >
        <img
          src={series.bannerImage || series.coverImage}
          alt={series.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          referrerPolicy="no-referrer"
        />

        {/* Gradient Scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/30 to-transparent" />

        {/* Top Badges */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <span className="bg-rose-950/90 border border-rose-500/40 text-rose-300 text-[11px] font-mono px-2.5 py-0.5 rounded-full font-bold backdrop-blur">
            {series.genres[0]}
          </span>
        </div>

        <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/70 backdrop-blur px-2 py-0.5 rounded-full text-amber-400 text-xs font-mono font-bold border border-white/10">
          <Star className="w-3 h-3 fill-amber-400" />
          <span>{series.rating}</span>
        </div>

        {/* Floating Season Count Badge */}
        <div className="absolute bottom-3 right-3 bg-black/85 backdrop-blur px-2.5 py-1 rounded-xl text-neutral-300 text-xs flex items-center gap-1.5 border border-white/10">
          <Layers className="w-3.5 h-3.5 text-rose-500" />
          <span className="font-bold">
            {series.seasons.length} {series.seasons.length === 1 ? 'موسم' : 'مواسم'}
          </span>
          <span className="text-neutral-500">·</span>
          <span className="font-mono text-neutral-400">{series.episodesCount} حلقات</span>
        </div>

        {/* Center Hover Play Icon */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
          <div className="w-12 h-12 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-2xl scale-90 group-hover:scale-100 transition-transform">
            <Play className="w-6 h-6 fill-white translate-x-0.5" />
          </div>
        </div>
      </div>

      {/* Info Body */}
      <div className="p-5 flex-1 flex flex-col justify-between text-right">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-rose-500 font-bold mb-1">
            <Mic className="w-3.5 h-3.5" />
            <span className="truncate">{series.dubStudio}</span>
          </div>

          <h3
            onClick={() => onSelectSeries(series)}
            className="text-lg font-black text-white hover:text-rose-400 transition-colors cursor-pointer line-clamp-1 mb-1"
          >
            {series.title}
          </h3>

          <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed mb-4">
            {series.synopsis}
          </p>
        </div>

        {/* Actions Row: Select Season or Quick Play */}
        <div className="pt-3 border-t border-neutral-800 flex items-center gap-2">
          <button
            onClick={() => onSelectSeries(series)}
            className="flex-1 py-2 px-3 bg-neutral-800 hover:bg-neutral-750 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Tv className="w-3.5 h-3.5 text-rose-500" />
            <span>عرض المواسم والحلقات</span>
            <ChevronLeft className="w-3 h-3 text-neutral-400" />
          </button>

          {firstPlayableEpisode && !firstPlayableEpisode.isComingSoon && (
            <button
              onClick={() => onQuickPlay(firstPlayableEpisode, series)}
              className="py-2 px-3 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl flex items-center gap-1 transition-colors cursor-pointer shadow-md shadow-rose-950"
              title="مشاهدة الحلقة الأولى الآن"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>الحلقة 1</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
