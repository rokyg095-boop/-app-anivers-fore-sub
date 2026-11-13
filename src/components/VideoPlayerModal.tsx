import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  Subtitles,
  Tv,
  Check,
  Film,
  Sparkles,
  Lock,
  ChevronRight,
  ChevronLeft,
  X,
  Info,
  Layers,
  Settings,
  ShieldCheck,
  FastForward
} from 'lucide-react';
import { DubEpisode } from '../data/mockData.ts';
import {
  extractDriveFileId,
  isGoogleDriveSource,
  getDriveDirectStreamUrl,
  normalizeDriveDirectUrl,
  getDrivePreviewUrl,
  getCustomEpisodeSource,
  getAvailableDriveServers,
  CustomEpisodeConfig,
  SubtitleTrack,
  SOURCES_UPDATED_EVENT,
  isEpisodePlayable,
  isDemoSubtitleSrc
} from '../utils/videoSource';

// Resolve the saved (admin) source + the real subtitle tracks for an episode.
// The bundled demo VTT files are never offered as subtitles.
function resolveEpisodeSource(ep: DubEpisode): { config: CustomEpisodeConfig; subtitles: SubtitleTrack[] } {
  const saved = getCustomEpisodeSource(ep.id);
  const realTracks = (list?: SubtitleTrack[]) =>
    (Array.isArray(list) ? list : []).filter((t) => t && t.src && !isDemoSubtitleSrc(t.src));
  const savedTracks = realTracks(saved?.subtitles);
  return {
    config: saved || {},
    subtitles: savedTracks.length > 0 ? savedTracks : realTracks(ep.subtitles),
  };
}

const driveIdOf = (url: string): string | null =>
  url && isGoogleDriveSource(url) ? extractDriveFileId(url) : null;

const serverSignature = (config: CustomEpisodeConfig, ep: DubEpisode): string =>
  getAvailableDriveServers(config, ep.driveLink)
    .map((s) => s.url)
    .join('|');

