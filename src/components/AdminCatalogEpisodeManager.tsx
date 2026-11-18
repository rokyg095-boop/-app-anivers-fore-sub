import React, { useState, useEffect, useRef } from 'react';
import {
  Edit3,
  Trash2,
  RotateCcw,
  Plus,
  Layers,
  Combine,
  Split,
  ArrowUp,
  ArrowDown,
  Save,
  Search,
  Upload,
  CheckCircle2,
  AlertCircle,
  Check,
  X,
  Cloud,
  Sparkles,
  Play,
  Loader2,
} from 'lucide-react';
import { DubEpisode, DubSeason, DubSeries } from '../data/mockData.ts';
import {
  CustomWorkCategory,
  compressImageFileToDataUrl,
  formatCloudErrorMessage,
} from '../utils/customWorks.ts';
import {
  CATALOG_OVERRIDES_UPDATED_EVENT,
  deleteAnySeriesInCloud,
  editAnySeriesInCloud,
  generateUniqueEpisodeId,
  getAllEffectiveMediaWorks,
  getDeletedBuiltInWorks,
  hasSeasonOverride,
  isCustomWorkId,
  isEpisodeDetectedAsMerged,
  mergeSeasonEpisodes,
  resetSeasonOverrideInCloud,
  restoreDeletedSeriesInCloud,
  saveSeasonEpisodesOverrideToCloud,
  splitMergedEpisode,
} from '../utils/catalogOverrides.ts';
import {
  DEFAULT_SUBTITLE_TRACKS,
  extractDriveFileId,
  getAllCustomEpisodeSources,
  getCustomEpisodeSource,
  normalizeDriveDirectUrl,
  saveCustomEpisodeSource,
  saveCustomEpisodeSourcesBatch,
  SOURCES_UPDATED_EVENT,
} from '../utils/videoSource.ts';
import {
  ArchiveSearchItem,
  discoverArchiveWorks,
  fetchArchiveItemDetails,
  fetchTmdbEnrichmentForWork,
  resolveEnrichedEpisodeDetails,
  saveTmdbWorkMapping,
  searchTmdbWorks,
  TmdbSearchResult,
} from '../utils/tmdbMetadata.ts';

interface AdminCatalogManagerProps {
  onShowToast: (msg: string) => void;
  onJumpToEpisodes: (seriesId: string) => void;
  onOpenCreateWork?: () => void;
}

