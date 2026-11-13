import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Film,
  Cloud,
  Check,
  AlertCircle,
  Copy,
  Trash2,
  RefreshCw,
  Upload,
  Play,
  FileText,
  X,
  ExternalLink,
  Save,
  Download,
  FolderOpen,
  Info,
  Tv,
  CheckCircle2,
  Layers,
  Plus,
  Lock,
  KeyRound,
  Eye,
  EyeOff
} from 'lucide-react';
import { DUBBED_WORKS, ANIME_WORKS, MOVIES_WORKS, ALL_MEDIA_WORKS, DubSeries, DubEpisode } from '../data/mockData.ts';
import {
  extractDriveFileId,
  isGoogleDriveSource,
  getDriveDirectStreamUrl,
  normalizeDriveDirectUrl,
  getDrivePreviewUrl,
  getCustomEpisodeSource,
  saveCustomEpisodeSource,
  removeCustomEpisodeSource,
  getAllCustomEpisodeSources,
  exportCustomSourcesBackup,
  downloadEpisodeSourcesBackupFile,
  importCustomSourcesBackup,
  syncAllLocalSourcesToCloud,
  convertSrtToVtt,
  createVttBlobUrl,
  BackupDriveLink,
  SubtitleTrack,
  DEFAULT_SUBTITLE_TRACKS,
  SOURCES_UPDATED_EVENT
} from '../utils/videoSource';
import { User } from 'firebase/auth';
import {
  ADMIN_EMAIL,
  isVerifiedAdminUser,
  signInWithGoogleAdmin,
  signOutAdmin,
  subscribeAuthState,
} from '../firebase.ts';
import {
  CUSTOM_WORKS_UPDATED_EVENT,
  getCustomSeriesByCategory,
} from '../utils/customWorks.ts';
import {
  AccessGateConfig,
  clearStoredAccessUnlock,
  fetchAccessGateConfig,
  getDefaultAccessGateConfig,
  saveAccessGateSettings,
} from '../utils/accessGate.ts';

interface AdminMediaDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  initialSeriesId?: string;
  initialEpisodeId?: string;
  onOpenCreateWork?: () => void;
}