interface VideoPlayerModalProps {
  episode: DubEpisode;
  seriesTitle: string;
  allEpisodes: DubEpisode[];
  onSelectEpisode: (ep: DubEpisode) => void;
  onClose: () => void;
  onOpenAdmin?: () => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  episode,
  seriesTitle,
  allEpisodes,
  onSelectEpisode,
  onClose,
  onOpenAdmin,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<any>(null);
  const isPlayingRef = useRef<boolean>(true);
  const lastTouchRevealRef = useRef<number>(0);
  // Server index the automatic failover started from (the user's pick, or 0)
  const failoverStartRef = useRef<number>(0);
  // Signature of the server list currently rendered (used to detect real link changes)
  const renderedServerSigRef = useRef<string>('');

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.9);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isTheaterMode, setIsTheaterMode] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [playFeedback, setPlayFeedback] = useState<'play' | 'pause' | null>(null);

  // Subtitles state
  const [availableSubtitles, setAvailableSubtitles] = useState<SubtitleTrack[]>(
    () => resolveEpisodeSource(episode).subtitles
  );
  const [selectedSubtitleLang, setSelectedSubtitleLang] = useState<string>('off'); // 'off' or lang code
  const [currentSubtitleText, setCurrentSubtitleText] = useState<string>('');
  const [showSubtitleMenu, setShowSubtitleMenu] = useState<boolean>(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState<boolean>(false);

  // Engine: 'native' (<video>) vs 'embed' (silent fallback for drive if cross-origin cookies block direct stream)
  const [playerEngine, setPlayerEngine] = useState<'native' | 'embed'>('native');
  const [nativeFailed, setNativeFailed] = useState<boolean>(false);

  // Active custom link in background + selected multi-account server index
  const [activeSourceConfig, setActiveSourceConfig] = useState<CustomEpisodeConfig>(
    () => resolveEpisodeSource(episode).config
  );
  const [activeServerIdx, setActiveServerIdx] = useState<number>(0);
  const [sourcesVersion, setSourcesVersion] = useState<number>(0);

  // Episode switched: load its source synchronously during render so the first frame
  // never uses the previous episode's links / server index / engine.
  const [sourceEpisodeId, setSourceEpisodeId] = useState<string>(episode.id);
  if (sourceEpisodeId !== episode.id) {
    const resolved = resolveEpisodeSource(episode);
    setSourceEpisodeId(episode.id);
    setActiveSourceConfig(resolved.config);
    setAvailableSubtitles(resolved.subtitles);
    setActiveServerIdx(0);
    setNativeFailed(false);
    setPlayerEngine('native');
    setCurrentSubtitleText('');
  }

  useEffect(() => {
    failoverStartRef.current = 0;
  }, [episode.id]);

  // Listen for admin / cloud link updates. Only reset the server + engine when this
  // episode's server list actually changed, so unrelated sync events don't restart playback.
  useEffect(() => {
    const handleStorageUpdate = () => {
      const resolved = resolveEpisodeSource(episode);
      const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
      setActiveSourceConfig((prev) => (sameJson(prev, resolved.config) ? prev : resolved.config));
      setAvailableSubtitles((prev) => (sameJson(prev, resolved.subtitles) ? prev : resolved.subtitles));
      setSourcesVersion((v) => v + 1);
      if (serverSignature(resolved.config, episode) !== renderedServerSigRef.current) {
        failoverStartRef.current = 0;
        setActiveServerIdx(0);
        setNativeFailed(false);
        setPlayerEngine('native');
      }
    };
    window.addEventListener(SOURCES_UPDATED_EVENT, handleStorageUpdate);
    return () => window.removeEventListener(SOURCES_UPDATED_EVENT, handleStorageUpdate);
  }, [episode]);

  const availableServers = getAvailableDriveServers(activeSourceConfig, episode.driveLink);
  const currentServer = availableServers[activeServerIdx] || availableServers[0];
  const currentServerSig = availableServers.map((s) => s.url).join('|');

  useEffect(() => {
    renderedServerSigRef.current = currentServerSig;
  }, [currentServerSig]);

  // Determine effective stream source silently
  const configuredDrive = currentServer?.url || activeSourceConfig.driveLink || episode.driveLink || '';
  const isDrive = isGoogleDriveSource(configuredDrive);
  const driveFileId = isDrive ? extractDriveFileId(configuredDrive) : null;

  let streamUrl = episode.videoUrl?.startsWith('/public/')
    ? episode.videoUrl.replace('/public/', '/')
    : episode.videoUrl || '';

  // Direct high-quality download streaming starting with https://drive.google.com/uc?export=download&id=
  if (isDrive && driveFileId) {
    streamUrl = getDriveDirectStreamUrl(driveFileId);
  } else if (configuredDrive) {
    streamUrl = normalizeDriveDirectUrl(configuredDrive);
  }

  const driveEmbedUrl = driveFileId ? getDrivePreviewUrl(driveFileId) : null;
  const hasPlayableSource = Boolean(streamUrl || driveEmbedUrl || !episode.isComingSoon);

  // Episode indices for Prev/Next
  const currentIndex = allEpisodes.findIndex((e) => e.id === episode.id);
  const prevEpisode = currentIndex > 0 ? allEpisodes[currentIndex - 1] : null;
  const nextEpisode = currentIndex < allEpisodes.length - 1 ? allEpisodes[currentIndex + 1] : null;

  // Keep the user's subtitle choice across episodes, but only apply it when this episode has that track
  const effectiveSubtitleLang =
    selectedSubtitleLang !== 'off' && availableSubtitles.some((t) => t.lang === selectedSubtitleLang)
      ? selectedSubtitleLang
      : 'off';
  const preferredSubtitleLang =
    availableSubtitles.find((t) => t.lang === 'ar')?.lang || availableSubtitles[0]?.lang || null;

  // Subtitle tracks: the chosen track is 'hidden' (cues still fire, the browser draws nothing)
  // and only our overlay renders the text. Re-bound whenever the <video> element is recreated.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const textTracks = video.textTracks;

    const handleCueChange = () => {
      let activeText = '';
      for (let i = 0; i < textTracks.length; i++) {
        const track = textTracks[i];
        if (track.mode !== 'disabled' && track.activeCues && track.activeCues.length > 0) {
          for (let j = 0; j < track.activeCues.length; j++) {
            const cue = track.activeCues[j] as VTTCue;
            if (cue && cue.text) {
              activeText += (activeText ? '\n' : '') + cue.text;
            }
          }
        }
      }
      setCurrentSubtitleText(activeText);
    };

    let picked = false;
    for (let i = 0; i < textTracks.length; i++) {
      const track = textTracks[i];
      const use = !picked && effectiveSubtitleLang !== 'off' && track.language === effectiveSubtitleLang;
      if (use) picked = true;
      track.mode = use ? 'hidden' : 'disabled';
      track.oncuechange = handleCueChange;
    }
    handleCueChange();

    return () => {
      for (let i = 0; i < textTracks.length; i++) {
        textTracks[i].oncuechange = null;
      }
    };
  }, [availableSubtitles, effectiveSubtitleLang, streamUrl, playerEngine, hasPlayableSource, nativeFailed, episode.id]);

  // Handle subtitle selection (applied to the tracks by the effect above, no <video> remount)
  const applySubtitleSelection = (lang: string) => {
    setSelectedSubtitleLang(lang);
    setShowSubtitleMenu(false);
    setCurrentSubtitleText('');
  };

  // Initialize playback on episode or source switch
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setCurrentSubtitleText('');

    if (hasPlayableSource && videoRef.current && playerEngine === 'native' && !nativeFailed) {
      videoRef.current.currentTime = 0;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      }
    } else {
      setIsPlaying(false);
    }
  }, [episode.id, streamUrl, hasPlayableSource, playerEngine, nativeFailed]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Fullscreen state follows the browser (Esc exits fullscreen without reaching our key handler)
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video) {
      setDuration(video.duration || 0);
      // A recreated <video> starts with browser defaults; re-apply the user's settings
      video.volume = volume;
      video.muted = isMuted;
      video.playbackRate = playbackSpeed;
    }
  };

  // Direct stream failed: try the next server's direct stream, then the Drive embed player,
  // and finally show an error panel.
  const handleNativeError = () => {
    const n = availableServers.length;
    const start = failoverStartRef.current < n ? failoverStartRef.current : 0;
    for (let step = 1; step < n; step++) {
      const candidate = (activeServerIdx + step) % n;
      if (candidate === start) break;
      if (availableServers[candidate].url !== currentServer?.url) {
        setActiveServerIdx(candidate);
        return;
      }
    }
    const order = [start, ...availableServers.map((_, i) => i).filter((i) => i !== start)];
    const embedIdx = order.find((i) => Boolean(driveIdOf(availableServers[i]?.url || '')));
    if (embedIdx !== undefined) {
      setActiveServerIdx(embedIdx);
      setPlayerEngine('embed');
    } else {
      setNativeFailed(true);
    }
  };

  const selectServer = (idx: number) => {
    failoverStartRef.current = idx;
    setActiveServerIdx(idx);
    setNativeFailed(false);
    setPlayerEngine('native');
  };

  const retryPlayback = () => {
    setActiveServerIdx(failoverStartRef.current < availableServers.length ? failoverStartRef.current : 0);
    setNativeFailed(false);
    setPlayerEngine('native');
  };

  const togglePlay = () => {
    if (!videoRef.current || !hasPlayableSource) return;
    if (videoRef.current.paused) {
      videoRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setPlayFeedback('play');
          setTimeout(() => setPlayFeedback(null), 500);
        })
        .catch(() => setIsPlaying(false));
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      setPlayFeedback('pause');
      setTimeout(() => setPlayFeedback(null), 500);
    }
  };

  const skipSeconds = (seconds: number) => {
    if (!videoRef.current) return;
    const target = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = target;
    setCurrentTime(target);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      setDuration(videoRef.current.duration || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const changePlaybackSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  // State is updated by the 'fullscreenchange' listener, not optimistically
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.()?.catch(() => {});
      return;
    }
    const container = containerRef.current;
    if (container && typeof container.requestFullscreen === 'function') {
      container.requestFullscreen().catch(() => {});
      return;
    }
    // iPhone Safari has no element fullscreen; fall back to the native video fullscreen
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    video?.webkitEnterFullscreen?.();
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Keyboard controls (Space, Arrow keys, F, M, C, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }
      // Ignore keys while focus is inside another dialog layered over the player
      const active = document.activeElement;
      if (active && active !== document.body && rootRef.current && !rootRef.current.contains(active)) {
        return;
      }
      const onButton = target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement;

      // e.code keeps shortcuts working on Arabic keyboard layouts
      if (e.code === 'Space') {
        if (onButton) return; // let the focused button handle its own activation
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        skipSeconds(10);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        skipSeconds(-10);
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        if (effectiveSubtitleLang !== 'off') {
          applySubtitleSelection('off');
        } else if (preferredSubtitleLang) {
          applySubtitleSelection(preferredSubtitleLang);
        }
      } else if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen?.()?.catch(() => {});
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Touch and mouse movement auto-hide controls
  const handleActivity = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlayingRef.current) {
        setShowControls(false);
        setShowSubtitleMenu(false);
        setShowSpeedMenu(false);
      }
    }, 3500);
  };

  // On touch, a tap while the controls are hidden only reveals them (it must not also pause)
  const handleTouchStart = () => {
    if (!showControls && isPlaying) {
      lastTouchRevealRef.current = Date.now();
    }
    handleActivity();
  };

  const handleVideoClick = () => {
    if (Date.now() - lastTouchRevealRef.current < 700) {
      lastTouchRevealRef.current = 0;
      return;
    }
    togglePlay();
  };

  // The episode grid is large (up to 220+ cards); don't rebuild it on every timeupdate
  const episodeGrid = useMemo(
    () =>
      allEpisodes.map((ep) => {
        const isActive = ep.id === episode.id;
        const isComingSoon = !isEpisodePlayable(ep);

        return (
          <div
            key={ep.id}
            onClick={() => {
              if (!isComingSoon) {
                onSelectEpisode(ep);
              }
            }}
            className={`group relative rounded-xl overflow-hidden border p-1.5 transition-all cursor-pointer flex flex-col ${
              isActive
                ? 'bg-rose-950/30 border-rose-500 shadow-md shadow-rose-950/40 ring-1 ring-rose-500'
                : isComingSoon
                ? 'bg-neutral-900/40 border-neutral-800/60 opacity-60'
                : 'bg-neutral-900/80 hover:bg-neutral-850 border-neutral-800 hover:border-neutral-700'
            }`}
          >
            <div className="relative aspect-video rounded-lg overflow-hidden bg-black mb-1.5">
              <img loading="lazy" decoding="async"
                src={ep.thumbnail}
                alt={ep.title}
                className={`w-full h-full object-cover transition-transform duration-300 ${
                  isActive ? 'scale-105' : 'group-hover:scale-105'
                }`}
                referrerPolicy="no-referrer"
              />
              <div className="absolute bottom-1 left-1 px-1 text-[9px] font-mono bg-black/80 text-white rounded">
                {ep.duration}
              </div>

              {isActive && (
                <div className="absolute inset-0 bg-rose-600/30 flex items-center justify-center">
                  <Play className="w-5 h-5 fill-white text-white animate-pulse" />
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="text-[10px] font-mono font-bold text-rose-400 mb-0.5">
                الحلقة {ep.episodeNumber}
              </div>
              <div className="text-[11px] font-bold text-neutral-200 truncate group-hover:text-white">
                {ep.title}
              </div>
            </div>
          </div>
        );
      }),
    // sourcesVersion: re-evaluate playability when admin links change
    [allEpisodes, episode.id, onSelectEpisode, sourcesVersion]
  );

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl p-0 sm:p-4 overflow-y-auto"
      dir="rtl"
    >
      {/* Ambient Cinema Backdrop Glow */}
      <div className="absolute inset-0 bg-radial from-rose-950/20 via-transparent to-black pointer-events-none" />

      {/* Main Cinema Container */}
      <div
        className={`relative w-full bg-neutral-950 border border-neutral-800/80 rounded-none sm:rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.9)] flex flex-col transition-all duration-300 my-auto ${
          isTheaterMode ? 'max-w-[98vw] max-h-[98vh]' : 'max-w-6xl max-h-[94vh]'
        }`}
      >
        {/* Cinema Top Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-neutral-950/90 border-b border-neutral-900 shrink-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-white truncate">
                {seriesTitle} <span className="text-rose-500 mx-1">·</span> {episode.title}
              </h2>
            </div>
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20">
              <Sparkles className="w-3 h-3 text-amber-400" />
              عرض سينمائي HD
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Cinema / Theater Mode toggle */}
            <button
              onClick={() => setIsTheaterMode(!isTheaterMode)}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isTheaterMode
                  ? 'bg-rose-600/20 text-rose-300 border-rose-500/40'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white border-neutral-800'
              }`}
              title="الوضع السينمائي الموسع"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>{isTheaterMode ? 'شاشة قياسية' : 'المسرح السينمائي'}</span>
            </button>

            {/* Discreet Admin Gateway (Only visible if requested or owner clicks) */}
            {onOpenAdmin && (
              <button
                onClick={onOpenAdmin}
                className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl bg-neutral-900/60 hover:bg-neutral-800 text-neutral-500 hover:text-amber-400 transition-colors border border-neutral-800 text-xs font-mono flex items-center gap-1 cursor-pointer"
                title="لوحة تحكم المشرف (خاصة)"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">المشرف</span>
              </button>
            )}

            {/* Close Button */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center border border-neutral-800 transition-colors cursor-pointer"
              title="إغلاق (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Multi-Account Server Switcher Bar (Shown whenever an episode has 2+ Drive links) */}
        {availableServers.length > 1 && (
          <div className="px-4 sm:px-6 py-2 bg-neutral-900/80 border-b border-neutral-800 flex items-center gap-2 overflow-x-auto text-xs shrink-0">
            <span className="text-neutral-400 font-bold shrink-0">سيرفرات التشغيل (حسابات Drive):</span>
            {availableServers.map((srv, idx) => (
              <button
                key={srv.id}
                onClick={() => selectServer(idx)}
                className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer shrink-0 ${
                  activeServerIdx === idx
                    ? 'bg-rose-600 text-white shadow'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border border-neutral-700'
                }`}
              >
                {srv.label}
              </button>
            ))}
          </div>
        )}

        {/* Video Screen Viewport */}
        <div
          ref={containerRef}
          onMouseMove={handleActivity}
          onTouchStart={handleTouchStart}
          className="relative aspect-video w-full max-h-[calc(94vh-8rem)] shrink-0 bg-black flex items-center justify-center overflow-hidden select-none group"
        >
          {playerEngine === 'embed' && driveEmbedUrl ? (
            /* Seamless Cloud Stream Engine (Auto-switched if direct video stream is restricted) */
            <div className="w-full h-full relative">
              <iframe
                src={driveEmbedUrl}
                title={episode.title}
                className="w-full h-full border-0"
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            </div>
          ) : !hasPlayableSource ? (
            /* Coming Soon cinematic banner */
            <div className="relative w-full h-full bg-neutral-950 flex flex-col items-center justify-center text-center p-6">
              <img loading="lazy" decoding="async"
                src={episode.thumbnail}
                alt={episode.title}
                className="absolute inset-0 w-full h-full object-cover opacity-20 blur-sm"
                referrerPolicy="no-referrer"
              />
              <div className="relative z-10 flex flex-col items-center max-w-md">
                <div className="w-16 h-16 rounded-3xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-4 border border-amber-500/30">
                  <Lock className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-white mb-2">{episode.title}</h3>
                <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed mb-4">
                  الحلقة قيد التجهيز بالدبلجة العربية الرسمية وستتوفر قريباً للمشاهدة فور اكتمال معالجة البث!
                </p>
              </div>
            </div>
          ) : nativeFailed ? (
            /* Every server failed to play */
            <div className="relative w-full h-full bg-neutral-950 flex flex-col items-center justify-center text-center p-6">
              <img loading="lazy" decoding="async"
                src={episode.thumbnail}
                alt={episode.title}
                className="absolute inset-0 w-full h-full object-cover opacity-20 blur-sm"
                referrerPolicy="no-referrer"
              />
              <div className="relative z-10 flex flex-col items-center max-w-md">
                <div className="w-14 h-14 rounded-3xl bg-rose-500/20 text-rose-400 flex items-center justify-center mb-3 border border-rose-500/30">
                  <Info className="w-7 h-7" />
                </div>
                <h3 className="text-base sm:text-lg font-black text-white mb-2">تعذر تشغيل الحلقة</h3>
                <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed mb-4">
                  لم نتمكن من تشغيل هذه الحلقة من أي سيرفر متاح حالياً. حاول مرة أخرى بعد قليل أو اختر سيرفراً آخر.
                </p>
                <button
                  onClick={retryPlayback}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  إعادة المحاولة
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Native Cinema <video> Player */}
              <video
                key={streamUrl}
                ref={videoRef}
                src={streamUrl}
                poster={episode.thumbnail}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => {
                  setIsPlaying(false);
                  if (nextEpisode && isEpisodePlayable(nextEpisode)) {
                    onSelectEpisode(nextEpisode);
                  }
                }}
                onError={handleNativeError}
                onClick={handleVideoClick}
                className="w-full h-full object-contain cursor-pointer"
                playsInline
                preload="metadata"
              >
                {streamUrl && <source src={streamUrl} type="video/mp4" />}
                {streamUrl && <source src={streamUrl} type="video/webm" />}

                {/* Subtitle tracks */}
                {availableSubtitles.map((track) => (
                  <track
                    key={track.id}
                    kind="subtitles"
                    src={track.src}
                    srcLang={track.lang}
                    label={track.label}
                  />
                ))}
              </video>

              {/* Subtitle Cinema Overlay Box */}
              {effectiveSubtitleLang !== 'off' && currentSubtitleText && (
                <div className="absolute bottom-20 sm:bottom-24 left-6 right-6 flex justify-center pointer-events-none z-20">
                  <div
                    className="max-w-3xl px-5 py-2 rounded-2xl bg-black/85 text-white text-center text-sm sm:text-lg font-bold border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.8)] backdrop-blur-md whitespace-pre-line leading-relaxed tracking-wide text-shadow"
                    dir="auto"
                  >
                    {currentSubtitleText}
                  </div>
                </div>
              )}

              {/* Center Play/Pause Ripple Feedback Icon */}
              {playFeedback && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-out fade-out zoom-out duration-500">
                  <div className="w-20 h-20 rounded-full bg-black/70 text-white flex items-center justify-center border border-white/20 shadow-2xl">
                    {playFeedback === 'play' ? (
                      <Play className="w-10 h-10 fill-white translate-x-1" />
                    ) : (
                      <Pause className="w-10 h-10 fill-white" />
                    )}
                  </div>
                </div>
              )}

              {/* Big Center Play Button if paused */}
              {!isPlaying && !playFeedback && (
                <button
                  onClick={togglePlay}
                  className="absolute inset-0 flex items-center justify-center bg-black/35 cursor-pointer z-10"
                >
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-2xl hover:scale-110 transition-transform">
                    <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-white translate-x-0.5" />
                  </div>
                </button>
              )}

              {/* Custom Cinema Controls Bar (Auto-hiding) */}
              <div
                className={`absolute bottom-0 left-0 right-0 p-3 sm:p-5 bg-gradient-to-t from-black/95 via-black/80 to-transparent flex flex-col gap-2.5 transition-opacity duration-300 z-30 ${
                  showControls || !isPlaying
                    ? 'opacity-100 pointer-events-auto'
                    : 'opacity-0 pointer-events-none'
                }`}
              >
                {/* Timeline Progress Bar */}
                <div className="flex items-center gap-2 group/bar">
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1.5 sm:h-2 bg-neutral-700/80 rounded-lg appearance-none cursor-pointer accent-rose-500 group-hover/bar:h-2.5 transition-all"
                  />
                </div>

                {/* Main Controls Row */}
                <div className="flex items-center justify-between text-xs text-white">
                  {/* Left Controls: Play, 10s skips, Volume, Timers */}
                  <div className="flex items-center gap-2 sm:gap-4">
                    <button
                      onClick={togglePlay}
                      className="p-1.5 sm:p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                      title={isPlaying ? 'إيقاف مؤقت (Space)' : 'تشغيل (Space)'}
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5" />
                      ) : (
                        <Play className="w-5 h-5 fill-white" />
                      )}
                    </button>

                    {/* 10s Rewind / Fast-forward */}
                    <button
                      onClick={() => skipSeconds(-10)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                      title="ترجيع 10 ثواني (سهم يسار)"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => skipSeconds(10)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                      title="تقديم 10 ثواني (سهم يمين)"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>

                    {/* Volume control */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={toggleMute}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                        title={isMuted ? 'إلغاء الكتم (M)' : 'كتم الصوت (M)'}
                      >
                        {isMuted ? (
                          <VolumeX className="w-4 h-4 text-rose-500" />
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="w-14 sm:w-20 h-1 bg-neutral-600 rounded cursor-pointer accent-rose-500 hidden sm:inline-block"
                      />
                    </div>

                    {/* Timers */}
                    <div className="text-[11px] font-mono text-neutral-300 tabular-nums">
                      {formatTime(currentTime)}{' '}
                      <span className="text-neutral-500">/</span> {formatTime(duration)}
                    </div>
                  </div>

                  {/* Right Controls: Subtitles, Speed, Prev/Next, Fullscreen */}
                  <div className="flex items-center gap-2 sm:gap-3 relative">
                    {/* Subtitle Selector (only when the episode has real subtitle tracks) */}
                    {availableSubtitles.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => {
                          setShowSubtitleMenu(!showSubtitleMenu);
                          setShowSpeedMenu(false);
                        }}
                        className={`p-1.5 sm:px-2.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 ${
                          effectiveSubtitleLang !== 'off'
                            ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-950'
                            : 'bg-black/50 hover:bg-neutral-800 text-neutral-300 border-white/10'
                        }`}
                        title="الترجمة (C)"
                      >
                        <Subtitles className="w-4 h-4" />
                        <span className="text-[11px] font-bold uppercase hidden md:inline">
                          {effectiveSubtitleLang === 'off' ? 'ترجمة' : effectiveSubtitleLang}
                        </span>
                      </button>

                      {showSubtitleMenu && (
                        <div className="absolute bottom-12 left-0 w-48 bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl p-2 z-50 text-right animate-in fade-in">
                          <div className="text-[10px] font-bold text-neutral-400 px-2 py-1 border-b border-neutral-800 mb-1">
                            خيارات الترجمة (VTT)
                          </div>
                          <button
                            onClick={() => applySubtitleSelection('off')}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                              effectiveSubtitleLang === 'off'
                                ? 'bg-rose-600 text-white font-bold'
                                : 'text-neutral-300 hover:bg-neutral-800'
                            }`}
                          >
                            <span>إيقاف الترجمة</span>
                            {effectiveSubtitleLang === 'off' && <Check className="w-3.5 h-3.5" />}
                          </button>

                          {availableSubtitles.map((track) => (
                            <button
                              key={track.id}
                              onClick={() => applySubtitleSelection(track.lang)}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                                effectiveSubtitleLang === track.lang
                                  ? 'bg-rose-600 text-white font-bold'
                                  : 'text-neutral-300 hover:bg-neutral-800'
                              }`}
                            >
                              <span>{track.label}</span>
                              {effectiveSubtitleLang === track.lang && <Check className="w-3.5 h-3.5" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    )}

                    {/* Speed Selector */}
                    <div className="relative">
                      <button
                        onClick={() => {
                          setShowSpeedMenu(!showSpeedMenu);
                          setShowSubtitleMenu(false);
                        }}
                        className="p-1.5 sm:px-2 rounded-xl bg-black/50 hover:bg-neutral-800 text-neutral-300 border border-white/10 text-xs font-mono transition-colors cursor-pointer"
                        title="سرعة التشغيل"
                      >
                        {playbackSpeed}x
                      </button>

                      {showSpeedMenu && (
                        <div className="absolute bottom-12 left-0 w-28 bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl p-1.5 z-50 animate-in fade-in">
                          {[0.75, 1, 1.25, 1.5, 2].map((spd) => (
                            <button
                              key={spd}
                              onClick={() => changePlaybackSpeed(spd)}
                              className={`w-full text-center py-1 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                                playbackSpeed === spd
                                  ? 'bg-rose-600 text-white font-bold'
                                  : 'text-neutral-300 hover:bg-neutral-800'
                              }`}
                            >
                              {spd}x
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Fullscreen Button */}
                    <button
                      onClick={toggleFullscreen}
                      className="p-1.5 sm:p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                      title="شاشة كاملة (F)"
                    >
                      {isFullscreen ? (
                        <Minimize className="w-4 h-4 sm:w-5 sm:h-5" />
                      ) : (
                        <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Pure Viewer Details & Episode Selection Panel */}
        <div className="flex-1 min-h-0 p-4 sm:p-6 bg-neutral-950 border-t border-neutral-900 overflow-y-auto space-y-6">
          {/* Episode Title & Description */}
          <div className="flex flex-col lg:flex-row items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-rose-600/20 text-rose-400 border border-rose-500/30">
                  الحلقة {episode.episodeNumber}
                </span>
                <span className="text-xs font-mono text-neutral-400">
                  {episode.duration}
                </span>
                <span className="text-xs text-neutral-500">·</span>
                <span className="text-xs text-rose-400 font-semibold">
                  {episode.dubStudio}
                </span>
              </div>

              <h3 className="text-lg sm:text-xl font-black text-white">{episode.title}</h3>
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed max-w-4xl">
                {episode.description}
              </p>

              {/* Voice Actors */}
              <div className="flex flex-wrap items-center gap-1.5 pt-2">
                <span className="text-xs font-bold text-neutral-400 ml-1">الأداء الصوتي:</span>
                {episode.voiceActors.map((actor, idx) => (
                  <span
                    key={idx}
                    className="text-[11px] font-medium bg-neutral-900 text-neutral-300 border border-neutral-800 px-2 py-0.5 rounded-lg"
                  >
                    {actor}
                  </span>
                ))}
              </div>
            </div>

            {/* Quick Next/Prev Navigation Buttons */}
            <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
              {prevEpisode && (
                <button
                  onClick={() => onSelectEpisode(prevEpisode)}
                  className="px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-850 text-neutral-300 hover:text-white border border-neutral-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                  <span>الحلقة السابقة</span>
                </button>
              )}

              {nextEpisode && isEpisodePlayable(nextEpisode) && (
                <button
                  onClick={() => onSelectEpisode(nextEpisode)}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-rose-950 transition-all cursor-pointer hover:scale-105"
                >
                  <span>الحلقة التالية</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Episode Carousel / Grid for Seamless Switching */}
          <div className="pt-4 border-t border-neutral-900">
            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-rose-500" />
              <span>حلقات المسلسل ({allEpisodes.length})</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {episodeGrid}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