export const AdminCatalogManager: React.FC<AdminCatalogManagerProps> = ({
  onShowToast,
  onJumpToEpisodes,
  onOpenCreateWork,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [catFilter, setCatFilter] = useState<'all' | CustomWorkCategory>('all');
  const [editingSeries, setEditingSeries] = useState<DubSeries | null>(null);
  const [editCategory, setEditCategory] = useState<CustomWorkCategory>('dubbed');
  const [editTitle, setEditTitle] = useState<string>('');
  const [editOriginalTitle, setEditOriginalTitle] = useState<string>('');
  const [editCoverImage, setEditCoverImage] = useState<string>('');
  const [editGenresText, setEditGenresText] = useState<string>('');
  const [editStudio, setEditStudio] = useState<string>('');
  const [editRating, setEditRating] = useState<number>(9.0);
  const [editSynopsis, setEditSynopsis] = useState<string>('');
  const [imageProcessing, setImageProcessing] = useState<boolean>(false);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [busySeriesId, setBusySeriesId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);

  const allWorks = getAllEffectiveMediaWorks();
  const deletedBuiltInWorks = getDeletedBuiltInWorks();

  const filteredWorks = allWorks.filter((w) => {
    const workCat: CustomWorkCategory =
      w.category === 'anime' || w.category === 'movie' || w.category === 'tv' ? w.category : 'dubbed';
    if (catFilter !== 'all' && workCat !== catFilter) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      w.title.toLowerCase().includes(q) ||
      (w.originalTitle || '').toLowerCase().includes(q) ||
      (w.dubStudio || '').toLowerCase().includes(q)
    );
  });

  const startEditSeries = (series: DubSeries) => {
    const cat: CustomWorkCategory =
      series.category === 'anime' || series.category === 'movie' || series.category === 'tv'
        ? series.category
        : 'dubbed';
    setEditingSeries(series);
    setEditCategory(cat);
    setEditTitle(series.title);
    setEditOriginalTitle(series.originalTitle || '');
    setEditCoverImage(series.coverImage || '');
    setEditGenresText((series.genres || []).join('، '));
    setEditStudio(series.dubStudio || '');
    setEditRating(series.rating || 9.0);
    setEditSynopsis(series.synopsis || '');
    setErrorMsg(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageProcessing(true);
    setErrorMsg(null);
    try {
      const compressed = await compressImageFileToDataUrl(file);
      setEditCoverImage(compressed);
    } catch (err) {
      setErrorMsg(formatCloudErrorMessage(err, 'تعذر معالجة الصورة'));
    } finally {
      setImageProcessing(false);
      e.target.value = '';
    }
  };

  const handleSaveEditSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSeries) return;
    if (!editTitle.trim() || !editCoverImage.trim() || !editSynopsis.trim()) {
      setErrorMsg('يرجى إدخال اسم العمل وصورة الغلاف والوصف.');
      return;
    }

    setSavingEdit(true);
    setErrorMsg(null);
    try {
      const genres = editGenresText
        .split(/[،,]+/)
        .map((g) => g.trim())
        .filter(Boolean);

      await editAnySeriesInCloud(editingSeries, {
        category: editCategory,
        title: editTitle.trim(),
        originalTitle: editOriginalTitle.trim(),
        coverImage: editCoverImage.trim(),
        bannerImage: editCoverImage.trim(),
        genres: genres.length > 0 ? genres : editingSeries.genres,
        dubStudio: editStudio.trim() || editingSeries.dubStudio,
        rating: editRating,
        synopsis: editSynopsis.trim(),
      });

      onShowToast(`تم حفظ تعديلات «${editTitle.trim()}» في سحابة Firebase بنجاح!`);
      setEditingSeries(null);
    } catch (err) {
      setErrorMsg(formatCloudErrorMessage(err, 'تعذر حفظ تعديلات العمل'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteSeries = async (series: DubSeries) => {
    const isCustom = isCustomWorkId(series.id);
    const confirmText = isCustom
      ? `هل تريد حذف «${series.title}» نهائياً من الموقع؟`
      : `هل تريد إزالة/إخفاء «${series.title}» من الموقع؟ (يمكنك استرجاعه لاحقاً من قائمة الأعمال المحذوفة بالأسفل)`;
    if (!window.confirm(confirmText)) return;

    setBusySeriesId(series.id);
    setErrorMsg(null);
    try {
      const res = await deleteAnySeriesInCloud(series);
      if (editingSeries?.id === series.id) {
        setEditingSeries(null);
      }
      onShowToast(
        res === 'deleted_custom'
          ? `تم حذف «${series.title}» نهائياً من السحابة!`
          : `تمت إزالة «${series.title}» من الموقع بنجاح!`
      );
    } catch (err) {
      setErrorMsg(formatCloudErrorMessage(err, 'تعذر حذف العمل'));
    } finally {
      setBusySeriesId(null);
    }
  };

  const handleRestoreSeries = async (series: DubSeries) => {
    setBusySeriesId(series.id);
    setErrorMsg(null);
    try {
      await restoreDeletedSeriesInCloud(series.id);
      onShowToast(`تمت استعادة «${series.title}» وإظهاره في الموقع بنجاح!`);
    } catch (err) {
      setErrorMsg(formatCloudErrorMessage(err, 'تعذر استعادة العمل'));
    } finally {
      setBusySeriesId(null);
    }
  };

  return (
    <div className="space-y-5">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-950 p-3.5 rounded-xl border border-neutral-800">
        <div>
          <h3 className="text-sm font-black text-white">
            إدارة جميع المسلسلات والأفلام ({allWorks.length})
          </h3>
          <p className="text-[11px] text-neutral-400">
            يمكنك تعديل اسم/صورة/وصف أي عمل أو حذفه من الموقع بالكامل، أو الانتقال لتعديل قائمة حلقاته.
          </p>
        </div>

        {onOpenCreateWork && (
          <button
            type="button"
            onClick={onOpenCreateWork}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer shrink-0 shadow"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة مسلسل / فيلم جديد</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Inline Edit Panel for Selected Series/Movie */}
      {editingSeries && (
        <form
          onSubmit={handleSaveEditSeries}
          className="p-4 rounded-2xl bg-neutral-950 border-2 border-amber-500/40 space-y-4 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs sm:text-sm font-black text-white">
                تعديل بيانات: «{editingSeries.title}»
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setEditingSeries(null)}
              className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
            {/* Cover */}
            <div className="sm:col-span-3 space-y-2">
              <div
                onClick={() => imageInputRef.current?.click()}
                className="aspect-[2/3] max-w-[140px] mx-auto rounded-xl overflow-hidden border-2 border-dashed border-neutral-700 hover:border-amber-500 bg-neutral-900 cursor-pointer relative group"
              >
                <img
                  src={editCoverImage}
                  alt={editTitle}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[11px] font-bold gap-1">
                  <Upload className="w-4 h-4" />
                  <span>{imageProcessing ? 'جاري الضغط...' : 'تغيير الغلاف'}</span>
                </div>
              </div>
              <input
                type="text"
                value={editCoverImage.startsWith('data:') ? '' : editCoverImage}
                onChange={(e) => setEditCoverImage(e.target.value)}
                placeholder="أو رابط الصورة..."
                dir="ltr"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1 text-[11px] font-mono text-white"
              />
            </div>

            {/* Fields */}
            <div className="sm:col-span-9 space-y-3">
              {isCustomWorkId(editingSeries.id) && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-neutral-400">القسم:</span>
                  {(['dubbed', 'anime', 'tv', 'movie'] as CustomWorkCategory[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditCategory(c)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer border ${
                        editCategory === c
                          ? 'bg-rose-600 text-white border-rose-500'
                          : 'bg-neutral-900 text-neutral-300 border-neutral-700'
                      }`}
                    >
                      {c === 'dubbed'
                        ? 'مدبلج'
                        : c === 'anime'
                        ? 'أنمي'
                        : c === 'tv'
                        ? 'مسلسل تلفزيوني'
                        : 'فيلم'}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-neutral-300 block mb-1">
                    اسم العمل:
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-300 block mb-1">
                    الاسم الإنجليزي / الأصلي:
                  </label>
                  <input
                    type="text"
                    value={editOriginalTitle}
                    onChange={(e) => setEditOriginalTitle(e.target.value)}
                    dir="ltr"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-neutral-300 block mb-1">
                    التصنيفات (افصل بفاصلة):
                  </label>
                  <input
                    type="text"
                    value={editGenresText}
                    onChange={(e) => setEditGenresText(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-300 block mb-1">
                    الاستوديو / المترجم:
                  </label>
                  <input
                    type="text"
                    value={editStudio}
                    onChange={(e) => setEditStudio(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-300 block mb-1">
                    التقييم (من 10):
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={10}
                    value={editRating}
                    onChange={(e) => setEditRating(Math.min(10, Math.max(0, Number(e.target.value) || 0)))}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-neutral-300 block mb-1">
                  القصة / الوصف:
                </label>
                <textarea
                  rows={3}
                  value={editSynopsis}
                  onChange={(e) => setEditSynopsis(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={savingEdit || imageProcessing}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingEdit ? 'جاري الحفظ...' : 'حفظ التعديلات في السحابة'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSeries(null)}
                  className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Search & Category Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-500 absolute top-1/2 right-3 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث عن مسلسل أو فيلم لتعديله أو حذفه..."
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 pr-9 pl-3 text-xs text-white focus:outline-none focus:border-rose-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(
            [
              { id: 'all', label: 'الكل' },
              { id: 'dubbed', label: 'مدبلج' },
              { id: 'anime', label: 'أنمي' },
              { id: 'tv', label: 'مسلسلات تلفزيونية' },
              { id: 'movie', label: 'أفلام' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setCatFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap border ${
                catFilter === f.id
                  ? 'bg-rose-600 text-white border-rose-500'
                  : 'bg-neutral-950 text-neutral-400 hover:text-white border-neutral-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Works Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredWorks.map((series) => {
          const cat: CustomWorkCategory =
            series.category === 'anime' || series.category === 'movie' || series.category === 'tv'
              ? series.category
              : 'dubbed';
          const isCustom = isCustomWorkId(series.id);
          const busy = busySeriesId === series.id;

          return (
            <div
              key={series.id}
              className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-neutral-700 flex items-center gap-3 transition-colors"
            >
              <img
                src={series.coverImage}
                alt={series.title}
                className="w-14 h-20 object-cover rounded-lg shrink-0 bg-neutral-800 border border-neutral-800"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      cat === 'movie'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : cat === 'anime'
                        ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                        : cat === 'tv'
                        ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    {cat === 'movie'
                      ? 'فيلم'
                      : cat === 'anime'
                      ? 'أنمي'
                      : cat === 'tv'
                      ? 'مسلسل تلفزيوني'
                      : 'مدبلج'}
                  </span>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {cat === 'movie'
                      ? 'فيلم كامل'
                      : `${(series.seasons || []).length} ${(series.seasons || []).length === 1 ? 'موسم' : 'مواسم'} · ${series.episodesCount} حلقة`}
                  </span>
                  {isCustom && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                      مضاف
                    </span>
                  )}
                </div>

                <h4 className="text-xs sm:text-sm font-black text-white truncate">
                  {series.title}
                </h4>
                {series.originalTitle && (
                  <p className="text-[10px] font-mono text-neutral-500 truncate" dir="ltr">
                    {series.originalTitle}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => onJumpToEpisodes(series.id)}
                    className="px-2.5 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Layers className="w-3 h-3" />
                    <span>تعديل الحلقات والدمج</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => startEditSeries(series)}
                    className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3 text-amber-400" />
                    <span>تعديل</span>
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDeleteSeries(series)}
                    className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-rose-600/30 text-rose-400 border border-rose-500/25 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{busy ? 'جاري...' : 'حذف'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Deleted Built-In Works Trash / Restore */}
      {deletedBuiltInWorks.length > 0 && (
        <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-neutral-300 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-emerald-400" />
              <span>الأعمال المخفية / المحذوفة ({deletedBuiltInWorks.length}) — يمكنك استرجاعها</span>
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {deletedBuiltInWorks.map((series) => (
              <div
                key={series.id}
                className="p-2.5 rounded-xl bg-neutral-900/70 border border-neutral-800 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={series.coverImage}
                    alt={series.title}
                    className="w-9 h-12 object-cover rounded-md shrink-0 opacity-60"
                  />
                  <span className="text-xs font-bold text-neutral-300 truncate">
                    {series.title}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busySeriesId === series.id}
                  onClick={() => void handleRestoreSeries(series)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>استرجاع</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface AdminEpisodeListManagerProps {
  selectedSeriesId: string;
  onChangeSeriesId: (seriesId: string) => void;
  onShowToast: (msg: string) => void;
}

export const AdminEpisodeListManager: React.FC<AdminEpisodeListManagerProps> = ({
  selectedSeriesId,
  onChangeSeriesId,
  onShowToast,
}) => {
  const [, setSyncTick] = useState<number>(0);

  useEffect(() => {
    const onRefresh = () => setSyncTick((t) => t + 1);
    window.addEventListener(CATALOG_OVERRIDES_UPDATED_EVENT, onRefresh);
    window.addEventListener(SOURCES_UPDATED_EVENT, onRefresh);
    return () => {
      window.removeEventListener(CATALOG_OVERRIDES_UPDATED_EVENT, onRefresh);
      window.removeEventListener(SOURCES_UPDATED_EVENT, onRefresh);
    };
  }, []);

  const allWorks = getAllEffectiveMediaWorks();
  const series = allWorks.find((s) => s.id === selectedSeriesId) || allWorks[0];

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [draftSeasonTitle, setDraftSeasonTitle] = useState<string>('');
  const [draftEpisodes, setDraftEpisodes] = useState<DubEpisode[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [titleDirty, setTitleDirty] = useState<boolean>(false);
  const [savingCloud, setSavingCloud] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Per-episode inline editor state
  const [editingEpId, setEditingEpId] = useState<string | null>(null);
  const [epNumInput, setEpNumInput] = useState<number>(1);
  const [epTitleInput, setEpTitleInput] = useState<string>('');
  const [epDurationInput, setEpDurationInput] = useState<string>('11:00');
  const [epDescInput, setEpDescInput] = useState<string>('');
  const [epIsMergedInput, setEpIsMergedInput] = useState<boolean>(false);
  const [epDriveLinkInput, setEpDriveLinkInput] = useState<string>('');

  // Add new episode inline state
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [newEpTitle, setNewEpTitle] = useState<string>('');
  const [newEpIsMerged, setNewEpIsMerged] = useState<boolean>(false);
  const [newEpDuration, setNewEpDuration] = useState<string>('11:00');
  const [newEpDesc, setNewEpDesc] = useState<string>('');
  const [newEpDriveLink, setNewEpDriveLink] = useState<string>('');

  // TMDB sync & custom re-match state
  const [syncingTmdb, setSyncingTmdb] = useState<boolean>(false);
  const [showTmdbSearch, setShowTmdbSearch] = useState<boolean>(false);
  const [tmdbSearchQuery, setTmdbSearchQuery] = useState<string>('');
  const [tmdbSearchResults, setTmdbSearchResults] = useState<TmdbSearchResult[]>([]);
  const [searchingTmdb, setSearchingTmdb] = useState<boolean>(false);

  // Archive.org auto-fill video episodes state
  const [showArchiveFill, setShowArchiveFill] = useState<boolean>(false);
  const [archiveFillQuery, setArchiveFillQuery] = useState<string>('');
  const [archiveFillSearching, setArchiveFillSearching] = useState<boolean>(false);
  const [archiveFillResults, setArchiveFillResults] = useState<ArchiveSearchItem[]>([]);
  const [fillingArchiveId, setFillingArchiveId] = useState<string | null>(null);
  const [archiveFillProgress, setArchiveFillProgress] = useState<{ done: number; total: number } | null>(null);

  const seasons: DubSeason[] = series?.seasons || [];
  const activeSeason =
    seasons.find((s) => s.id === selectedSeasonId) || seasons[0] || null;
  const activeSeasonEpisodesKey = (activeSeason?.episodes || [])
    .filter(Boolean)
    .map((e) => `${e.id}:${e.episodeNumber}:${e.title}:${e.isComingSoon}`)
    .join('|');

  // Ensure selectedSeasonId stays valid when switching series
  useEffect(() => {
    if (!series) return;
    if (!seasons.some((s) => s.id === selectedSeasonId)) {
      setSelectedSeasonId(seasons[0]?.id || '');
    }
  }, [series?.id, seasons, selectedSeasonId]);

  // Reset UI selection when switching series/season
  useEffect(() => {
    setSelectedIds([]);
    setEditingEpId(null);
    setShowAddForm(false);
    setShowArchiveFill(false);
    setArchiveFillResults([]);
    setTitleDirty(false);
    setErrorMsg(null);
  }, [series?.id, activeSeason?.id]);

  // Keep draftEpisodes synced whenever series/season or underlying catalog overrides update
  useEffect(() => {
    if (!activeSeason) {
      setDraftEpisodes([]);
      setDraftSeasonTitle('');
      return;
    }
    setDraftEpisodes((activeSeason.episodes || []).filter(Boolean).map((e) => ({ ...e })));
    setDraftSeasonTitle(activeSeason.title);
  }, [series?.id, activeSeason?.id, activeSeasonEpisodesKey]);

  if (!series || !activeSeason) {
    return (
      <div className="p-6 text-center text-xs text-neutral-400">
        لا توجد أعمال متاحة حالياً للتعديل.
      </div>
    );
  }

  const allSources = getAllCustomEpisodeSources();
  const isSeasonCustomized = hasSeasonOverride(series.id, activeSeason.id);

  const commitEpisodesToCloud = async (
    nextEpisodes: DubEpisode[],
    successMsg: string,
    overrideTitle?: string
  ): Promise<boolean> => {
    const prevEpisodes = draftEpisodes;
    setDraftEpisodes(nextEpisodes);
    setSavingCloud(true);
    setErrorMsg(null);
    try {
      await saveSeasonEpisodesOverrideToCloud(
        series,
        activeSeason,
        nextEpisodes,
        overrideTitle ?? draftSeasonTitle
      );
      setTitleDirty(false);
      onShowToast(successMsg);
      return true;
    } catch (err) {
      setDraftEpisodes(prevEpisodes);
      setErrorMsg(formatCloudErrorMessage(err, 'تعذر حفظ التعديل في سحابة Firebase — حاول مرة أخرى.'));
      return false;
    } finally {
      setSavingCloud(false);
    }
  };

  const toggleSelectEpisode = (epId: string) => {
    setSelectedIds((prev) =>
      prev.includes(epId) ? prev.filter((id) => id !== epId) : [...prev, epId]
    );
  };

  const openEditEpisode = (ep: DubEpisode) => {
    if (editingEpId === ep.id) {
      setEditingEpId(null);
      return;
    }
    const existingSrc = getCustomEpisodeSource(ep.id);
    setEditingEpId(ep.id);
    setEpNumInput(ep.episodeNumber);
    setEpTitleInput(ep.title);
    setEpDurationInput(ep.duration || '11:00');
    setEpDescInput(ep.description || '');
    setEpIsMergedInput(isEpisodeDetectedAsMerged(ep));
    setEpDriveLinkInput(existingSrc?.driveLink || existingSrc?.videoUrl || ep.driveLink || '');
  };

  const handleApplyEpisodeEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEpId) return;
    setErrorMsg(null);
    setSavingCloud(true);

    const updated = draftEpisodes.map((ep) =>
      ep.id === editingEpId
        ? {
            ...ep,
            episodeNumber: Math.max(1, Math.round(epNumInput) || 1),
            title: epTitleInput.trim() || ep.title,
            duration: epDurationInput.trim() || (epIsMergedInput ? '22:00' : '11:00'),
            description: epDescInput.trim(),
            isMerged: epIsMergedInput,
          }
        : ep
    );

    const trimmedDrive = epDriveLinkInput.trim();
    if (trimmedDrive) {
      const normalized = normalizeDriveDirectUrl(trimmedDrive);
      const existingCfg = getCustomEpisodeSource(editingEpId);
      const res = await saveCustomEpisodeSource(editingEpId, {
        driveLink: normalized,
        videoUrl: normalized,
        accountLabel: existingCfg?.accountLabel || '',
        backupDriveLinks: existingCfg?.backupDriveLinks || [],
        subtitles: existingCfg?.subtitles?.length
          ? existingCfg.subtitles
          : DEFAULT_SUBTITLE_TRACKS,
      });
      if (!res.savedToCloud) {
        setSavingCloud(false);
        setErrorMsg(
          formatCloudErrorMessage(
            res.cloudError,
            'تعذر حفظ رابط Google Drive في السحابة — تأكد من الرابط أو أعد المحاولة.'
          )
        );
        return;
      }
    }

    const savedOk = await commitEpisodesToCloud(
      updated,
      trimmedDrive
        ? 'تم حفظ تعديل الحلقة ورابط Google Drive في سحابة Firebase للأبد!'
        : 'تم حفظ تعديل الحلقة في سحابة Firebase للأبد!'
    );
    if (savedOk) {
      setEditingEpId(null);
    }
  };

  const handleMergeSelected = async () => {
    if (selectedIds.length < 2) return;
    setErrorMsg(null);
    const merged = await mergeSeasonEpisodes(draftEpisodes, selectedIds);
    const ok = await commitEpisodesToCloud(
      merged,
      'تم دمج الحلقات المحددة وحفظها تلقائياً في سحابة Firebase!'
    );
    if (ok) {
      setSelectedIds([]);
    }
  };

  const handleSplitEpisode = async (epId: string, parts: 2 | 3) => {
    setErrorMsg(null);
    const splitList = splitMergedEpisode(draftEpisodes, activeSeason.id, epId, parts);
    const ok = await commitEpisodesToCloud(
      splitList,
      `تم فصل الحلقة إلى ${parts} حلقات عادية وحفظها في سحابة Firebase للأبد!`
    );
    if (ok) {
      setSelectedIds((prev) => prev.filter((id) => id !== epId));
      setEditingEpId(null);
    }
  };

  const handleMoveEpisode = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= draftEpisodes.length) return;
    const copy = [...draftEpisodes];
    const [item] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, item);
    await commitEpisodesToCloud(copy, 'تم تحديث ترتيب الحلقات وحفظه في السحابة!');
  };

  const handleDeleteEpisode = async (epId: string) => {
    const next = draftEpisodes.filter((e) => e.id !== epId);
    const ok = await commitEpisodesToCloud(next, 'تم حذف الحلقة وتحديث السحابة بنجاح!');
    if (ok) {
      setSelectedIds((prev) => prev.filter((id) => id !== epId));
      if (editingEpId === epId) setEditingEpId(null);
    }
  };

  const handleAutoRenumber = async () => {
    const renumbered = draftEpisodes.map((ep, idx) => ({
      ...ep,
      episodeNumber: idx + 1,
    }));
    await commitEpisodesToCloud(
      renumbered,
      `تم ترقيم جميع الحلقات (1..${renumbered.length}) وحفظها في السحابة!`
    );
  };

  const handleAddNewEpisode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSavingCloud(true);

    const nextNum = draftEpisodes.length + 1;
    const newId = generateUniqueEpisodeId(activeSeason.id, 'ep');
    const title =
      newEpTitle.trim() ||
      (newEpIsMerged
        ? `الحلقة ${nextNum.toString().padStart(2, '0')} (مدمجة)`
        : `الحلقة ${nextNum.toString().padStart(2, '0')}`);

    const newEpisode: DubEpisode = {
      id: newId,
      episodeNumber: nextNum,
      title,
      duration: newEpDuration.trim() || (newEpIsMerged ? '22:00' : '11:00'),
      thumbnail: series.coverImage,
      videoUrl: '',
      dubStudio: series.dubStudio,
      voiceActors: [series.dubStudio],
      releaseDate: 'جاهزة للربط عبر درايف',
      description:
        newEpDesc.trim() ||
        `${newEpIsMerged ? 'حلقة مدمجة' : 'حلقة منفردة'} من ${series.title} - ${activeSeason.title}`,
      isComingSoon: true,
      isMerged: newEpIsMerged,
    };

    if (newEpDriveLink.trim()) {
      const normalized = normalizeDriveDirectUrl(newEpDriveLink.trim());
      const res = await saveCustomEpisodeSource(newId, {
        driveLink: normalized,
        videoUrl: normalized,
        accountLabel: '',
        backupDriveLinks: [],
        subtitles: DEFAULT_SUBTITLE_TRACKS,
      });
      if (!res.savedToCloud) {
        setSavingCloud(false);
        setErrorMsg(
          formatCloudErrorMessage(res.cloudError, 'تعذر حفظ رابط Drive للحلقة الجديدة في السحابة.')
        );
        return;
      }
    }

    const updated = [...draftEpisodes, newEpisode];
    const ok = await commitEpisodesToCloud(
      updated,
      `تمت إضافة «${title}» وحفظها في سحابة Firebase للأبد!`
    );
    if (ok) {
      setNewEpTitle('');
      setNewEpDesc('');
      setNewEpDriveLink('');
      setNewEpIsMerged(false);
      setNewEpDuration('11:00');
      setShowAddForm(false);
    }
  };

  const handleSaveSeasonToCloud = async () => {
    await commitEpisodesToCloud(
      draftEpisodes,
      `تم حفظ قائمة حلقات «${series.title} - ${draftSeasonTitle || activeSeason.title}» (${draftEpisodes.length} حلقة) في سحابة Firebase بنجاح!`
    );
  };

  const handleResetSeasonDefault = async () => {
    if (
      !window.confirm(
        `هل تريد استرجاع قائمة الحلقات الافتراضية للموسم «${activeSeason.title}» وحذف التعديلات المخصصة؟`
      )
    ) {
      return;
    }
    setSavingCloud(true);
    setErrorMsg(null);
    try {
      await resetSeasonOverrideInCloud(series.id, activeSeason.id);
      const refreshedSeries = getAllEffectiveMediaWorks().find((w) => w.id === series.id);
      const refreshedSeason = refreshedSeries?.seasons?.find((s) => s.id === activeSeason.id);
      if (refreshedSeason) {
        setDraftEpisodes(refreshedSeason.episodes.map((e) => ({ ...e })));
        setDraftSeasonTitle(refreshedSeason.title);
      }
      setSelectedIds([]);
      setEditingEpId(null);
      setTitleDirty(false);
      onShowToast('تم استرجاع القائمة الافتراضية للموسم بنجاح!');
    } catch (err) {
      setErrorMsg(formatCloudErrorMessage(err, 'تعذر استرجاع القائمة الافتراضية'));
    } finally {
      setSavingCloud(false);
    }
  };

  const handleSyncSeasonFromTmdb = async () => {
    setSyncingTmdb(true);
    setErrorMsg(null);
    try {
      const enrichment = await fetchTmdbEnrichmentForWork(
        series,
        activeSeason.seasonNumber || 1,
        true
      );
      if (!enrichment?.configured) {
        setErrorMsg('مفتاح TMDB_API_KEY غير مفعّل في السيرفر بعد — تأكد من حفظه في Secrets وإعادة تشغيل الخادم.');
        return;
      }
      if (!enrichment?.found) {
        setShowTmdbSearch(true);
        setTmdbSearchQuery(series.originalTitle || series.title);
        setErrorMsg('لم يتم العثور على تطابق تلقائي — اختر العمل الصحيح من بحث TMDB أدناه.');
        return;
      }

      const baseEpisodes = [...draftEpisodes];
      const existingNums = new Set(baseEpisodes.map((ep) => ep.episodeNumber));
      const tmdbSeasonEps = enrichment.episodes || [];
      for (const tmEp of tmdbSeasonEps) {
        if (!existingNums.has(tmEp.episodeNumber)) {
          const newId = generateUniqueEpisodeId(activeSeason.id, `ep${tmEp.episodeNumber}`);
          baseEpisodes.push({
            id: newId,
            episodeNumber: tmEp.episodeNumber,
            title: tmEp.name || tmEp.nameEn || `الحلقة ${tmEp.episodeNumber}`,
            duration: tmEp.durationText || '24:00',
            thumbnail: tmEp.stillUrl || series.coverImage,
            videoUrl: '',
            dubStudio: series.dubStudio,
            voiceActors: [series.dubStudio],
            releaseDate: tmEp.airDate || 'TMDB',
            description: tmEp.overview || tmEp.overviewEn || series.synopsis,
            isComingSoon: true,
          });
          existingNums.add(tmEp.episodeNumber);
        }
      }
      if (baseEpisodes.length === 0 && series.category === 'movie') {
        baseEpisodes.push({
          id: `${series.id}-movie-1`,
          episodeNumber: 1,
          title: `${enrichment.title || series.title} (الفيلم الكامل)`,
          duration: '02:00:00',
          thumbnail: enrichment.backdropUrl || enrichment.posterUrl || series.coverImage,
          videoUrl: '',
          dubStudio: series.dubStudio,
          voiceActors: [series.dubStudio],
          releaseDate: enrichment.releaseDate || 'TMDB',
          description: enrichment.overview || series.synopsis,
          isComingSoon: true,
        });
      }
      baseEpisodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

      const nextEpisodes = baseEpisodes.map((ep) => {
        const resolved = resolveEnrichedEpisodeDetails(ep, series, enrichment, true);
        return {
          ...ep,
          title: resolved.title,
          description: resolved.description,
          thumbnail: resolved.thumbnail || ep.thumbnail,
          duration: resolved.duration || ep.duration,
          releaseDate: resolved.releaseDate || ep.releaseDate,
          voiceActors:
            resolved.voiceActorNames.length > 0 ? resolved.voiceActorNames : ep.voiceActors,
        };
      });

      await commitEpisodesToCloud(
        nextEpisodes,
        `تمت مزامنة وحفظ معلومات ${nextEpisodes.length} حلقة (العناوين، القصة الصغيرة، والممثلون) من TMDB في السحابة!`
      );
    } catch (err) {
      setErrorMsg(formatCloudErrorMessage(err, 'تعذر المزامنة مع TMDB'));
    } finally {
      setSyncingTmdb(false);
    }
  };

  const handleAdminTmdbSearch = async () => {
    const q = (tmdbSearchQuery || series.originalTitle || series.title).trim();
    if (!q) return;
    setSearchingTmdb(true);
    setErrorMsg(null);
    try {
      const type = series.category === 'movie' ? 'movie' : 'tv';
      const res = await searchTmdbWorks(q, type);
      if (!res.configured) {
        setErrorMsg('مفتاح TMDB_API_KEY غير مفعّل في السيرفر.');
      }
      setTmdbSearchResults(res.results);
    } finally {
      setSearchingTmdb(false);
    }
  };

  const handleBindTmdbMatch = async (match: TmdbSearchResult) => {
    await saveTmdbWorkMapping(series.id, match.tmdbId, match.mediaType, match.originalTitle || match.title);
    setShowTmdbSearch(false);
    setTmdbSearchResults([]);
    onShowToast(`تم ربط «${series.title}» بـ TMDB (${match.title}) — جاري مزامنة الموسم...`);
    await handleSyncSeasonFromTmdb();
  };

  const handleSearchArchiveFill = async (overrideQ?: string) => {
    const q = (overrideQ ?? archiveFillQuery ?? series.originalTitle ?? series.title).trim();
    setArchiveFillSearching(true);
    setErrorMsg(null);
    try {
      const cat: CustomWorkCategory =
        series.category === 'anime' || series.category === 'movie' || series.category === 'tv'
          ? series.category
          : 'dubbed';
      const res = await discoverArchiveWorks({
        category: cat,
        query: q,
        page: 1,
      });
      setArchiveFillResults(Array.isArray(res.results) ? res.results : []);
      if (!res.results || res.results.length === 0) {
        setErrorMsg(`لم يتم العثور على حلقات فيديو في Archive.org لـ «${q}» — جرب اسماً إنجليزياً آخر.`);
      }
    } catch {
      setErrorMsg('تعذر البحث في Archive.org حالياً.');
    } finally {
      setArchiveFillSearching(false);
    }
  };

  const handleApplyArchiveFill = async (item: ArchiveSearchItem) => {
    setFillingArchiveId(item.identifier);
    setArchiveFillProgress(null);
    setErrorMsg(null);
    try {
      const details = await fetchArchiveItemDetails(item.identifier);
      if (!details || !details.episodes || details.episodes.length === 0) {
        setErrorMsg(`«${item.title}» لا يحتوي على ملفات فيديو MP4 صالحة للتشغيل.`);
        return;
      }

      const archiveEps = details.episodes.slice(0, 150);
      const isSingleMovie = series.category === 'movie' && archiveEps.length === 1;

      const batchEntries: Array<{
        episodeId: string;
        config: {
          driveLink: string;
          videoUrl: string;
          accountLabel: string;
          backupDriveLinks: Array<{ id: string; url: string; accountLabel: string }>;
          subtitles: typeof DEFAULT_SUBTITLE_TRACKS;
        };
      }> = [];

      const nextEpisodes: DubEpisode[] = [];
      const existingCount = draftEpisodes.length;
      const totalCount = Math.max(existingCount, archiveEps.length);

      for (let i = 0; i < totalCount; i += 1) {
        const existingEp = draftEpisodes[i];
        const archEp = archiveEps[i];
        if (existingEp && archEp) {
          const updatedEp: DubEpisode = {
            ...existingEp,
            duration: existingEp.duration && existingEp.duration !== 'قريباً' ? existingEp.duration : archEp.duration || '22:00',
            videoUrl: archEp.videoUrl,
            releaseDate: existingEp.releaseDate || details.year || item.year || 'Archive.org',
            isComingSoon: false,
          };
          nextEpisodes.push(updatedEp);
          batchEntries.push({
            episodeId: updatedEp.id,
            config: {
              driveLink: archEp.videoUrl,
              videoUrl: archEp.videoUrl,
              accountLabel: 'Archive.org',
              backupDriveLinks: archEp.backupVideoUrl
                ? [{ id: 'archive-512kb', url: archEp.backupVideoUrl, accountLabel: 'Archive.org (MP4 خفيف)' }]
                : [],
              subtitles: DEFAULT_SUBTITLE_TRACKS,
            },
          });
        } else if (existingEp) {
          nextEpisodes.push(existingEp);
        } else if (archEp) {
          const epNum = archEp.episodeNumber || i + 1;
          const newId = isSingleMovie
            ? `${series.id}-movie-1`
            : activeSeason.seasonNumber === 1
            ? `${series.id}-ep-${epNum}`
            : `${series.id}-s${activeSeason.seasonNumber}-ep-${epNum}`;
          const safeId = newId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100);
          const createdEp: DubEpisode = {
            id: safeId,
            episodeNumber: epNum,
            title: isSingleMovie ? `${series.title} (الفيلم الكامل)` : archEp.title || `الحلقة ${epNum}`,
            duration: archEp.duration || '22:00',
            thumbnail: series.coverImage,
            videoUrl: archEp.videoUrl,
            dubStudio: series.dubStudio || 'Archive.org',
            voiceActors: [series.dubStudio || 'Archive.org'],
            releaseDate: details.year || item.year || 'Archive.org',
            description: series.synopsis || archEp.title,
            isComingSoon: false,
          };
          nextEpisodes.push(createdEp);
          batchEntries.push({
            episodeId: safeId,
            config: {
              driveLink: archEp.videoUrl,
              videoUrl: archEp.videoUrl,
              accountLabel: 'Archive.org',
              backupDriveLinks: archEp.backupVideoUrl
                ? [{ id: 'archive-512kb', url: archEp.backupVideoUrl, accountLabel: 'Archive.org (MP4 خفيف)' }]
                : [],
              subtitles: DEFAULT_SUBTITLE_TRACKS,
            },
          });
        }
      }

      setArchiveFillProgress({ done: 0, total: batchEntries.length });
      const batchRes = await saveCustomEpisodeSourcesBatch(batchEntries, (done, total) =>
        setArchiveFillProgress({ done, total })
      );

      if (batchRes.cloudSavedCount === 0) {
        setErrorMsg(
          formatCloudErrorMessage(
            batchRes.cloudError,
            'تعذر حفظ روابط الفيديو في سحابة Firebase — تأكد من تسجيل الدخول بحساب المالك.'
          )
        );
        return;
      }

      const savedSeason = await commitEpisodesToCloud(
        nextEpisodes,
        `تمت تعبئة وحفظ ${batchRes.cloudSavedCount} حلقة/فيديو جاهز للتشغيل من Archive.org بنجاح!`
      );
      if (savedSeason) {
        setShowArchiveFill(false);
      }
    } catch (err) {
      setErrorMsg(formatCloudErrorMessage(err, 'تعذر تعبئة الفيديوهات من Archive.org'));
    } finally {
      setFillingArchiveId(null);
      setArchiveFillProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Series & Season Picker */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-950 p-3.5 rounded-xl border border-neutral-800">
        <div>
          <label className="text-xs font-bold text-neutral-300 block mb-1">
            اختر المسلسل أو الفيلم:
          </label>
          <select
            value={series.id}
            onChange={(e) => onChangeSeriesId(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 cursor-pointer"
          >
            {allWorks.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title} ({(w.seasons || []).length} {(w.seasons || []).length === 1 ? 'موسم' : 'مواسم'} · {w.episodesCount} حلقة)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-neutral-300 block mb-1">
            اختر الموسم (يدعم جميع المواسم الـ 10 لوقت المغامرة وغيرها):
          </label>
          <select
            value={activeSeason.id}
            onChange={(e) => setSelectedSeasonId(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 cursor-pointer"
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                موسم {s.seasonNumber}: {s.title} ({(s.episodes || []).length} حلقة)
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-end gap-2">
          <div className="flex-1">
            <label className="text-[11px] font-bold text-neutral-400 block mb-1">
              عنوان الموسم المعروض للزوار (اختياري):
            </label>
            <input
              type="text"
              value={draftSeasonTitle}
              onChange={(e) => {
                setDraftSeasonTitle(e.target.value);
                setTitleDirty(true);
              }}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
            />
          </div>
          {titleDirty && (
            <button
              type="button"
              disabled={savingCloud}
              onClick={() => void handleSaveSeasonToCloud()}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-xs shrink-0 cursor-pointer"
            >
              حفظ عنوان الموسم
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Action Toolbar */}
      <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={savingCloud}
            onClick={() => setShowAddForm((prev) => !prev)}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1 cursor-pointer shadow disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إضافة حلقة جديدة</span>
          </button>

          <button
            type="button"
            disabled={selectedIds.length < 2 || savingCloud}
            onClick={() => void handleMergeSelected()}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors border ${
              selectedIds.length >= 2 && !savingCloud
                ? 'bg-violet-600 hover:bg-violet-500 text-white border-violet-500 cursor-pointer shadow'
                : 'bg-neutral-900 text-neutral-500 border-neutral-800 cursor-not-allowed'
            }`}
            title="حدّد حلقتين أو أكثر بالصناديق ثم اضغط دمج"
          >
            <Combine className="w-3.5 h-3.5" />
            <span>دمج المحددة ({selectedIds.length}) في حلقة واحدة</span>
          </button>

          <button
            type="button"
            disabled={savingCloud}
            onClick={() => void handleAutoRenumber()}
            className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-[11px] font-bold cursor-pointer disabled:opacity-50"
          >
            ترقيم تلقائي (1..{draftEpisodes.length})
          </button>

          <button
            type="button"
            disabled={savingCloud || Boolean(fillingArchiveId)}
            onClick={() => {
              const nextOpen = !showArchiveFill;
              setShowArchiveFill(nextOpen);
              if (nextOpen) {
                const defaultQ = series.originalTitle || series.title;
                setArchiveFillQuery(defaultQ);
                void handleSearchArchiveFill(defaultQ);
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/40 text-[11px] font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="تعبئة وربط فيديوهات MP4 كاملة تلقائياً لهذا العمل من Archive.org"
          >
            {fillingArchiveId ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            <span>تعبئة الفيديوهات من Archive.org</span>
          </button>

          <button
            type="button"
            disabled={savingCloud || syncingTmdb}
            onClick={() => void handleSyncSeasonFromTmdb()}
            className="px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/35 text-sky-300 border border-sky-500/40 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="جلب عناوين الحلقات والقصة الصغيرة والممثلين من TMDB وحفظها"
          >
            <Sparkles className={`w-3.5 h-3.5 ${syncingTmdb ? 'animate-spin' : ''}`} />
            <span>{syncingTmdb ? 'جاري الجلب من TMDB...' : 'مزامنة الحلقات من TMDB'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowTmdbSearch((v) => !v);
              setTmdbSearchQuery(series.originalTitle || series.title);
            }}
            className="px-2.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 text-[11px] font-bold cursor-pointer"
          >
            تغيير ربط TMDB
          </button>

          {isSeasonCustomized && (
            <button
              type="button"
              disabled={savingCloud}
              onClick={() => void handleResetSeasonDefault()}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-amber-400 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              <span>استرجاع الافتراضي</span>
            </button>
          )}
        </div>

        <div
          className={`px-3 py-1.5 rounded-xl font-bold text-[11px] flex items-center gap-1.5 border ${
            savingCloud
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
          }`}
        >
          <Cloud className={`w-3.5 h-3.5 ${savingCloud ? 'animate-pulse' : ''}`} />
          <span>
            {savingCloud
              ? 'جاري الحفظ التلقائي في Firebase...'
              : 'الحفظ التلقائي بالسحابة مفعّل'}
          </span>
        </div>
      </div>

      {/* Instructions Note */}
      <div className="px-3.5 py-2 rounded-xl bg-violet-950/30 border border-violet-500/30 text-[11px] text-violet-200 flex flex-wrap items-center justify-between gap-2">
        <span>
          <strong>كل تعديل أو فصل أو دمج يُحفظ فوراً في السحابة تلقائياً:</strong> لفصل حلقة مدمجة اضغط <strong>«فصل لحلقتين»</strong>، ولتغيير اسمها أو رابط Google Drive اضغط <strong>«تعديل»</strong>.
        </span>
        <span className="font-mono text-violet-300 font-bold">
          إجمالي: {draftEpisodes.length} حلقة
        </span>
      </div>

      {/* Optional TMDB Manual Match Picker */}
      {showTmdbSearch && (
        <div className="p-3.5 rounded-2xl bg-neutral-950 border border-sky-500/40 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-sky-300">
              ربط «{series.title}» يدوياً بصفحة TMDB الصحيحة
            </span>
            <button
              type="button"
              onClick={() => setShowTmdbSearch(false)}
              className="text-neutral-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tmdbSearchQuery}
              onChange={(e) => setTmdbSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم الإنجليزي أو العربي..."
              className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white"
            />
            <button
              type="button"
              disabled={searchingTmdb}
              onClick={() => void handleAdminTmdbSearch()}
              className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs cursor-pointer"
            >
              {searchingTmdb ? 'جاري البحث...' : 'بحث'}
            </button>
          </div>
          {tmdbSearchResults.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto">
              {tmdbSearchResults.map((m) => (
                <button
                  key={`${m.mediaType}-${m.tmdbId}`}
                  type="button"
                  onClick={() => void handleBindTmdbMatch(m)}
                  className="flex items-center gap-2.5 p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-right cursor-pointer"
                >
                  {m.posterUrl && (
                    <img src={m.posterUrl} alt={m.title} className="w-9 h-12 rounded object-cover shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-white truncate">{m.title}</div>
                    <div className="text-[10px] text-neutral-400 truncate" dir="ltr">
                      {m.originalTitle} · #{m.tmdbId}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Archive.org Auto-Fill Video Episodes Picker */}
      {showArchiveFill && (
        <div className="p-3.5 rounded-2xl bg-neutral-950 border border-emerald-500/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
              <Play className="w-4 h-4 text-emerald-400" />
              <span>تعبئة الحلقات بفيديوهات MP4 كاملة من Archive.org لـ «{series.title}»</span>
            </span>
            <button
              type="button"
              onClick={() => setShowArchiveFill(false)}
              className="text-neutral-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={archiveFillQuery}
              onChange={(e) => setArchiveFillQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSearchArchiveFill();
                }
              }}
              placeholder="ابحث بالاسم الإنجليزي أو العربي (مثال: Death Note أو Spider-Man)..."
              className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              disabled={archiveFillSearching}
              onClick={() => void handleSearchArchiveFill()}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs cursor-pointer disabled:opacity-50"
            >
              {archiveFillSearching ? 'جاري البحث...' : 'بحث Archive'}
            </button>
          </div>

          {fillingArchiveId && archiveFillProgress && (
            <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/30 text-xs text-emerald-200 font-bold flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
              <span>
                جاري تعبئة وحفظ الفيديوهات في السحابة ({archiveFillProgress.done}/{archiveFillProgress.total})...
              </span>
            </div>
          )}

          {archiveFillResults.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto">
              {archiveFillResults.map((item) => {
                const isFillingThis = fillingArchiveId === item.identifier;
                return (
                  <div
                    key={item.identifier}
                    className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center gap-2.5"
                  >
                    <img
                      src={item.posterUrl}
                      alt={item.title}
                      className="w-11 h-16 rounded-lg object-cover shrink-0 bg-neutral-800"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-xs font-bold text-white truncate">{item.title}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-400">
                        {item.year && <span>{item.year}</span>}
                        {typeof item.episodesCount === 'number' && item.episodesCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">
                            {item.episodesCount} {item.episodesCount === 1 ? 'فيديو MP4' : 'حلقة MP4'}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={Boolean(fillingArchiveId)}
                        onClick={() => void handleApplyArchiveFill(item)}
                        className="w-full px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                      >
                        {isFillingThis ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>جاري التعبئة...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3" />
                            <span>تعبئة الحلقات من هذا المصدر</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add New Episode Form */}
      {showAddForm && (
        <form
          onSubmit={(e) => void handleAddNewEpisode(e)}
          className="p-4 rounded-2xl bg-neutral-950 border border-rose-500/40 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-white">إضافة حلقة جديدة إلى {activeSeason.title}</h4>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-neutral-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-6">
              <label className="text-[11px] font-bold text-neutral-300 block mb-1">
                عنوان الحلقة:
              </label>
              <input
                type="text"
                value={newEpTitle}
                onChange={(e) => setNewEpTitle(e.target.value)}
                placeholder={`مثال: الحلقة ${draftEpisodes.length + 1}: ...`}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="text-[11px] font-bold text-neutral-300 block mb-1">
                نوع الحلقة:
              </label>
              <select
                value={newEpIsMerged ? 'merged' : 'single'}
                onChange={(e) => {
                  const merged = e.target.value === 'merged';
                  setNewEpIsMerged(merged);
                  if (merged && newEpDuration === '11:00') setNewEpDuration('22:00');
                  if (!merged && newEpDuration === '22:00') setNewEpDuration('11:00');
                }}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-2 text-xs text-white cursor-pointer"
              >
                <option value="single">حلقة عادية (منفردة)</option>
                <option value="merged">حلقة مدمجة (2+ في 1)</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="text-[11px] font-bold text-neutral-300 block mb-1">
                المدة:
              </label>
              <input
                type="text"
                value={newEpDuration}
                onChange={(e) => setNewEpDuration(e.target.value)}
                dir="ltr"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-mono text-white"
              />
            </div>

            <div className="sm:col-span-12">
              <label className="text-[11px] font-bold text-neutral-300 block mb-1">
                رابط Google Drive (اختياري):
              </label>
              <input
                type="text"
                value={newEpDriveLink}
                onChange={(e) => setNewEpDriveLink(e.target.value)}
                placeholder="https://drive.google.com/file/d/.../view"
                dir="ltr"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-mono text-white"
              />
            </div>

            <div className="sm:col-span-12">
              <label className="text-[11px] font-bold text-neutral-300 block mb-1">
                وصف الحلقة (اختياري):
              </label>
              <input
                type="text"
                value={newEpDesc}
                onChange={(e) => setNewEpDesc(e.target.value)}
                placeholder="ملخص أحداث الحلقة..."
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingCloud}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{savingCloud ? 'جاري الحفظ...' : 'إضافة وحفظ في السحابة'}</span>
          </button>
        </form>
      )}

      {/* Episodes List */}
      <div className="space-y-2">
        {draftEpisodes.map((ep, idx) => {
          const isChecked = selectedIds.includes(ep.id);
          const isEditing = editingEpId === ep.id;
          const isMerged = isEpisodeDetectedAsMerged(ep);
          const hasDrive = Boolean(allSources[ep.id]?.driveLink || allSources[ep.id]?.videoUrl);

          return (
            <div
              key={ep.id}
              className={`rounded-xl border transition-colors ${
                isChecked
                  ? 'bg-violet-950/30 border-violet-500/60'
                  : isEditing
                  ? 'bg-neutral-950 border-amber-500/60'
                  : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSelectEpisode(ep.id)}
                    className="w-4 h-4 mt-1 sm:mt-0 accent-violet-500 rounded cursor-pointer shrink-0"
                    title="تحديد للدمج"
                  />

                  <span className="text-xs font-mono font-black text-rose-400 bg-rose-500/10 border border-rose-500/25 px-2 py-0.5 rounded shrink-0">
                    #{ep.episodeNumber}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isMerged
                            ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                            : 'bg-neutral-800 text-neutral-300 border-neutral-700'
                        }`}
                      >
                        {isMerged ? 'حلقة مدمجة' : 'حلقة عادية'}
                      </span>
                      <span className="text-[10px] font-mono text-neutral-400">
                        {ep.duration}
                      </span>
                      {hasDrive && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          {allSources[ep.id]?.accountLabel?.includes('Archive.org')
                            ? 'فيديو Archive.org جاهز'
                            : 'مربوطة بدرايف'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-bold text-white truncate">{ep.title}</div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditEpisode(ep)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer border ${
                      isEditing
                        ? 'bg-amber-500 text-neutral-950 border-amber-400'
                        : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border-neutral-700'
                    }`}
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>تعديل</span>
                  </button>

                  <button
                    type="button"
                    disabled={savingCloud}
                    onClick={() => void handleSplitEpisode(ep.id, 2)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer border disabled:opacity-50 ${
                      isMerged
                        ? 'bg-sky-600/20 hover:bg-sky-600/35 text-sky-300 border-sky-500/40'
                        : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-400 border-neutral-800'
                    }`}
                    title="فصل إلى حلقتين عاديتين"
                  >
                    <Split className="w-3 h-3" />
                    <span>فصل لحلقتين</span>
                  </button>

                  <button
                    type="button"
                    disabled={idx === 0 || savingCloud}
                    onClick={() => void handleMoveEpisode(idx, -1)}
                    className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 disabled:opacity-30 cursor-pointer"
                    title="تحريك للأعلى"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === draftEpisodes.length - 1 || savingCloud}
                    onClick={() => void handleMoveEpisode(idx, 1)}
                    className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 disabled:opacity-30 cursor-pointer"
                    title="تحريك للأسفل"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>

                  <button
                    type="button"
                    disabled={savingCloud}
                    onClick={() => void handleDeleteEpisode(ep.id)}
                    className="p-1.5 rounded-lg bg-neutral-900 hover:bg-rose-600/30 text-rose-400 border border-rose-500/20 cursor-pointer disabled:opacity-50"
                    title="حذف الحلقة من الموسم"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Inline Episode Editor */}
              {isEditing && (
                <form
                  onSubmit={(e) => void handleApplyEpisodeEdit(e)}
                  className="p-3.5 pt-2 border-t border-neutral-800 bg-neutral-900/50 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-neutral-300 block mb-1">
                        رقم الحلقة:
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={epNumInput}
                        onChange={(e) => setEpNumInput(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                    </div>

                    <div className="sm:col-span-5">
                      <label className="text-[11px] font-bold text-neutral-300 block mb-1">
                        عنوان الحلقة:
                      </label>
                      <input
                        type="text"
                        value={epTitleInput}
                        onChange={(e) => setEpTitleInput(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="text-[11px] font-bold text-neutral-300 block mb-1">
                        الحالة (مدمجة / عادية):
                      </label>
                      <select
                        value={epIsMergedInput ? 'merged' : 'single'}
                        onChange={(e) => {
                          const merged = e.target.value === 'merged';
                          setEpIsMergedInput(merged);
                          if (merged && epDurationInput === '11:00') setEpDurationInput('22:00');
                          if (!merged && epDurationInput === '22:00') setEpDurationInput('11:00');
                        }}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white cursor-pointer"
                      >
                        <option value="single">حلقة عادية</option>
                        <option value="merged">حلقة مدمجة</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-neutral-300 block mb-1">
                        المدة:
                      </label>
                      <input
                        type="text"
                        value={epDurationInput}
                        onChange={(e) => setEpDurationInput(e.target.value)}
                        dir="ltr"
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                    </div>

                    <div className="sm:col-span-12">
                      <label className="text-[11px] font-bold text-blue-300 block mb-1">
                        رابط Google Drive المباشر لهذه الحلقة (اختياري):
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={epDriveLinkInput}
                          onChange={(e) => setEpDriveLinkInput(e.target.value)}
                          placeholder="https://drive.google.com/file/d/.../view"
                          dir="ltr"
                          className="flex-1 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white"
                        />
                        {extractDriveFileId(epDriveLinkInput) && (
                          <span className="text-[10px] font-bold text-emerald-400 shrink-0 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            <span>صحيح</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="sm:col-span-12">
                      <label className="text-[11px] font-bold text-neutral-300 block mb-1">
                        وصف الحلقة:
                      </label>
                      <textarea
                        rows={2}
                        value={epDescInput}
                        onChange={(e) => setEpDescInput(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={savingCloud}
                        className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{savingCloud ? 'جاري الحفظ...' : 'حفظ التعديل في السحابة'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={savingCloud}
                        onClick={() => void handleSplitEpisode(ep.id, 3)}
                        className="px-2.5 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                      >
                        فصل إلى 3 حلقات
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEditingEpId(null)}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold cursor-pointer"
                    >
                      إغلاق
                    </button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