export const AdminMediaDashboard: React.FC<AdminMediaDashboardProps> = ({
  isOpen,
  onClose,
  initialSeriesId,
  initialEpisodeId,
  onOpenCreateWork,
}) => {
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>(
    initialSeriesId || ALL_MEDIA_WORKS[0].id
  );
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>('');
  const [driveInputLink, setDriveInputLink] = useState<string>('');
  const [accountLabelInput, setAccountLabelInput] = useState<string>('');
  const [backupLinks, setBackupLinks] = useState<BackupDriveLink[]>([]);
  const [arabicVttInput, setArabicVttInput] = useState<string>('/subtitles/arabic.vtt');
  const [englishVttInput, setEnglishVttInput] = useState<string>('/subtitles/english.vtt');
  const [customTracks, setCustomTracks] = useState<SubtitleTrack[]>([]);
  const [activeTab, setActiveTab] = useState<'editor' | 'overview' | 'backup' | 'security'>('editor');
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [testPlayActive, setTestPlayActive] = useState<boolean>(false);
  const [backupJson, setBackupJson] = useState<string>('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [, setVersionTick] = useState<number>(0);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncingCloud, setSyncingCloud] = useState<boolean>(false);

  // Access Gate security state
  const [gateConfig, setGateConfig] = useState<AccessGateConfig>(getDefaultAccessGateConfig());
  const [gateEnabledInput, setGateEnabledInput] = useState<boolean>(true);
  const [newPasscodeInput, setNewPasscodeInput] = useState<string>('');
  const [showNewPasscode, setShowNewPasscode] = useState<boolean>(false);
  const [savingGate, setSavingGate] = useState<boolean>(false);
  const [gateError, setGateError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleUpdate = () => setVersionTick((v) => v + 1);
    window.addEventListener(SOURCES_UPDATED_EVENT, handleUpdate);
    window.addEventListener(CUSTOM_WORKS_UPDATED_EVENT, handleUpdate);
    const unsubAuth = subscribeAuthState((user, ready) => {
      setAuthUser(user);
      setAuthReady(ready);
      if (user && isVerifiedAdminUser(user)) {
        void syncAllLocalSourcesToCloud().catch((err) => {
          console.error('Auto cloud migration error:', err);
        });
      }
    });
    return () => {
      window.removeEventListener(SOURCES_UPDATED_EVENT, handleUpdate);
      window.removeEventListener(CUSTOM_WORKS_UPDATED_EVENT, handleUpdate);
      unsubAuth();
    };
  }, []);

  useEffect(() => {
    if (isOpen && initialSeriesId) {
      setSelectedSeriesId(initialSeriesId);
    }
    if (isOpen) {
      void fetchAccessGateConfig()
        .then((cfg) => {
          setGateConfig(cfg);
          setGateEnabledInput(cfg.enabled);
          setGateError(null);
        })
        .catch(() => {
          // Keep default config UI on offline/read errors
        });
    }
  }, [isOpen, initialSeriesId]);

  const dynamicAnimeWorks = [...ANIME_WORKS, ...getCustomSeriesByCategory('anime')];
  const dynamicMovieWorks = [...MOVIES_WORKS, ...getCustomSeriesByCategory('movie')];
  const dynamicDubbedWorks = [...DUBBED_WORKS, ...getCustomSeriesByCategory('dubbed')];
  const dynamicAllMediaWorks = [
    ...dynamicDubbedWorks,
    ...dynamicAnimeWorks,
    ...dynamicMovieWorks,
  ];

  const selectedSeries =
    dynamicAllMediaWorks.find((s) => s.id === selectedSeriesId) || dynamicAllMediaWorks[0];
  const allEpisodes = React.useMemo(() => {
    if (!selectedSeries) return [];
    if (selectedSeries.seasons && selectedSeries.seasons.length > 0) {
      return selectedSeries.seasons.flatMap((s) => s.episodes || []);
    }
    return selectedSeries.episodes || [];
  }, [selectedSeries]);

  // Initialize selected episode
  useEffect(() => {
    if (initialEpisodeId && allEpisodes.some((e) => e.id === initialEpisodeId)) {
      setSelectedEpisodeId(initialEpisodeId);
    } else if (allEpisodes.length > 0 && !allEpisodes.some((e) => e.id === selectedEpisodeId)) {
      setSelectedEpisodeId(allEpisodes[0].id);
    }
  }, [selectedSeriesId, initialEpisodeId, allEpisodes]);

  const currentEpisode =
    allEpisodes.find((e) => e.id === selectedEpisodeId) || allEpisodes[0];

  // Load existing configuration whenever selected episode changes
  useEffect(() => {
    if (!currentEpisode) return;
    const saved = getCustomEpisodeSource(currentEpisode.id);
    if (saved) {
      setDriveInputLink(saved.driveLink || '');
      setAccountLabelInput(saved.accountLabel || '');
      setBackupLinks(Array.isArray(saved.backupDriveLinks) ? saved.backupDriveLinks : []);
      const arSub = saved.subtitles?.find((s) => s.lang === 'ar')?.src || '/subtitles/arabic.vtt';
      const enSub = saved.subtitles?.find((s) => s.lang === 'en')?.src || '/subtitles/english.vtt';
      setArabicVttInput(arSub);
      setEnglishVttInput(enSub);
      const others = saved.subtitles?.filter((s) => s.lang !== 'ar' && s.lang !== 'en') || [];
      setCustomTracks(others);
    } else {
      setDriveInputLink(currentEpisode.driveLink || '');
      setAccountLabelInput('');
      setBackupLinks([]);
      setArabicVttInput('/subtitles/arabic.vtt');
      setEnglishVttInput('/subtitles/english.vtt');
      setCustomTracks([]);
    }
    setTestPlayActive(false);
  }, [selectedEpisodeId, currentEpisode]);

  if (!isOpen) return null;

  const fileId = extractDriveFileId(driveInputLink);
  const isValidDrive = Boolean(fileId);
  const directStreamUrl = fileId ? getDriveDirectStreamUrl(fileId) : '';
  const previewEmbedUrl = fileId ? getDrivePreviewUrl(fileId) : '';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEpisode) return;

    const trimmedLink = driveInputLink.trim();
    const normalizedDriveLink = fileId
      ? `https://drive.google.com/uc?export=download&id=${fileId}`
      : normalizeDriveDirectUrl(trimmedLink);

    const subs: SubtitleTrack[] = [
      {
        id: 'sub-ar',
        lang: 'ar',
        label: 'العربية (Arabic)',
        src: arabicVttInput.trim() || '/subtitles/arabic.vtt',
        default: true,
      },
      {
        id: 'sub-en',
        lang: 'en',
        label: 'English (الإنجليزية)',
        src: englishVttInput.trim() || '/subtitles/english.vtt',
        default: false,
      },
      ...customTracks,
    ];

    const result = await saveCustomEpisodeSource(currentEpisode.id, {
      driveLink: normalizedDriveLink,
      videoUrl: normalizedDriveLink,
      accountLabel: accountLabelInput.trim(),
      backupDriveLinks: backupLinks,
      subtitles: subs,
    });

    setDriveInputLink(normalizedDriveLink);
    if (result.savedToCloud) {
      setSaveToast(`تم الحفظ الدائم للحلقة (${currentEpisode.title}) في سحابة Firebase للأبد بنجاح!`);
    } else if (result.savedToServer) {
      setSaveToast(`تم الحفظ على السيرفر المؤقت فقط — سجّل الدخول بحساب Google لحفظ الحلقة في سحابة Firebase للأبد!`);
    } else {
      setSaveToast(`تم الحفظ في المتصفح مؤقتاً — يرجى تسجيل الدخول بحساب Google للحفظ الدائم في السحابة.`);
    }
    setTimeout(() => setSaveToast(null), 5000);
  };

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const user = await signInWithGoogleAdmin();
      if (isVerifiedAdminUser(user)) {
        const { syncedCount } = await syncAllLocalSourcesToCloud();
        setSaveToast(
          syncedCount > 0
            ? `تم تسجيل الدخول ورفع ${syncedCount} روابط سابقة إلى سحابة Firebase للأبد!`
            : 'تم تسجيل الدخول! أي رابط تحفظه الآن يُخزَّن في سحابة Firebase للأبد.'
        );
        setTimeout(() => setSaveToast(null), 4500);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول عبر Google');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleManualCloudSync = async () => {
    setSyncingCloud(true);
    setAuthError(null);
    try {
      const { syncedCount } = await syncAllLocalSourcesToCloud();
      setSaveToast(
        syncedCount > 0
          ? `تمت مزامنة ${syncedCount} حلقة إلى سحابة Firebase الدائمة بنجاح!`
          : 'جميع روابطك محفوظة بالفعل ومزامنة في سحابة Firebase الدائمة!'
      );
      setTimeout(() => setSaveToast(null), 4000);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'حدث خطأ أثناء المزامنة مع السحابة');
    } finally {
      setSyncingCloud(false);
    }
  };

  const handleResetToDefault = async () => {
    if (!currentEpisode) return;
    if (window.confirm('هل أنت متأكد من حذف تخصيص هذا الرابط واستعادة الإعدادات الأصلية للحلقة؟')) {
      await removeCustomEpisodeSource(currentEpisode.id);
      setDriveInputLink(currentEpisode.driveLink || '');
      setAccountLabelInput('');
      setBackupLinks([]);
      setArabicVttInput('/subtitles/arabic.vtt');
      setEnglishVttInput('/subtitles/english.vtt');
      setCustomTracks([]);
      setSaveToast('تمت استعادة الإعدادات الأصلية للحلقة وحذف التخصيص من السيرفر بنجاح.');
      setTimeout(() => setSaveToast(null), 3500);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      let vttText = content;
      if (file.name.endsWith('.srt')) {
        vttText = convertSrtToVtt(content);
      }
      const blobUrl = createVttBlobUrl(vttText);
      const newTrack: SubtitleTrack = {
        id: `custom-track-${Date.now()}`,
        lang: `custom-${Date.now()}`,
        label: file.name.slice(0, 20),
        src: blobUrl,
      };

      setCustomTracks((prev) => [newTrack, ...prev]);
      setSaveToast(`تم تحميل ملف الترجمة (${file.name}) بنجاح`);
      setTimeout(() => setSaveToast(null), 3000);
    };
    reader.readAsText(file);
  };

  const handleExportBackup = () => {
    const json = exportCustomSourcesBackup();
    setBackupJson(json);
  };

  const handleImportBackup = async () => {
    if (!backupJson.trim()) return;
    const ok = await importCustomSourcesBackup(backupJson, 'merge');
    if (ok) {
      setImportStatus('تم استيراد ودمج الروابط وحفظها تلقائياً على السيرفر وفي ملفات المشروع بنجاح!');
      setBackupJson(exportCustomSourcesBackup());
      setTimeout(() => setImportStatus(null), 4000);
    } else {
      setImportStatus('خطأ: صيغة JSON غير صالحة. يرجى التأكد من صحة البيانات.');
    }
  };

  const handleBackupFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const content = ev.target?.result as string;
      if (!content) return;
      const ok = await importCustomSourcesBackup(content, 'merge');
      if (ok) {
        setBackupJson(exportCustomSourcesBackup());
        setImportStatus('تم رفع ملف النسخة الاحتياطية وحفظ كافة الروابط على السيرفر بنجاح!');
        setTimeout(() => setImportStatus(null), 4000);
      } else {
        setImportStatus('خطأ: ملف النسخة الاحتياطية لا يحتوي على بيانات JSON صالحة.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const allSavedConfigs = getAllCustomEpisodeSources();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2 sm:p-4 backdrop-blur-md overflow-y-auto"
      dir="rtl"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".vtt,.srt,text/vtt"
        onChange={handleFileUpload}
        className="hidden"
      />
      <input
        ref={backupFileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleBackupFileUpload}
        className="hidden"
      />

      <div className="relative w-full max-w-4xl bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl flex flex-col my-auto max-h-[92vh] overflow-hidden text-neutral-100">
        {/* Toast */}
        {saveToast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-neutral-950 font-bold px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs sm:text-sm animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span>{saveToast}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800 bg-neutral-950">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-600/20 text-rose-500 border border-rose-500/30 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white">
                  لوحة تحكم المشرف (Admin Media Dashboard)
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  لوحة خاصة غير مرئية للزوار
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                إدارة روابط Google Drive ومسارات الترجمة VTT في خلفية الموقع ليتم تشغيلها تلقائياً
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Firebase Permanent Cloud Sync & Admin Auth Bar */}
        <div className="px-5 py-2.5 border-b border-neutral-800 bg-neutral-900/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          {!authReady ? (
            <span className="text-neutral-400">جاري التحقق من اتصال السحابة الدائمة...</span>
          ) : isVerifiedAdminUser(authUser) ? (
            <>
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  متصل بسحابة Firebase الدائمة ({authUser?.email}) — كل رابط تحفظه يُخزَّن للأبد ويظهر لجميع الزوار!
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {onOpenCreateWork && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCreateWork();
                    }}
                    className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer shadow"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة عمل جديد</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleManualCloudSync}
                  disabled={syncingCloud}
                  className="px-3 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-bold text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingCloud ? 'animate-spin' : ''}`} />
                  <span>{syncingCloud ? 'جاري المزامنة...' : 'مزامنة للسحابة الآن'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void signOutAdmin()}
                  className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 font-bold text-[11px] cursor-pointer"
                >
                  خروج
                </button>
              </div>
            </>
          ) : authUser ? (
            <>
              <div className="flex items-center gap-2 text-amber-300 font-bold">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  أنت مسجل بحساب ({authUser.email})، لكن الحفظ في سحابة Firebase مخصص لحساب المشرف ({ADMIN_EMAIL}).
                </span>
              </div>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={authLoading}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-[11px] cursor-pointer shrink-0"
              >
                {authLoading ? 'جاري التبديل...' : 'تبديل إلى حساب المشرف'}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-blue-300 font-bold">
                <Cloud className="w-4 h-4 shrink-0 text-blue-400" />
                <span>
                  سجّل الدخول بحساب Google ({ADMIN_EMAIL}) لتفعيل الحفظ السحابي الدائم في Firebase للأبد.
                </span>
              </div>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={authLoading}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer shrink-0 shadow"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>{authLoading ? 'جاري فتح نافذة Google...' : 'تسجيل الدخول بحساب Google (حفظ للأبد)'}</span>
              </button>
            </>
          )}
        </div>
        {authError && (
          <div className="px-5 py-2 bg-rose-950/60 border-b border-rose-500/30 text-rose-300 text-xs font-bold">
            {authError}
          </div>
        )}

        {/* Sub-nav Tabs */}
        <div className="flex border-b border-neutral-800 bg-neutral-950/50 px-5 text-xs font-bold">
          <button
            onClick={() => setActiveTab('editor')}
            className={`py-3 px-4 border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'editor'
                ? 'border-rose-500 text-rose-500'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>ربط وتعديل الحلقات</span>
          </button>

          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-4 border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'border-rose-500 text-rose-500'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>نظرة عامة على المكتبة ({Object.keys(allSavedConfigs).length} مخصصة)</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('backup');
              handleExportBackup();
            }}
            className={`py-3 px-4 border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'backup'
                ? 'border-rose-500 text-rose-500'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>النسخ الاحتياطي والاستيراد</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`py-3 px-4 border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'security'
                ? 'border-rose-500 text-rose-500'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>رمز الدخول والقفل</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {activeTab === 'editor' && (
            <div className="space-y-5">
              {/* Selectors Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-950 p-3.5 rounded-xl border border-neutral-800">
                <div>
                  <label className="text-xs font-bold text-neutral-300 block mb-1">
                    اختر العمل (أنمي / فيلم / مسلسل):
                  </label>
                  <select
                    value={selectedSeriesId}
                    onChange={(e) => setSelectedSeriesId(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer"
                  >
                    <optgroup label="🌸 قسم الأنمي">
                      {dynamicAnimeWorks.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title} ({s.episodes.length} حلقة)
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="🎬 قسم الأفلام السينمائية">
                      {dynamicMovieWorks.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title} (فيلم كامل)
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="🎙️ الأعمال والمسلسلات المدبلجة">
                      {dynamicDubbedWorks.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title} ({s.episodesCount || s.episodes.length} حلقة · {s.seasons.length} {s.seasons.length === 1 ? 'موسم' : 'مواسم'})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-neutral-300 block mb-1">
                    اختر الحلقة المراد ربطها:
                  </label>
                  <select
                    value={selectedEpisodeId}
                    onChange={(e) => setSelectedEpisodeId(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer"
                  >
                    {selectedSeries.seasons && selectedSeries.seasons.length > 1 ? (
                      selectedSeries.seasons.map((season) => (
                        <optgroup
                          key={season.id}
                          label={`📺 ${season.title} (${season.episodes.length} حلقة)`}
                        >
                          {season.episodes.map((ep) => {
                            const isLinked = Boolean(allSavedConfigs[ep.id]?.driveLink);
                            return (
                              <option key={ep.id} value={ep.id}>
                                الحلقة {ep.episodeNumber}: {ep.title} {isLinked ? '⭐ (مربوطة بدرايف)' : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                      ))
                    ) : (
                      allEpisodes.map((ep) => {
                        const isLinked = Boolean(allSavedConfigs[ep.id]?.driveLink);
                        return (
                          <option key={ep.id} value={ep.id}>
                            الحلقة {ep.episodeNumber}: {ep.title} {isLinked ? '⭐ (مربوطة بدرايف)' : ''}
                          </option>
                        );
                      })
                    )}
                  </select>
                </div>
              </div>

              {/* Current Episode Header Info */}
              {currentEpisode && (
                <div className="flex items-center gap-3 p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/80">
                  <div className="w-20 aspect-video rounded-lg overflow-hidden shrink-0 bg-neutral-800">
                    <img
                      src={currentEpisode.thumbnail}
                      alt={currentEpisode.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold text-rose-500">
                        الحلقة {currentEpisode.episodeNumber}
                      </span>
                      <span className="text-neutral-500 text-xs">·</span>
                      <span className="text-xs text-neutral-400 font-mono">
                        {currentEpisode.duration}
                      </span>
                      {allSavedConfigs[currentEpisode.id]?.driveLink ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          مربوطة بسحابة Google Drive في الخلفية
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                          المصدر الافتراضي المدمج
                        </span>
                      )}
                    </div>
                    <h3 className="text-xs sm:text-sm font-bold text-white truncate mt-0.5">
                      {currentEpisode.title}
                    </h3>
                  </div>
                </div>
              )}

              {/* Editor Form */}
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
                      <Cloud className="w-4 h-4 text-blue-400" />
                      <span>رابط فيديو Google Drive المباشر (أعلى جودة أصلية بدون ضغط):</span>
                    </label>
                    {isValidDrive && (
                      <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>معرّف الملف: {fileId}</span>
                      </span>
                    )}
                  </div>

                  <input
                    type="text"
                    value={driveInputLink}
                    onChange={(e) => setDriveInputLink(e.target.value)}
                    placeholder="https://drive.google.com/uc?export=download&id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OGvE2upms"
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder:text-neutral-600 focus:outline-none focus:border-rose-500"
                    dir="ltr"
                  />

                  {isValidDrive && (
                    <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="font-mono text-[11px] truncate" dir="ltr">
                          https://drive.google.com/uc?export=download&id={fileId}
                        </span>
                      </div>
                      <span className="shrink-0 text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                        بث مباشر أصلي (Full Quality HD)
                      </span>
                    </div>
                  )}

                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    يدعم الروابط من <strong>أي حساب Google Drive</strong> (فقط تأكد من تفعيل خيار «أي شخص لديه الرابط» في درايف). ويتم تحويل أي رابط تلقائياً لأعلى جودة أصلية.
                  </p>
                </div>

                {/* Google Drive Account Label & Multi-Account Backup Mirrors */}
                <div className="p-3.5 bg-neutral-950/80 border border-neutral-800 rounded-xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-bold text-neutral-200">
                      اسم أو رقم حساب Google Drive (اختياري لترتيب حساباتك):
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {['حساب 1', 'حساب 2', 'حساب 3', 'حساب 4'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setAccountLabelInput(preset)}
                          className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer border ${
                            accountLabelInput === preset
                              ? 'bg-blue-600 text-white border-blue-500'
                              : 'bg-neutral-900 text-neutral-400 hover:text-white border-neutral-700'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <input
                    type="text"
                    value={accountLabelInput}
                    onChange={(e) => setAccountLabelInput(e.target.value)}
                    placeholder="مثال: حساب درايف 2 أو البريد الخاص بالحساب"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-500"
                  />

                  <div className="pt-2 border-t border-neutral-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-300">
                        روابط احتياطية إضافية لنفس الحلقة (من حسابات Drive أخرى):
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setBackupLinks((prev) => [
                            ...prev,
                            {
                              id: `backup-${Date.now()}`,
                              url: '',
                              accountLabel: `حساب ${prev.length + 2}`,
                            },
                          ])
                        }
                        className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة رابط من حساب آخر</span>
                      </button>
                    </div>

                    {backupLinks.map((b, idx) => (
                      <div key={b.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-neutral-900/70 p-2 rounded-lg border border-neutral-800">
                        <input
                          type="text"
                          value={b.accountLabel || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBackupLinks((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, accountLabel: val } : item))
                            );
                          }}
                          placeholder={`حساب ${idx + 2}`}
                          className="sm:col-span-3 bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                        />
                        <input
                          type="text"
                          value={b.url}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBackupLinks((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, url: val } : item))
                            );
                          }}
                          placeholder="ضع رابط Google Drive الاحتياطي هنا..."
                          className="sm:col-span-8 bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() => setBackupLinks((prev) => prev.filter((_, i) => i !== idx))}
                          className="sm:col-span-1 p-1.5 rounded-lg bg-neutral-800 hover:bg-rose-600/30 text-neutral-400 hover:text-rose-400 flex items-center justify-center cursor-pointer"
                          title="حذف الرابط الاحتياطي"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Subtitle Configuration */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-neutral-300 block">
                      مسار الترجمة العربية (VTT):
                    </label>
                    <input
                      type="text"
                      value={arabicVttInput}
                      onChange={(e) => setArabicVttInput(e.target.value)}
                      placeholder="/subtitles/arabic.vtt"
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-rose-500"
                      dir="ltr"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-neutral-300 block">
                      مسار الترجمة الإنجليزية (VTT):
                    </label>
                    <input
                      type="text"
                      value={englishVttInput}
                      onChange={(e) => setEnglishVttInput(e.target.value)}
                      placeholder="/subtitles/english.vtt"
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-rose-500"
                      dir="ltr"
                    />
                  </div>
                </div>

                {/* Custom Tracks List & Upload */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-rose-400 border border-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>رفع ملف ترجمة محلي (.vtt أو .srt)</span>
                  </button>

                  {customTracks.length > 0 && (
                    <span className="text-[11px] text-neutral-400">
                      يوجد {customTracks.length} مسار ترجمة مخصص مضاف
                    </span>
                  )}
                </div>

                {/* Live Test Preview Toggle */}
                {isValidDrive && (
                  <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                        <Play className="w-3.5 h-3.5 text-rose-500" />
                        <span>فحص واختبار البث المباشر الأصلي (Admin Test Player)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setTestPlayActive(!testPlayActive)}
                        className="text-xs font-bold text-rose-400 hover:text-rose-300 underline cursor-pointer"
                      >
                        {testPlayActive ? 'إخفاء المعاينة' : 'تشغيل معاينة فورية'}
                      </button>
                    </div>

                    {testPlayActive && (
                      <div className="aspect-video w-full rounded-lg overflow-hidden bg-black mt-2">
                        <video
                          controls
                          src={directStreamUrl}
                          className="w-full h-full object-contain"
                          playsInline
                        >
                          <source src={directStreamUrl} type="video/mp4" />
                        </video>
                      </div>
                    )}
                  </div>
                )}

                {/* Form Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-800">
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-950 transition-all flex items-center gap-2 cursor-pointer hover:scale-105 active:scale-95"
                    >
                      <Save className="w-4 h-4" />
                      <span>حفظ وتفعيل للحلقة فورياً</span>
                    </button>

                    {allSavedConfigs[currentEpisode.id] && (
                      <button
                        type="button"
                        onClick={handleResetToDefault}
                        className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-rose-400 hover:text-rose-300 font-bold text-xs rounded-xl border border-neutral-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>استرجاع المصدر الأصلي</span>
                      </button>
                    )}
                  </div>

                  <span className="text-[11px] text-emerald-400/90 font-medium">
                    يُحفظ الرابط تلقائياً وبشكل دائم في ملفات السيرفر والموقع ولن يضيع عند تحديث الصفحة أو تغيير المتصفح.
                  </span>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    نظرة عامة على مصادر الحلقات في المنصة
                  </h3>
                  <p className="text-xs text-neutral-400">
                    يمكنك معرفة الحلقات المرتبطة بروابط Google Drive أو الملفات المحلية
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {dynamicAllMediaWorks.map((series) => {
                  const seriesEpisodes =
                    series.seasons && series.seasons.length > 0
                      ? series.seasons.flatMap((s) => s.episodes || [])
                      : (series.episodes || []);

                  return (
                    <div
                      key={series.id}
                      className="bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden"
                    >
                      <div className="px-4 py-2.5 bg-neutral-900/80 border-b border-neutral-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Tv className="w-4 h-4 text-rose-500" />
                          <span className="text-xs sm:text-sm font-bold text-white">
                            {series.title}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-neutral-400">
                          {seriesEpisodes.length} {seriesEpisodes.length === 1 ? 'فيلم / حلقة' : 'حلقة'}
                        </span>
                      </div>

                      <div className="divide-y divide-neutral-850">
                        {seriesEpisodes.map((ep) => {
                          const custom = allSavedConfigs[ep.id];
                          const isDrive = Boolean(custom?.driveLink);
                          return (
                          <div
                            key={ep.id}
                            className="px-4 py-2.5 flex items-center justify-between hover:bg-neutral-900/40 transition-colors text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="font-mono text-rose-400 font-bold shrink-0">
                                #{ep.episodeNumber}
                              </span>
                              <span className="font-medium text-neutral-200 truncate">
                                {ep.title}
                              </span>
                              {ep.isComingSoon && !isDrive && (
                                <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.2 rounded border border-amber-500/20">
                                  قريباً
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {isDrive ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-mono">
                                  <Cloud className="w-3 h-3" />
                                  <span>Google Drive</span>
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                                  محلي
                                </span>
                              )}

                              <button
                                onClick={() => {
                                  setSelectedSeriesId(series.id);
                                  setSelectedEpisodeId(ep.id);
                                  setActiveTab('editor');
                                }}
                                className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-[11px] transition-colors cursor-pointer"
                              >
                                تعديل
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          )}

          {activeTab === 'backup' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white mb-1">
                  النسخ الاحتياطي واستيراد قواعد بيانات الروابط
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  يمكنك نسخ كافة الروابط المضافة كملف نصي بصيغة JSON لحفظها، أو نقلها إلى أي متصفح أو جهاز آخر بسهولة.
                </p>
              </div>

              {importStatus && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold ${
                    importStatus.startsWith('تم')
                      ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/20 border border-rose-500/30 text-rose-300'
                  }`}
                >
                  {importStatus}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-neutral-300">
                    بيانات JSON للروابط المحفوظة:
                  </label>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(backupJson);
                      setSaveToast('تم نسخ كود JSON إلى الحافظة');
                      setTimeout(() => setSaveToast(null), 2500);
                    }}
                    className="text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer font-bold"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ إلى الحافظة</span>
                  </button>
                </div>

                <textarea
                  rows={8}
                  value={backupJson}
                  onChange={(e) => setBackupJson(e.target.value)}
                  placeholder="{ 'episode-id': { 'driveLink': '...' } }"
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl p-3 text-xs font-mono text-neutral-200 focus:outline-none focus:border-rose-500"
                  dir="ltr"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleImportBackup}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-lg"
                >
                  <Download className="w-4 h-4" />
                  <span>دمج واستيراد البيانات الآن</span>
                </button>

                <button
                  onClick={downloadEpisodeSourcesBackupFile}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-lg"
                >
                  <Save className="w-4 h-4" />
                  <span>تنزيل ملف نسخة احتياطية (.json)</span>
                </button>

                <button
                  onClick={() => backupFileInputRef.current?.click()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-lg"
                >
                  <Upload className="w-4 h-4" />
                  <span>رفع ملف .json من جهازك</span>
                </button>

                <button
                  onClick={handleExportBackup}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors border border-neutral-700"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>تحديث المعاينة</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-rose-500" />
                    <h3 className="text-sm font-bold text-white">
                      حماية الموقع برمز الدخول الخاص (Access Gate)
                    </h3>
                  </div>

                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                      gateConfig.enabled
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    }`}
                  >
                    {gateConfig.enabled
                      ? 'مفعّل — يُطلب رمز الدخول عند فتح الموقع'
                      : 'معطّل — الموقع مفتوح للجميع دون رمز'}
                  </span>
                </div>

                <p className="text-xs text-neutral-400 leading-relaxed">
                  يُشفَّر رمز الدخول ولا يظهر لأي زائر. الرمز الافتراضي هو الكود الذي اخترته، ويمكنك تغييره في أي وقت أو إيقاف القفل بالكامل. عند تغيير الرمز تُلغى الجلسات السابقة تلقائياً ليُطلب الرمز الجديد من الزوار.
                </p>
              </div>

              {!isVerifiedAdminUser(authUser) ? (
                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span>
                    لتغيير رمز الدخول أو إيقاف/تشغيل القفل في السحابة، يرجى تسجيل الدخول بحساب المالك ({ADMIN_EMAIL}) أولاً.
                  </span>
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={authLoading}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs cursor-pointer shrink-0"
                  >
                    {authLoading ? 'جاري الفتح...' : 'تسجيل دخول المالك (Google)'}
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setSavingGate(true);
                    setGateError(null);
                    try {
                      const updated = await saveAccessGateSettings({
                        enabled: gateEnabledInput,
                        newPasscode: newPasscodeInput,
                      });
                      setGateConfig(updated);
                      setNewPasscodeInput('');
                      setSaveToast(
                        updated.enabled
                          ? 'تم حفظ إعدادات القفل ورمز الدخول في سحابة Firebase بنجاح!'
                          : 'تم إيقاف قفل الدخول وحفظ الإعداد في سحابة Firebase بنجاح!'
                      );
                      setTimeout(() => setSaveToast(null), 4500);
                    } catch (err) {
                      setGateError(
                        err instanceof Error ? err.message : 'تعذر حفظ إعدادات رمز الدخول.'
                      );
                    } finally {
                      setSavingGate(false);
                    }
                  }}
                  className="space-y-4 bg-neutral-950 p-4 rounded-2xl border border-neutral-800"
                >
                  {/* Enable/Disable Switch */}
                  <div className="flex items-center justify-between gap-4 pb-3 border-b border-neutral-800">
                    <div>
                      <div className="text-xs font-bold text-white">
                        تفعيل قفل الدخول في بداية الموقع
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">
                        عند التفعيل، لا يظهر أي محتوى أو حلقات للزائر قبل إدخال الرمز الصحيح.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setGateEnabledInput((prev) => !prev)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-colors cursor-pointer border shrink-0 ${
                        gateEnabledInput
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
                          : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-neutral-700'
                      }`}
                    >
                      {gateEnabledInput ? 'القفل مفعّل (ON)' : 'القفل معطّل (OFF)'}
                    </button>
                  </div>

                  {/* New Passcode Field */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      <span>تعيين رمز دخول جديد (اختياري):</span>
                    </label>

                    <div className="relative">
                      <input
                        type={showNewPasscode ? 'text' : 'password'}
                        value={newPasscodeInput}
                        onChange={(e) => setNewPasscodeInput(e.target.value)}
                        placeholder="اتركه فارغاً للإبقاء على الرمز الحالي، أو اكتب رمزاً جديداً..."
                        dir="ltr"
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3.5 py-2.5 pl-10 text-xs font-mono text-white placeholder:text-neutral-500 focus:outline-none focus:border-rose-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPasscode((prev) => !prev)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
                        title={showNewPasscode ? 'إخفاء' : 'إظهار'}
                      >
                        {showNewPasscode ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {gateError && (
                    <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-bold">
                      {gateError}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={savingGate}
                      className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-950/60 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <Save className="w-4 h-4" />
                      <span>
                        {savingGate
                          ? 'جاري الحفظ في السحابة...'
                          : 'حفظ إعدادات رمز الدخول في السحابة'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        clearStoredAccessUnlock();
                        setSaveToast(
                          'تم مسح تصريح الدخول المحلي — عند تسجيل الخروج أو فتح نافذة خاصة سيطلب الموقع الرمز.'
                        );
                        setTimeout(() => setSaveToast(null), 4000);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-bold cursor-pointer"
                    >
                      إلغاء فتح الجلسة الحالية في هذا المتصفح
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
