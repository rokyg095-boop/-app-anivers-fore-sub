import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Heart,
  Lock,
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  CheckCircle2,
  Film,
  Layers,
  Users,
  Calendar,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { DubSeries, DubSeason, DubEpisode } from '../data/mockData.ts';
import { getCustomEpisodeSource, SOURCES_UPDATED_EVENT } from '../utils/videoSource';
import { isEpisodeDetectedAsMerged } from '../utils/catalogOverrides';
import { useFavorites } from '../utils/favorites';
import {
  fetchTmdbEnrichmentForWork,
  resolveEnrichedEpisodeDetails,
  TmdbWorkEnrichment,
} from '../utils/tmdbMetadata';

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
  const [selectedSeasonIndex, setSelectedSeasonIndex] = useState<number>(0);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [tmdbEnrichment, setTmdbEnrichment] = useState<TmdbWorkEnrichment | null>(null);
  const [tmdbLoading, setTmdbLoading] = useState<boolean>(false);
  const [, setVersionTick] = useState<number>(0);
  const { isFavorite, toggleFavorite } = useFavorites();

  const preWatchPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleUpdate = () => setVersionTick((v) => v + 1);
    window.addEventListener(SOURCES_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(SOURCES_UPDATED_EVENT, handleUpdate);
  }, []);

  useEffect(() => {
    setSelectedSeasonIndex(0);
    setSelectedEpisodeId(null);
    setTmdbEnrichment(null);
  }, [series.id]);

  const activeSeason: DubSeason = series.seasons[selectedSeasonIndex] || series.seasons[0];
  const favorited = isFavorite(series.id);

  // Automatic TMDB enrichment for series cast & active season episodes
  useEffect(() => {
    let cancelled = false;
    const seasonNum = activeSeason?.seasonNumber || 1;
    setTmdbLoading(true);
    void fetchTmdbEnrichmentForWork(series, seasonNum)
      .then((data) => {
        if (!cancelled && data?.found) {
          setTmdbEnrichment(data);
        }
      })
      .finally(() => {
        if (!cancelled) setTmdbLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [series.id, series.title, series.originalTitle, series.category, activeSeason?.seasonNumber]);

  const isEpisodeAvailable = (ep: DubEpisode) => {
    const epSrc = getCustomEpisodeSource(ep.id);
    return !ep.isComingSoon || Boolean(epSrc?.driveLink || epSrc?.videoUrl);
  };

  // Enrich an episode object before sending to player so player also shows TMDB cast & description
  const buildEnrichedPlayableEpisode = (ep: DubEpisode): DubEpisode => {
    const resolved = resolveEnrichedEpisodeDetails(ep, series, tmdbEnrichment, true);
    return {
      ...ep,
      title: resolved.title,
      description: resolved.description,
      thumbnail: resolved.thumbnail,
      duration: resolved.duration,
      releaseDate: resolved.releaseDate || ep.releaseDate,
      voiceActors:
        resolved.voiceActorNames.length > 0 ? resolved.voiceActorNames : ep.voiceActors,
    };
  };

  const seasonEpisodes = activeSeason?.episodes || [];
  const firstPlayableEpisode =
    seasonEpisodes.find(isEpisodeAvailable) || seasonEpisodes[0] || null;

  const inspectedEpisode =
    seasonEpisodes.find((e) => e.id === selectedEpisodeId) || firstPlayableEpisode;

  const inspectedIndex = inspectedEpisode
    ? seasonEpisodes.findIndex((e) => e.id === inspectedEpisode.id)
    : -1;
  const prevInspectedEp = inspectedIndex > 0 ? seasonEpisodes[inspectedIndex - 1] : null;
  const nextInspectedEp =
    inspectedIndex >= 0 && inspectedIndex < seasonEpisodes.length - 1
      ? seasonEpisodes[inspectedIndex + 1]
      : null;

  const inspectedResolved = inspectedEpisode
    ? resolveEnrichedEpisodeDetails(inspectedEpisode, series, tmdbEnrichment, true)
    : null;

  const previewEpisodes = seasonEpisodes.slice(0, 6);
  const seriesCast = tmdbEnrichment?.cast || [];
  const heroBackdrop = tmdbEnrichment?.backdropUrl || series.bannerImage || series.coverImage;
  const displaySynopsis =
    series.synopsis || tmdbEnrichment?.overview || '';

  const handleInspectEpisode = (ep: DubEpisode) => {
    setSelectedEpisodeId(ep.id);
    setTimeout(() => {
      preWatchPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 40);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#040711]/85 p-2 sm:p-5 backdrop-blur-2xl overflow-y-auto"
      dir="rtl"
      onClick={onClose}
    >
      {/* Full-viewport soft ambient artwork aura behind frosted frame */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <img
          src={series.coverImage || heroBackdrop}
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover scale-125 blur-3xl opacity-30"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#070b18]/60 via-[#050811]/70 to-[#04060d]/95" />
      </div>

      {/* Snowy Frosted-Glass Container */}
      <div
        className="relative w-full max-w-6xl rounded-3xl overflow-hidden border border-white/25 bg-[#0c1224]/55 backdrop-blur-3xl shadow-[0_32px_100px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/15 my-auto flex flex-col max-h-[93dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scrollable Content Shell */}
        <div className="overflow-y-auto flex-1">
          {/* Top Frost Stage (Full-bleed visual showcase with snowy glass depth) */}
          <div className="relative overflow-hidden border-b border-white/15">
            {/* Background visual layers inside Hero Frost matching series lighting */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <img
                src={series.coverImage || heroBackdrop}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover scale-125 blur-3xl opacity-55 saturate-150"
                referrerPolicy="no-referrer"
              />
              <div
                className="absolute inset-y-0 left-0 w-full lg:w-[72%] overflow-hidden"
                style={{
                  maskImage:
                    'radial-gradient(ellipse 82% 90% at 32% 45%, rgba(0,0,0,1) 20%, rgba(0,0,0,0.68) 55%, rgba(0,0,0,0) 94%)',
                  WebkitMaskImage:
                    'radial-gradient(ellipse 82% 90% at 32% 45%, rgba(0,0,0,1) 20%, rgba(0,0,0,0.68) 55%, rgba(0,0,0,0) 94%)',
                }}
              >
                <img
                  src={heroBackdrop}
                  alt=""
                  aria-hidden="true"
                  className="w-full h-full object-cover object-[center_22%] opacity-65"
                  referrerPolicy="no-referrer"
                />
              </div>
              {/* Snowy crystalline frosted veil & contrast scrims */}
              <div className="absolute inset-0 bg-gradient-to-l from-[#090e1d]/90 via-[#090e1d]/55 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b1020] via-[#0b1020]/30 to-white/[0.08]" />
            </div>

            {/* Minimal Frosted Top Header inside Detail View */}
            <div className="relative z-10 flex items-center justify-between gap-4 px-5 sm:px-8 py-4 border-b border-white/10 bg-white/[0.03] backdrop-blur-md">
              <div className="flex items-center gap-3 text-xs text-white/80 font-medium truncate">
                <Film className="w-4 h-4 text-violet-300 shrink-0" />
                <span className="truncate">{series.dubStudio}</span>
                {tmdbEnrichment?.found && (
                  <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 px-2.5 py-0.5 rounded-full">
                    <Sparkles className="w-3 h-3" />
                    <span>
                      متزامن:{' '}
                      {(tmdbEnrichment.sourcesUsed || ['tmdb'])
                        .map((s) =>
                          s === 'tmdb'
                            ? 'TMDB'
                            : s === 'omdb'
                            ? 'IMDb'
                            : s === 'jikan'
                            ? 'AniList / MAL'
                            : s === 'kitsu'
                            ? 'Kitsu'
                            : 'TVmaze'
                        )
                        .join(' + ')}
                    </span>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                aria-label="إغلاق النافذة"
              >
                <X className="w-4 h-4" />
                <span>إغلاق</span>
              </button>
            </div>

            {/* Frosted Hero Content */}
            <div className="relative z-10 px-5 sm:px-8 py-6 sm:py-8">
              <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6 lg:gap-10">
                {/* Right Column (RTL): Giant Title, Unboxed Metadata, Synopsis & Frosted Buttons */}
                <div className="flex-1 text-right space-y-4 w-full">
                  <div className="space-y-2">
                    <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight [text-wrap:balance] drop-shadow">
                      {series.title}
                    </h2>

                    {/* Clean Unboxed Metadata Line (Zero Pills) */}
                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-white/80">
                      <span className="font-bold text-amber-300 tabular-nums">
                        ★ {series.rating || tmdbEnrichment?.rating || 9.0}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {series.seasons.length}{' '}
                        {series.seasons.length === 1 ? 'موسم' : 'مواسم'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{series.episodesCount} حلقة</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-white/75">
                        {series.genres.slice(0, 3).join('، ')}
                      </span>
                    </div>

                    {series.originalTitle &&
                      series.originalTitle.trim() !== series.title.trim() && (
                        <p className="text-xs font-mono text-white/55" dir="ltr">
                          {series.originalTitle}
                        </p>
                      )}
                    {/* Multi-Source External Ratings Strip (TMDB + IMDb / OMDb + Rotten Tomatoes + AniList/MAL + TVmaze) */}
                    {tmdbEnrichment?.externalRatings &&
                      (tmdbEnrichment.externalRatings.imdb ||
                        tmdbEnrichment.externalRatings.rottenTomatoes ||
                        tmdbEnrichment.externalRatings.metascore ||
                        tmdbEnrichment.externalRatings.malScore ||
                        tmdbEnrichment.externalRatings.kitsuScore ||
                        tmdbEnrichment.externalRatings.tvmazeRating ||
                        tmdbEnrichment.externalRatings.network ||
                        tmdbEnrichment.externalRatings.rated ||
                        (tmdbEnrichment.externalRatings.studios &&
                          tmdbEnrichment.externalRatings.studios.length > 0)) && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-bold">
                          {tmdbEnrichment.externalRatings.imdb && (
                            <span
                              className="px-2.5 py-1 rounded-lg bg-amber-400/15 border border-amber-300/35 text-amber-200 tabular-nums"
                              dir="ltr"
                            >
                              IMDb {tmdbEnrichment.externalRatings.imdb}/10
                            </span>
                          )}
                          {tmdbEnrichment.externalRatings.rottenTomatoes && (
                            <span
                              className="px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-400/35 text-rose-200 tabular-nums"
                              dir="ltr"
                            >
                              🍅 {tmdbEnrichment.externalRatings.rottenTomatoes}
                            </span>
                          )}
                          {tmdbEnrichment.externalRatings.metascore && (
                            <span
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/35 text-emerald-200 tabular-nums"
                              dir="ltr"
                            >
                              Metascore {tmdbEnrichment.externalRatings.metascore}
                            </span>
                          )}
                          {tmdbEnrichment.externalRatings.malScore && (
                            <span
                              className="px-2.5 py-1 rounded-lg bg-sky-500/15 border border-sky-400/35 text-sky-200 tabular-nums"
                              dir="ltr"
                            >
                              AniList/MAL ★ {tmdbEnrichment.externalRatings.malScore}
                              {tmdbEnrichment.externalRatings.malRank
                                ? ` (#${tmdbEnrichment.externalRatings.malRank})`
                                : ''}
                            </span>
                          )}
                          {tmdbEnrichment.externalRatings.kitsuScore && (
                            <span
                              className="px-2.5 py-1 rounded-lg bg-orange-500/15 border border-orange-400/35 text-orange-200 tabular-nums"
                              dir="ltr"
                            >
                              Kitsu ★ {tmdbEnrichment.externalRatings.kitsuScore}
                            </span>
                          )}
                          {tmdbEnrichment.externalRatings.tvmazeRating && (
                            <span
                              className="px-2.5 py-1 rounded-lg bg-teal-500/15 border border-teal-400/35 text-teal-200 tabular-nums"
                              dir="ltr"
                            >
                              TVmaze ★ {tmdbEnrichment.externalRatings.tvmazeRating}
                            </span>
                          )}
                          {tmdbEnrichment.externalRatings.network && (
                            <span className="px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-300/30 text-indigo-200">
                              القناة: {tmdbEnrichment.externalRatings.network}
                            </span>
                          )}
                          {tmdbEnrichment.externalRatings.studios &&
                            tmdbEnrichment.externalRatings.studios.length > 0 && (
                              <span className="px-2.5 py-1 rounded-lg bg-violet-500/15 border border-violet-300/30 text-violet-200">
                                استوديو: {tmdbEnrichment.externalRatings.studios.slice(0, 2).join('، ')}
                              </span>
                            )}
                          {tmdbEnrichment.externalRatings.rated && (
                            <span
                              className="px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white/80 font-mono"
                              dir="ltr"
                            >
                              {tmdbEnrichment.externalRatings.rated}
                            </span>
                          )}
                        </div>
                      )}
                  </div>

                  <p className="text-xs sm:text-sm text-white/85 leading-relaxed max-w-2xl">
                    {displaySynopsis}
                  </p>

                  {tmdbEnrichment?.externalRatings?.awards && (
                    <p className="text-[11px] text-amber-200/80 font-medium">
                      الجوائز: {tmdbEnrichment.externalRatings.awards}
                    </p>
                  )}

                  {/* Signature Frosted Pill Buttons (Watch Now & Add to Favorites) */}
                  <div className="pt-1 flex flex-wrap items-center gap-3">
                    {firstPlayableEpisode && (
                      <button
                        type="button"
                        onClick={() =>
                          onPlayEpisode(buildEnrichedPlayableEpisode(firstPlayableEpisode), series)
                        }
                        className="min-h-[44px] px-6 py-2.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/50 backdrop-blur-md text-white font-bold text-xs sm:text-sm flex items-center gap-2.5 shadow-lg transition-all cursor-pointer active:scale-95"
                      >
                        <span className="w-6 h-6 rounded-full bg-white text-slate-950 flex items-center justify-center">
                          <Play className="w-3.5 h-3.5 fill-slate-950 translate-x-[1px]" />
                        </span>
                        <span>شاهد الآن</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleFavorite(series.id)}
                      className={`min-h-[44px] px-5 py-2.5 rounded-full border backdrop-blur-md font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer active:scale-95 ${
                        favorited
                          ? 'bg-rose-500/25 border-rose-300/60 text-rose-100'
                          : 'bg-white/[0.07] hover:bg-white/15 border-white/25 text-white'
                      }`}
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          favorited ? 'fill-rose-400 text-rose-300' : 'text-white/85'
                        }`}
                      />
                      <span>{favorited ? 'في المفضلة' : 'أضف إلى المفضلة'}</span>
                    </button>
                  </div>

                  {/* Quick Previews Row ("معاينة الحلقات") */}
                  {previewEpisodes.length > 0 && (
                    <div className="pt-4">
                      <div className="text-xs font-bold text-white/80 mb-2.5">
                        أبرز الحلقات (اضغط لمعاينة التفاصيل قبل التشغيل)
                      </div>
                      <div className="flex items-stretch gap-3 overflow-x-auto pb-1">
                        {previewEpisodes.map((ep) => {
                          const available = isEpisodeAvailable(ep);
                          const resolvedThumb = resolveEnrichedEpisodeDetails(
                            ep,
                            series,
                            tmdbEnrichment,
                            true
                          );
                          const isSelected = inspectedEpisode?.id === ep.id;
                          return (
                            <button
                              key={`preview-${ep.id}`}
                              type="button"
                              onClick={() => handleInspectEpisode(ep)}
                              className={`group relative w-36 sm:w-44 aspect-video rounded-2xl overflow-hidden border backdrop-blur-md shrink-0 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 text-right ${
                                isSelected
                                  ? 'border-violet-400 ring-2 ring-violet-400/50 bg-white/15'
                                  : 'border-white/20 hover:border-white/50 bg-white/10'
                              }`}
                            >
                              <img
                                src={resolvedThumb.thumbnail || series.coverImage}
                                alt={resolvedThumb.title}
                                className={`w-full h-full object-cover ${
                                  available
                                    ? 'group-hover:scale-105 transition-transform duration-300'
                                    : 'opacity-75'
                                }`}
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

                              {/* Direct Play Trigger on center ring */}
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onPlayEpisode(buildEnrichedPlayableEpisode(ep), series);
                                  }}
                                  title="تشغيل الحلقة مباشرة"
                                  className="w-9 h-9 rounded-full bg-white/20 hover:bg-rose-600/80 border border-white/50 backdrop-blur-md text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-all"
                                >
                                  {available ? (
                                    <Play className="w-4 h-4 fill-white translate-x-[1px]" />
                                  ) : (
                                    <Lock className="w-3.5 h-3.5 text-amber-200" />
                                  )}
                                </span>
                              </div>

                              <div className="absolute inset-x-0 bottom-0 px-2.5 py-1.5 flex items-center justify-between text-[10px] text-white/95 font-mono">
                                <span className="font-bold tabular-nums">
                                  حلقة {ep.episodeNumber}
                                </span>
                                <span className="tabular-nums opacity-85">
                                  {resolvedThumb.duration}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Left Column (RTL): Crisp Framed Artwork Poster */}
                <div className="w-40 sm:w-48 lg:w-56 aspect-[2/3] rounded-2xl overflow-hidden shrink-0 border border-white/30 shadow-[0_24px_60px_rgba(0,0,0,0.65)] bg-black/30">
                  <img
                    src={series.coverImage || series.bannerImage}
                    alt={series.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>

              {/* Main Series Cast Row (fetched automatically from TMDB) */}
              {seriesCast.length > 0 && (
                <div className="mt-6 pt-5 border-t border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs sm:text-sm font-bold text-white/90 flex items-center gap-2">
                      <Users className="w-4 h-4 text-violet-300" />
                      <span>طاقم الممثلين والأداء الصوتي ({seriesCast.length})</span>
                    </h3>
                  </div>
                  <div className="flex items-stretch gap-3 overflow-x-auto pb-1.5">
                    {seriesCast.map((actor) => (
                      <div
                        key={`cast-${actor.id}-${actor.name}`}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-white/[0.06] border border-white/10 backdrop-blur-md shrink-0 max-w-[220px]"
                      >
                        {actor.profileUrl ? (
                          <img
                            src={actor.profileUrl}
                            alt={actor.name}
                            className="w-10 h-10 rounded-full object-cover border border-white/25 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-violet-500/25 border border-violet-300/30 flex items-center justify-center text-xs font-black text-violet-200 shrink-0">
                            {actor.name.slice(0, 1)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {actor.name}
                          </div>
                          {actor.character && (
                            <div className="text-[10px] text-white/60 truncate">
                              {actor.character}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Anime Characters & Voice Actors Row (fetched from MyAnimeList / Jikan when available) */}
              {tmdbEnrichment?.animeExtras?.characters &&
                tmdbEnrichment.animeExtras.characters.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs sm:text-sm font-bold text-sky-200 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-sky-300" />
                        <span>
                          الشخصيات ومؤدو الأصوات اليابانيون — MyAnimeList (
                          {tmdbEnrichment.animeExtras.characters.length})
                        </span>
                      </h3>
                    </div>
                    <div className="flex items-stretch gap-3 overflow-x-auto pb-1.5">
                      {tmdbEnrichment.animeExtras.characters.map((ch) => (
                        <div
                          key={`mal-char-${ch.malId}-${ch.name}`}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-sky-500/[0.08] border border-sky-300/20 backdrop-blur-md shrink-0 max-w-[260px]"
                        >
                          {ch.imageUrl ? (
                            <img
                              src={ch.imageUrl}
                              alt={ch.name}
                              className="w-10 h-10 rounded-full object-cover border border-sky-300/40 shrink-0"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-sky-500/25 flex items-center justify-center text-xs font-black text-sky-100 shrink-0">
                              {ch.name.slice(0, 1)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate">{ch.name}</div>
                            {ch.voiceActorName && (
                              <div className="text-[10px] text-sky-200/80 truncate">
                                أداء: {ch.voiceActorName}
                              </div>
                            )}
                          </div>
                          {ch.voiceActorImage && (
                            <img
                              src={ch.voiceActorImage}
                              alt={ch.voiceActorName || ch.name}
                              className="w-8 h-8 rounded-full object-cover border border-white/25 shrink-0"
                              referrerPolicy="no-referrer"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </div>

          {/* Season Switcher, Pre-Watch Episode Inspector & Episodes Grid */}
          <div className="p-5 sm:p-8 space-y-6 bg-[#090e1c]/45">
            {/* Pre-Watch Episode Inspector Stage ("قبل الدخول للحلقة: اسم الحلقة + القصة الصغيرة + الممثلون") */}
            {inspectedEpisode && inspectedResolved && (
              <div
                ref={preWatchPanelRef}
                className="rounded-3xl border border-violet-400/30 bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-violet-950/30 backdrop-blur-2xl overflow-hidden shadow-2xl"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
                  {/* Episode Still Thumbnail */}
                  <div className="lg:col-span-5 relative aspect-video lg:aspect-auto lg:min-h-[260px] bg-black/50 overflow-hidden">
                    <img
                      src={inspectedResolved.thumbnail || series.coverImage}
                      alt={inspectedResolved.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0b1020] via-black/20 to-transparent" />
                    <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/65 backdrop-blur-md border border-white/20 text-[11px] font-bold text-white tabular-nums">
                      الحلقة {inspectedEpisode.episodeNumber}
                    </div>
                    {inspectedResolved.duration && (
                      <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md text-[11px] font-mono text-white/90 tabular-nums">
                        {inspectedResolved.duration}
                      </div>
                    )}
                  </div>

                  {/* Episode Full Details Before Watching */}
                  <div className="lg:col-span-7 p-5 sm:p-6 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/75">
                          <span className="font-bold text-violet-300">
                            {activeSeason?.title}
                          </span>
                          {inspectedResolved.releaseDate && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 text-white/70 tabular-nums">
                                <Calendar className="w-3.5 h-3.5 text-sky-300" />
                                <span>{inspectedResolved.releaseDate}</span>
                              </span>
                            </>
                          )}
                          {inspectedResolved.imdbRating && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span
                                className="inline-flex items-center gap-1 text-amber-300 font-bold tabular-nums"
                                dir="ltr"
                              >
                                IMDb ★ {inspectedResolved.imdbRating}
                              </span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          {isEpisodeAvailable(inspectedEpisode) ? (
                            <span className="text-emerald-300 font-bold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>متاحة للمشاهدة</span>
                            </span>
                          ) : (
                            <span className="text-amber-300 font-bold inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              <span>جاهزة للربط عبر درايف</span>
                            </span>
                          )}
                        </div>

                        {tmdbLoading && (
                          <span className="text-[11px] text-violet-300 animate-pulse">
                            جاري جلب بيانات الحلقة...
                          </span>
                        )}
                      </div>

                      {/* Episode Title */}
                      <div>
                        <h3 className="text-xl sm:text-2xl font-black text-white leading-snug">
                          {inspectedResolved.title}
                        </h3>
                        {inspectedResolved.secondaryTitle && (
                          <p className="text-xs text-white/55 font-mono mt-0.5" dir="ltr">
                            {inspectedResolved.secondaryTitle}
                          </p>
                        )}
                      </div>

                      {/* Episode Small Story ("القصة الصغيرة") */}
                      <div className="p-3.5 rounded-2xl bg-black/25 border border-white/10 space-y-1.5">
                        <div className="text-[11px] font-bold text-violet-300 flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>القصة الصغيرة</span>
                        </div>
                        <p className="text-xs sm:text-sm text-white/85 leading-relaxed">
                          {inspectedResolved.description}
                        </p>
                        {inspectedResolved.secondaryDescription && (
                          <p className="text-[11px] text-white/55 leading-relaxed pt-1 border-t border-white/10">
                            {inspectedResolved.secondaryDescription}
                          </p>
                        )}
                      </div>

                      {/* Episode Cast & Actors Before Entering Episode */}
                      {(inspectedResolved.castMembers.length > 0 ||
                        inspectedResolved.voiceActorNames.length > 0) && (
                        <div className="space-y-2">
                          <div className="text-[11px] font-bold text-white/80 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-amber-300" />
                            <span>
                              الممثلون المشاركون ({
                                inspectedResolved.castMembers.length ||
                                inspectedResolved.voiceActorNames.length
                              })
                            </span>
                          </div>

                          {inspectedResolved.castMembers.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {inspectedResolved.castMembers.slice(0, 8).map((actor) => (
                                <div
                                  key={`ep-actor-${actor.id}-${actor.name}`}
                                  className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-white/[0.06] border border-white/10"
                                >
                                  {actor.profileUrl ? (
                                    <img
                                      src={actor.profileUrl}
                                      alt={actor.name}
                                      className="w-6 h-6 rounded-full object-cover shrink-0"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                      {actor.name.slice(0, 1)}
                                    </span>
                                  )}
                                  <div className="text-[11px] leading-tight">
                                    <span className="font-bold text-white">{actor.name}</span>
                                    {actor.character && (
                                      <span className="text-white/55 mr-1">
                                        ({actor.character})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {inspectedResolved.voiceActorNames.map((actorName, i) => (
                                <span
                                  key={i}
                                  className="px-2.5 py-1 rounded-xl bg-white/[0.06] border border-white/10 text-[11px] text-white/85"
                                >
                                  {actorName}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action Row: Watch Episode Now + Prev/Next Inspection */}
                    <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          onPlayEpisode(buildEnrichedPlayableEpisode(inspectedEpisode), series)
                        }
                        className="min-h-[44px] px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-rose-950/50 transition-all cursor-pointer active:scale-95"
                      >
                        <Play className="w-4 h-4 fill-white" />
                        <span>
                          {isEpisodeAvailable(inspectedEpisode)
                            ? 'دخول ومشاهدة الحلقة الآن'
                            : 'فتح صفحة الحلقة / ربط درايف'}
                        </span>
                      </button>

                      <div className="flex items-center gap-2">
                        {prevInspectedEp && (
                          <button
                            type="button"
                            onClick={() => setSelectedEpisodeId(prevInspectedEp.id)}
                            className="px-3 py-2 rounded-full bg-white/[0.07] hover:bg-white/15 border border-white/15 text-xs font-bold text-white/85 flex items-center gap-1 cursor-pointer"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                            <span>السابقة</span>
                          </button>
                        )}
                        {nextInspectedEp && (
                          <button
                            type="button"
                            onClick={() => setSelectedEpisodeId(nextInspectedEp.id)}
                            className="px-3 py-2 rounded-full bg-white/[0.07] hover:bg-white/15 border border-white/15 text-xs font-bold text-white/85 flex items-center gap-1 cursor-pointer"
                          >
                            <span>التالية</span>
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Seasons Segmented Control */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-violet-300" />
                  <span>المواسم والحلقات (اضغط لعرض القصة والممثلين)</span>
                </h3>
                {activeSeason && (
                  <span className="text-xs text-white/65 tabular-nums">
                    {activeSeason.episodes.filter(isEpisodeAvailable).length} متاحة ·{' '}
                    {activeSeason.episodes.filter((e) => !isEpisodeAvailable(e)).length}{' '}
                    قريباً
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {series.seasons.map((season, idx) => {
                  const active = selectedSeasonIndex === idx;
                  return (
                    <button
                      key={season.id}
                      type="button"
                      onClick={() => {
                        setSelectedSeasonIndex(idx);
                        setSelectedEpisodeId(null);
                      }}
                      className={`min-h-[40px] px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 border backdrop-blur-md ${
                        active
                          ? 'bg-white text-slate-950 border-white shadow-lg'
                          : 'bg-white/[0.07] hover:bg-white/[0.14] text-white/85 border-white/15'
                      }`}
                    >
                      <span>{season.title}</span>
                      <span
                        className={`text-[11px] font-mono tabular-nums ${
                          active ? 'text-slate-600' : 'text-white/55'
                        }`}
                      >
                        ({season.episodes.length})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Episodes Grid in Translucent Frost Cards */}
            {activeSeason && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {activeSeason.episodes.map((ep) => {
                  const available = isEpisodeAvailable(ep);
                  const merged = isEpisodeDetectedAsMerged(ep);
                  const resolvedEp = resolveEnrichedEpisodeDetails(
                    ep,
                    series,
                    tmdbEnrichment,
                    true
                  );
                  const isSelected = inspectedEpisode?.id === ep.id;

                  return (
                    <div
                      key={ep.id}
                      onClick={() => handleInspectEpisode(ep)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleInspectEpisode(ep);
                        }
                      }}
                      className={`group text-right relative rounded-2xl p-3 border backdrop-blur-md transition-all cursor-pointer flex gap-3.5 ${
                        isSelected
                          ? 'bg-violet-500/15 border-violet-400/70 ring-1 ring-violet-400/40 shadow-xl'
                          : available
                          ? 'bg-white/[0.06] hover:bg-white/[0.12] border-white/15 hover:border-white/35 shadow-lg'
                          : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/10 opacity-85 hover:opacity-100'
                      }`}
                    >
                      {/* Thumbnail Area (Click center play icon to jump straight to video) */}
                      <div className="relative w-32 sm:w-36 aspect-video rounded-xl overflow-hidden shrink-0 bg-black/40 border border-white/10">
                        <img
                          src={resolvedEp.thumbnail || series.coverImage}
                          alt={resolvedEp.title}
                          className={`w-full h-full object-cover transition-transform duration-300 ${
                            available ? 'group-hover:scale-105' : 'opacity-80'
                          }`}
                          referrerPolicy="no-referrer"
                        />

                        <div className="absolute bottom-1.5 left-1.5 bg-black/75 text-white font-mono text-[10px] px-1.5 py-0.5 rounded backdrop-blur tabular-nums">
                          {resolvedEp.duration}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlayEpisode(buildEnrichedPlayableEpisode(ep), series);
                          }}
                          title="تشغيل الحلقة مباشرة"
                          aria-label={`تشغيل ${resolvedEp.title}`}
                          className="absolute inset-0 flex items-center justify-center bg-black/25 hover:bg-black/40 transition-colors cursor-pointer"
                        >
                          {available ? (
                            <span className="w-9 h-9 rounded-full bg-white/25 hover:bg-rose-600/90 border border-white/50 backdrop-blur-md text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-all">
                              <Play className="w-4 h-4 fill-white translate-x-[1px]" />
                            </span>
                          ) : (
                            <span className="w-8 h-8 rounded-full bg-black/60 border border-amber-300/40 text-amber-300 flex items-center justify-center">
                              <Lock className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </button>
                      </div>

                      {/* Episode Details */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/70 mb-1">
                            <span className="font-bold text-violet-300 tabular-nums">
                              الحلقة {ep.episodeNumber}
                            </span>
                            {merged && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-sky-300 font-semibold">حلقة مدمجة</span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            {available ? (
                              <span className="text-emerald-300 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>متاح HD</span>
                              </span>
                            ) : (
                              <span className="text-amber-300 font-semibold flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>قريباً</span>
                              </span>
                            )}
                          </div>

                          <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-violet-200 transition-colors truncate mb-1">
                            {resolvedEp.title}
                          </h4>

                          <p className="text-[11px] text-white/65 line-clamp-2 leading-relaxed">
                            {resolvedEp.description}
                          </p>
                        </div>

                        <div className="pt-2 mt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                          <span className="text-white/55 truncate max-w-[160px]">
                            {resolvedEp.voiceActorNames.slice(0, 2).join('، ') || ep.dubStudio}
                          </span>
                          <span className="text-white/90 font-bold flex items-center gap-1 group-hover:-translate-x-0.5 transition-transform">
                            <span>{isSelected ? 'قيد المعاينة' : 'القصة والممثلون'}</span>
                            <ChevronLeft className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
