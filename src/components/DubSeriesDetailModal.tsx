import React, { useState, useEffect } from 'react';
import {
  Play,
  Tv,
  Mic,
  Star,
  Clock,
  Calendar,
  Lock,
  ChevronLeft,
  X,
  Sparkles,
  Info,
  CheckCircle2,
  Film
} from 'lucide-react';
import { DubSeries, DubSeason, DubEpisode } from '../data/mockData.ts';
import { isEpisodePlayable, SOURCES_UPDATED_EVENT } from '../utils/videoSource';

interface DubSeriesDetailModalProps {
  series: DubSeries;
  onClose: () => void;
  onPlayEpisode: (episode: DubEpisode, series: DubSeries) => void;
}

export const DubSeriesDetailModal: React.FC<DubSeriesDetailModalProps> = ({
  series,
  onClose,
  onPlayEpisode,
}) => {
  // Currently active season
  const [selectedSeasonIndex, setSelectedSeasonIndex] = useState<number>(0);
  const [comingSoonToast, setComingSoonToast] = useState<string | null>(null);
  const [, setVersionTick] = useState<number>(0);

  // Re-render when admin updates any links
  useEffect(() => {
    const handleUpdate = () => setVersionTick((v) => v + 1);
    window.addEventListener(SOURCES_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(SOURCES_UPDATED_EVENT, handleUpdate);
  }, []);

  const activeSeason: DubSeason = series.seasons[selectedSeasonIndex] || series.seasons[0];
  const firstPlayableEpisode = activeSeason.episodes.find((e) => isEpisodePlayable(e));
  const playableCount = activeSeason.episodes.filter((e) => isEpisodePlayable(e)).length;

  const handleEpisodeClick = (episode: DubEpisode) => {
    // Open player directly for viewing or configuring Google Drive stream & subtitles
    onPlayEpisode(episode, series);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-md overflow-y-auto"
      dir="rtl"
    >
      <div className="relative w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl my-auto flex flex-col max-h-[92vh]">
        {/* Toast for Coming Soon items */}
        {comingSoonToast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-neutral-950 font-bold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs sm:text-sm animate-bounce">
            <Clock className="w-4 h-4" />
            <span>{comingSoonToast}</span>
          </div>
        )}

        {/* Top Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 z-20 w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 transition-colors cursor-pointer"
          title="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Banner & Hero Header (content stays in normal flow so it can grow instead of being clipped on phones) */}
        <div className="relative min-h-56 sm:min-h-72 w-full overflow-hidden shrink-0 bg-neutral-950 flex flex-col justify-end">
          <img loading="lazy" decoding="async"
            src={series.bannerImage}
            alt={series.title}
            className="absolute inset-0 w-full h-full object-cover opacity-60"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/60 to-transparent" />

          {/* Hero Content Overlay */}
          <div className="relative px-4 sm:px-5 pt-14 pb-4 sm:pb-5 flex flex-wrap sm:flex-nowrap items-end gap-3 sm:gap-5">
            <div className="w-20 sm:w-36 aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border-2 border-rose-500/40 shrink-0 bg-neutral-800">
              <img loading="lazy" decoding="async"
                src={series.coverImage}
                alt={series.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="flex-1 min-w-0 text-right">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-rose-600/90 text-white font-bold">
                  {series.genres[0]}
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-neutral-800/80 text-amber-400 border border-neutral-700 flex items-center gap-1 font-bold">
                  <Star className="w-3 h-3 fill-amber-400" />
                  <span>{series.rating}</span>
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300">
                  {series.seasons.length} {series.seasons.length === 1 ? 'موسم' : 'مواسم'}
                </span>
              </div>

              <h2 className="text-xl sm:text-3xl font-black text-white">{series.title}</h2>
              <p className="text-xs sm:text-sm text-neutral-400 font-mono mt-0.5 break-words">
                {series.originalTitle}
              </p>

              <div className="flex items-center gap-2 text-xs text-rose-400 font-bold mt-2">
                <Mic className="w-3.5 h-3.5" />
                <span>{series.dubStudio}</span>
              </div>
            </div>

            {/* Quick Play: first playable episode of the selected season (catalog or admin-linked) */}
            {firstPlayableEpisode && (
              <button
                onClick={() => onPlayEpisode(firstPlayableEpisode, series)}
                className="w-full sm:w-auto shrink-0 px-5 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 shadow-xl shadow-rose-950 transition-all cursor-pointer hover:scale-105"
              >
                <Play className="w-4 h-4 fill-white translate-x-0.5" />
                <span>
                  {firstPlayableEpisode.episodeNumber === 1
                    ? 'مشاهدة الحلقة الأولى'
                    : `مشاهدة الحلقة ${firstPlayableEpisode.episodeNumber}`}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Synopsis */}
          <div className="bg-neutral-950/60 p-4 rounded-2xl border border-neutral-800/80">
            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-rose-500" />
              <span>نبذة عن المسلسل</span>
            </h3>
            <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
              {series.synopsis}
            </p>
          </div>

          {/* STEP 1: Season Selector (المواسم) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Tv className="w-4 h-4 text-amber-500" />
                <span>المواسم المتوفرة</span>
                <span className="text-xs font-normal text-neutral-400">
                  (اختر الموسم لعرض الحلقات)
                </span>
              </h3>
            </div>

            <div className="flex items-center gap-3 overflow-x-auto pb-1">
              {series.seasons.map((season, idx) => (
                <button
                  key={season.id}
                  onClick={() => setSelectedSeasonIndex(idx)}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
                    selectedSeasonIndex === idx
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/40 border border-rose-500'
                      : 'bg-neutral-800/90 text-neutral-300 hover:bg-neutral-750 border border-neutral-700/80'
                  }`}
                >
                  <Film className="w-4 h-4" />
                  <span>{season.title}</span>
                  <span className="text-[11px] font-mono px-2 py-0.5 bg-black/40 rounded-full">
                    {season.episodes.length} حلقات
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* STEP 2: Episodes of the Selected Season (الحلقات) */}
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-neutral-800 pb-2">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-rose-500" />
                <span>حلقات {activeSeason.title}</span>
              </h3>
              <span className="text-xs text-neutral-400 font-mono">
                {playableCount} متاحة ·{' '}
                {activeSeason.episodes.length - playableCount} قريباً
              </span>
            </div>

            {/* Grid of Episodes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activeSeason.episodes.map((ep) => {
                const isComingSoon = !isEpisodePlayable(ep);

                return (
                  <div
                    key={ep.id}
                    onClick={() => handleEpisodeClick(ep)}
                    className={`group relative rounded-2xl p-3 border transition-all cursor-pointer flex gap-3.5 ${
                      isComingSoon
                        ? 'bg-neutral-900/40 border-neutral-800/60 opacity-75 hover:opacity-100 hover:border-amber-500/40'
                        : 'bg-neutral-850 hover:bg-neutral-800 border-neutral-750 hover:border-rose-500/60 shadow-lg hover:shadow-rose-950/20'
                    }`}
                  >
                    {/* Thumbnail Area */}
                    <div className="relative w-32 sm:w-36 aspect-video rounded-xl overflow-hidden shrink-0 bg-neutral-950">
                      <img loading="lazy" decoding="async"
                        src={ep.thumbnail}
                        alt={ep.title}
                        className={`w-full h-full object-cover transition-transform duration-300 ${
                          isComingSoon ? 'grayscale' : 'group-hover:scale-105'
                        }`}
                        referrerPolicy="no-referrer"
                      />

                      {/* Duration / Coming soon tag */}
                      <div className="absolute bottom-1.5 left-1.5 bg-black/85 text-white font-mono text-[10px] px-1.5 py-0.5 rounded backdrop-blur border border-white/10">
                        {ep.duration}
                      </div>

                      {/* Play or Lock Icon */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        {isComingSoon ? (
                          <div className="w-8 h-8 rounded-full bg-neutral-800/90 text-amber-400 flex items-center justify-center border border-amber-500/40">
                            <Lock className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-rose-600/90 group-hover:bg-rose-500 text-white flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
                            <Play className="w-4 h-4 fill-white translate-x-0.5" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Content Details */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className={`text-[11px] font-mono font-bold px-1.5 py-0.2 rounded ${
                              isComingSoon
                                ? 'bg-amber-950/80 text-amber-400 border border-amber-500/30'
                                : 'bg-rose-950/80 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            الحلقة {ep.episodeNumber}
                          </span>

                          {isComingSoon ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                              قريباً
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1 font-sans">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>متاح للمشاهدة HD</span>
                            </span>
                          )}
                        </div>

                        <h4
                          className={`text-xs sm:text-sm font-bold truncate mb-1 ${
                            isComingSoon
                              ? 'text-neutral-300'
                              : 'text-white group-hover:text-rose-400 transition-colors'
                          }`}
                        >
                          {ep.title}
                        </h4>

                        <p className="text-[11px] text-neutral-400 line-clamp-2 leading-relaxed">
                          {ep.description}
                        </p>
                      </div>

                      {/* Episode Action / Status */}
                      <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[11px]">
                        <span className="text-neutral-500 truncate max-w-[120px]">
                          {ep.dubStudio}
                        </span>

                        {isComingSoon ? (
                          <span className="text-amber-500/90 font-bold flex items-center gap-1">
                            <span>قريباً</span>
                            <Clock className="w-3 h-3" />
                          </span>
                        ) : (
                          <span className="text-rose-500 font-bold flex items-center gap-1 group-hover:translate-x-[-2px] transition-transform">
                            <span>مشاهدة الفيديو</span>
                            <ChevronLeft className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
