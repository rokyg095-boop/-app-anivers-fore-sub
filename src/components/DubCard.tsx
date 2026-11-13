import React, { useState, useEffect } from 'react';
import { Play, Mic, Clock, Lock, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { DubEpisode, DubSeries } from '../data/mockData.ts';
import { getCustomEpisodeSource, SOURCES_UPDATED_EVENT } from '../utils/videoSource';

interface DubCardProps {
  episode: DubEpisode;
  series: DubSeries;
  onPlay: (episode: DubEpisode, series: DubSeries) => void;
  onSelectSeries?: (series: DubSeries) => void;
}

export const DubCard: React.FC<DubCardProps> = ({ episode, series, onPlay, onSelectSeries }) => {
  const [, setVersionTick] = useState(0);

  useEffect(() => {
    const onUpdate = () => setVersionTick((v) => v + 1);
    window.addEventListener(SOURCES_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(SOURCES_UPDATED_EVENT, onUpdate);
  }, []);

  const customSource = getCustomEpisodeSource(episode.id);
  const hasSavedDriveLink = Boolean(customSource?.driveLink || customSource?.videoUrl);
  const isComingSoon = episode.isComingSoon && !hasSavedDriveLink;

  const handleClick = () => {
    if (isComingSoon) {
      if (onSelectSeries) {
        onSelectSeries(series);
      }
      return;
    }
    onPlay(episode, series);
  };

  return (
    <div
      onClick={handleClick}
      className={`group relative rounded-2xl overflow-hidden transition-all duration-300 flex flex-col shadow-lg cursor-pointer ${
        isComingSoon
          ? 'bg-neutral-900/60 border border-neutral-800 hover:border-amber-500/40 opacity-80 hover:opacity-100'
          : 'bg-neutral-900 border border-neutral-800 hover:border-neutral-700 hover:shadow-2xl hover:shadow-rose-950/20'
      }`}
    >
      {/* Video Thumbnail Area */}
      <div className="relative aspect-video w-full overflow-hidden bg-neutral-950">
        <img
          src={episode.thumbnail}
          alt={episode.title}
          className={`w-full h-full object-cover transition-transform duration-500 ${
            isComingSoon ? 'grayscale' : 'group-hover:scale-105'
          }`}
          loading="lazy"
          referrerPolicy="no-referrer"
        />

        {/* Gradient Scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/30 to-transparent" />

        {/* Duration / Coming Soon Tag */}
        <div className="absolute bottom-2 left-2 bg-black/85 text-white font-mono text-[11px] px-2 py-0.5 rounded backdrop-blur border border-white/10">
          {episode.duration}
        </div>

        {/* Episode Number & Status Badge */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          <div
            className={`text-[11px] font-mono px-2 py-0.5 rounded font-bold backdrop-blur border ${
              isComingSoon
                ? 'bg-amber-950/90 border-amber-500/40 text-amber-300'
                : 'bg-rose-950/90 border-rose-500/40 text-rose-300'
            }`}
          >
            الحلقة {episode.episodeNumber}
          </div>
          {isComingSoon && (
            <div className="bg-amber-500 text-neutral-950 text-[10px] font-bold px-1.5 py-0.5 rounded">
              قريباً
            </div>
          )}
        </div>

        {/* Center Icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          {isComingSoon ? (
            <div className="w-10 h-10 rounded-full bg-neutral-900/80 text-amber-400 flex items-center justify-center border border-amber-500/40">
              <Lock className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-xl group-hover:scale-115 group-hover:bg-rose-500 transition-all duration-300">
              <Play className="w-6 h-6 fill-white translate-x-0.5" />
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 flex-1 flex flex-col justify-between text-right">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-rose-500 font-bold mb-1">
            <Mic className="w-3.5 h-3.5" />
            <span className="truncate">{episode.dubStudio}</span>
          </div>

          <h3
            className={`text-sm sm:text-base font-bold transition-colors line-clamp-1 mb-1 ${
              isComingSoon ? 'text-neutral-300' : 'text-white group-hover:text-rose-400'
            }`}
          >
            {episode.title}
          </h3>

          <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed mb-3">
            {episode.description}
          </p>
        </div>

        {/* Footer info & action */}
        <div className="pt-3 border-t border-neutral-850 flex items-center justify-between text-xs text-neutral-400">
          <span className="text-[11px] truncate max-w-[150px] font-sans">
            {episode.voiceActors[0]}
          </span>
          {isComingSoon ? (
            <span className="text-amber-500 font-bold flex items-center gap-1 text-[11px]">
              <span>قريباً</span>
              <Clock className="w-3 h-3" />
            </span>
          ) : (
            <span className="text-rose-500 font-bold flex items-center gap-1 text-[11px] group-hover:translate-x-[-2px] transition-transform">
              <span>مشاهدة</span>
              <ChevronLeft className="w-3 h-3" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
