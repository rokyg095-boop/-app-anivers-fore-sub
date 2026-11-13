import React, { useState, useEffect } from 'react';
import {
  Clapperboard,
  Play,
  Clock,
  Star,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Film,
  Layers,
  ChevronLeft,
  Plus
} from 'lucide-react';
import { MOVIES_WORKS, DubSeries, DubEpisode } from '../data/mockData';
import { SOURCES_UPDATED_EVENT } from '../utils/videoSource';
import { getCustomSeriesByCategory, CUSTOM_WORKS_UPDATED_EVENT } from '../utils/customWorks';

interface MoviesViewProps {
  onSelectSeries: (series: DubSeries) => void;
  onPlayEpisode: (episode: DubEpisode, series: DubSeries) => void;
  onOpenAdmin: () => void;
  isOwnerAdmin?: boolean;
  onOpenCreateWork?: () => void;
}

export const MoviesView: React.FC<MoviesViewProps> = ({
  onSelectSeries,
  onPlayEpisode,
  onOpenAdmin,
  isOwnerAdmin = false,
  onOpenCreateWork,
}) => {
  const [selectedMovieId, setSelectedMovieId] = useState<string>(MOVIES_WORKS[0].id);
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

  const allMovieWorks = [...MOVIES_WORKS, ...getCustomSeriesByCategory('movie')];

  const flagshipMovie =
    allMovieWorks.find((m) => m.id === selectedMovieId) || allMovieWorks[0];
  const movieEpisode = flagshipMovie.episodes[0] || flagshipMovie.seasons[0]?.episodes[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12" dir="rtl">
      {/* Header */}
      <div className="border-b border-neutral-800 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-amber-500 font-mono tracking-wider mb-1">
            <Clapperboard className="w-4 h-4" />
            <span>صالة العرض السينمائي (AniVerse Cinema)</span>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px]">
              قسم الأفلام
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white mt-1">
            الأفلام السينمائية الكبرى
          </h1>
          <p className="text-sm text-neutral-400 mt-2 max-w-2xl leading-relaxed">
            قسم خاص مخصص للأفلام العالمية والأنيميشن الكامل، مع أعلى جودة تصويرية وصوت محيطي نقي وخالٍ من الإعلانات المشوشة.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {isOwnerAdmin && onOpenCreateWork && (
            <button
              onClick={onOpenCreateWork}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-amber-950/60"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة فيلم جديد (للمالك)</span>
            </button>
          )}

          {isOwnerAdmin && (
            <button
              onClick={onOpenAdmin}
              className="px-3.5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-amber-500" />
              <span>إدارة روابط الأفلام (المشرف)</span>
            </button>
          )}
        </div>
      </div>

      {/* Movie Switcher Bar */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        {allMovieWorks.map((m) => (
          <button
            key={m.id}
            onClick={() => setSelectedMovieId(m.id)}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
              flagshipMovie.id === m.id
                ? 'bg-amber-500 text-neutral-950 shadow-lg shadow-amber-950/40 border border-amber-400 font-black'
                : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800 border border-neutral-800'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>{m.title}</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/25">
              {m.originalTitle.split('(')[0].trim()}
            </span>
          </button>
        ))}
      </div>

      {/* Flagship Movie Showcase: Spider-Man Across the Spider-Verse */}
      <div className="relative rounded-3xl overflow-hidden border-2 border-amber-500/40 bg-gradient-to-br from-neutral-900 via-neutral-900 to-amber-950/30 p-6 sm:p-10 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-center lg:items-start gap-8">
          {/* Movie Poster */}
          <div
            onClick={() => onPlayEpisode(movieEpisode, flagshipMovie)}
            className="w-52 sm:w-72 aspect-[2/3] rounded-2xl overflow-hidden shrink-0 shadow-2xl border-2 border-amber-500/50 cursor-pointer group bg-neutral-950 relative"
          >
            <img loading="lazy" decoding="async"
              src={flagshipMovie.coverImage}
              alt={flagshipMovie.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-transparent to-transparent" />

            <div className="absolute top-3 right-3 bg-amber-500 text-neutral-950 font-mono text-[10px] font-black px-2.5 py-0.5 rounded-full shadow">
              {flagshipMovie.id === allMovieWorks[0].id ? 'الفيلم السينمائي الأول' : 'فيلم سينمائي كامل'}
            </div>

            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
              <div className="w-16 h-16 rounded-full bg-amber-500 text-neutral-950 flex items-center justify-center shadow-2xl hover:scale-110 transition-transform">
                <Play className="w-8 h-8 fill-neutral-950 translate-x-0.5" />
              </div>
            </div>

            <div className="absolute bottom-3 left-3 text-xs font-mono font-bold text-white bg-black/80 px-2 py-0.5 rounded">
              {movieEpisode.duration}
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 text-right flex flex-col justify-between space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-500 text-neutral-950">
                  {flagshipMovie.genres[0]}
                </span>
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-neutral-800 text-amber-400 border border-neutral-700 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                  <span>{flagshipMovie.rating}</span>
                </span>
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300">
                  مدة العرض: {movieEpisode.duration}
                </span>
                <span className="text-xs text-neutral-400 font-mono">
                  {flagshipMovie.dubStudio}
                </span>
              </div>

              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight mb-1">
                {flagshipMovie.title}
              </h2>
              <p className="text-xs sm:text-sm font-mono text-amber-400/90 mb-3" dir="ltr">
                {flagshipMovie.originalTitle}
              </p>

              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed max-w-3xl mb-4">
                {flagshipMovie.synopsis}
              </p>

              {/* Cast */}
              <div className="space-y-1.5 pt-2">
                <div className="text-xs font-bold text-neutral-400">الشخصيات والأداء الصوتي:</div>
                <div className="flex flex-wrap gap-1.5">
                  {movieEpisode.voiceActors.map((actor, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-neutral-800 text-neutral-200 border border-neutral-700 text-xs font-medium"
                    >
                      {actor}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-neutral-800/80 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onPlayEpisode(movieEpisode, flagshipMovie)}
                className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-sm rounded-xl shadow-lg shadow-amber-950 flex items-center gap-2 transition-all cursor-pointer hover:scale-105 active:scale-95"
              >
                <Play className="w-5 h-5 fill-neutral-950" />
                <span>مشاهدة الفيلم الكامل الآن</span>
              </button>

              <button
                onClick={() => onSelectSeries(flagshipMovie)}
                className="px-4 py-3 bg-neutral-800 hover:bg-neutral-750 text-white font-bold text-sm rounded-xl border border-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Layers className="w-4 h-4 text-amber-400" />
                <span>تفاصيل ومعلومات العرض</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Movies Catalog Grid */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <Film className="w-5 h-5 text-amber-500" />
            <span>قائمة الأفلام السينمائية</span>
          </h3>
          <span className="text-xs font-mono text-neutral-400">
            {allMovieWorks.length} فيلم متاح
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {allMovieWorks.map((movie) => {
            const ep = movie.episodes[0] || movie.seasons[0]?.episodes[0];
            return (
              <div
                key={movie.id}
                onClick={() => onPlayEpisode(ep, movie)}
                className="group relative bg-neutral-900 border border-neutral-800 hover:border-amber-500/50 rounded-3xl overflow-hidden p-4 flex flex-col justify-between transition-all duration-300 hover:shadow-2xl hover:shadow-amber-950/20 cursor-pointer"
              >
                <div>
                  <div className="relative aspect-[16/10] rounded-2xl overflow-hidden bg-neutral-950 mb-3">
                    <img loading="lazy" decoding="async"
                      src={movie.bannerImage || movie.coverImage}
                      alt={movie.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent" />

                    <div className="absolute top-3 right-3 bg-amber-500 text-neutral-950 font-mono text-[10px] font-black px-2 py-0.5 rounded-full">
                      فيلم كامل
                    </div>

                    <div className="absolute bottom-3 left-3 text-xs font-mono text-white bg-black/80 px-2 py-0.5 rounded">
                      {ep?.duration || '02:20:00'}
                    </div>

                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                      <div className="w-12 h-12 rounded-full bg-amber-500 text-neutral-950 flex items-center justify-center shadow-xl">
                        <Play className="w-6 h-6 fill-neutral-950 translate-x-0.5" />
                      </div>
                    </div>
                  </div>

                  <h4 className="text-lg font-black text-white group-hover:text-amber-400 transition-colors line-clamp-1 mb-1">
                    {movie.title}
                  </h4>
                  <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed mb-4">
                    {movie.synopsis}
                  </p>
                </div>

                <div className="pt-3 border-t border-neutral-800 flex items-center justify-between text-xs">
                  <span className="text-neutral-400 font-mono text-[11px]">
                    {movie.dubStudio}
                  </span>
                  <span className="text-amber-400 font-bold flex items-center gap-1 group-hover:underline">
                    <span>تشغيل الفيلم</span>
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
