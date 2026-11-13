import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Image as ImageIcon,
  Upload,
  CheckCircle2,
  Sparkles,
  Trash2,
  Edit3,
  Link2,
  Tv,
  Film,
  Volume2,
  AlertCircle,
  Save,
} from 'lucide-react';
import {
  CustomWorkCategory,
  CustomWorkRecord,
  compressImageFileToDataUrl,
  saveCustomWorkToCloud,
  deleteCustomWorkFromCloud,
  getCustomWorkRecords,
  CUSTOM_WORKS_UPDATED_EVENT,
} from '../utils/customWorks.ts';

interface AdminCreateWorkModalProps {
  isOpen: boolean;
  defaultCategory: CustomWorkCategory;
  onClose: () => void;
  onOpenLinksDashboard?: (seriesId: string, episodeId?: string) => void;
}

const CATEGORY_INFO: Record<
  CustomWorkCategory,
  { label: string; buttonText: string; badgeClass: string; icon: React.ReactNode }
> = {
  anime: {
    label: 'قسم الأنمي',
    buttonText: 'نشر الأنمي في القسم',
    badgeClass: 'bg-rose-600/20 text-rose-400 border-rose-500/30',
    icon: <Tv className="w-4 h-4 text-rose-400" />,
  },
  movie: {
    label: 'قسم الأفلام',
    buttonText: 'نشر الفيلم في القسم',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    icon: <Film className="w-4 h-4 text-amber-400" />,
  },
  dubbed: {
    label: 'قسم الأعمال المدبلجة',
    buttonText: 'نشر المسلسل في القسم',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: <Volume2 className="w-4 h-4 text-emerald-400" />,
  },
};

export const AdminCreateWorkModal: React.FC<AdminCreateWorkModalProps> = ({
  isOpen,
  defaultCategory,
  onClose,
  onOpenLinksDashboard,
}) => {
  const [category, setCategory] = useState<CustomWorkCategory>(defaultCategory);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('');
  const [originalTitle, setOriginalTitle] = useState<string>('');
  const [coverImage, setCoverImage] = useState<string>('');
  const [synopsis, setSynopsis] = useState<string>('');
  const [genresText, setGenresText] = useState<string>('مغامرات، أكشن');
  const [dubStudio, setDubStudio] = useState<string>('');
  const [seasonsCount, setSeasonsCount] = useState<number>(1);
  const [episodesCount, setEpisodesCount] = useState<number>(12);
  const [rating, setRating] = useState<number>(9.2);
  const [saving, setSaving] = useState<boolean>(false);
  const [imageProcessing, setImageProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedWork, setSavedWork] = useState<CustomWorkRecord | null>(null);
  const [existingList, setExistingList] = useState<CustomWorkRecord[]>([]);

  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCategory(defaultCategory);
      setSavedWork(null);
      setErrorMsg(null);
    }
  }, [isOpen, defaultCategory]);

  useEffect(() => {
    const refreshList = () => {
      setExistingList(getCustomWorkRecords(category));
    };
    refreshList();
    window.addEventListener(CUSTOM_WORKS_UPDATED_EVENT, refreshList);
    return () => window.removeEventListener(CUSTOM_WORKS_UPDATED_EVENT, refreshList);
  }, [category, isOpen]);

  if (!isOpen) return null;

  const resetForm = () => {
    setEditingWorkId(null);
    setTitle('');
    setOriginalTitle('');
    setCoverImage('');
    setSynopsis('');
    setGenresText(category === 'movie' ? 'سينما، مغامرات' : 'مغامرات، أكشن');
    setDubStudio('');
    setSeasonsCount(1);
    setEpisodesCount(category === 'movie' ? 1 : 12);
    setRating(9.2);
    setErrorMsg(null);
  };

  const handleSelectEdit = (work: CustomWorkRecord) => {
    setEditingWorkId(work.workId);
    setCategory(work.category);
    setTitle(work.title);
    setOriginalTitle(work.originalTitle);
    setCoverImage(work.coverImage);
    setSynopsis(work.synopsis);
    setGenresText(work.genres.join('، '));
    setDubStudio(work.dubStudio);
    setSeasonsCount(work.seasonsCount);
    setEpisodesCount(work.episodesCount);
    setRating(work.rating);
    setSavedWork(null);
    setErrorMsg(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageProcessing(true);
    setErrorMsg(null);
    try {
      const compressed = await compressImageFileToDataUrl(file);
      setCoverImage(compressed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تحميل الصورة');
    } finally {
      setImageProcessing(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!title.trim()) {
      setErrorMsg('يرجى كتابة اسم العمل.');
      return;
    }
    if (!coverImage.trim()) {
      setErrorMsg('يرجى رفع صورة غلاف من جهازك أو وضع رابط الصورة.');
      return;
    }
    if (!synopsis.trim()) {
      setErrorMsg('يرجى كتابة وصف (Description) للعمل.');
      return;
    }

    setSaving(true);
    try {
      const parsedGenres = genresText
        .split(/[،,]+/)
        .map((g) => g.trim())
        .filter(Boolean);

      const saved = await saveCustomWorkToCloud({
        workId: editingWorkId || undefined,
        category,
        title: title.trim(),
        originalTitle: originalTitle.trim(),
        coverImage: coverImage.trim(),
        bannerImage: coverImage.trim(),
        genres: parsedGenres.length > 0 ? parsedGenres : ['مغامرات'],
        dubStudio: dubStudio.trim() || 'إضافة المالك',
        rating,
        seasonsCount: category === 'movie' ? 1 : seasonsCount,
        episodesCount: category === 'movie' ? 1 : episodesCount,
        synopsis: synopsis.trim(),
      });

      setSavedWork(saved);
      resetForm();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ في السحابة');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (work: CustomWorkRecord) => {
    if (!window.confirm(`هل تريد حذف «${work.title}» من الموقع نهائياً؟`)) return;
    try {
      await deleteCustomWorkFromCloud(work.workId);
      if (editingWorkId === work.workId) {
        resetForm();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر حذف العمل');
    }
  };

  const info = CATEGORY_INFO[category];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2 sm:p-4 backdrop-blur-md overflow-y-auto"
      dir="rtl"
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      <div className="relative w-full max-w-3xl bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl flex flex-col my-auto max-h-[92vh] overflow-hidden text-neutral-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center">
              {info.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black text-white">
                  {editingWorkId ? 'تعديل العمل المضاف' : 'إضافة عمل جديد للموقع'}
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  خاص بالمالك فقط (مخفي عن الزوار)
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                ضع الصورة والاسم والوصف وسيظهر العمل فوراً في القسم ويُحفظ في سحابة Firebase للأبد، ثم أضف روابط الحلقات.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {/* Category Picker */}
          <div className="grid grid-cols-3 gap-2 bg-neutral-950 p-1.5 rounded-xl border border-neutral-800">
            {(['anime', 'movie', 'dubbed'] as CustomWorkCategory[]).map((cat) => {
              const catInfo = CATEGORY_INFO[cat];
              const active = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setCategory(cat);
                    setSavedWork(null);
                    if (!editingWorkId) {
                      setEpisodesCount(cat === 'movie' ? 1 : 12);
                    }
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    active
                      ? 'bg-rose-600 text-white shadow'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                  }`}
                >
                  {catInfo.icon}
                  <span>{catInfo.label}</span>
                </button>
              );
            })}
          </div>

          {/* Success Banner with Direct Link-Adding Button */}
          {savedWork && (
            <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs sm:text-sm font-black text-emerald-300">
                    تم نشر «{savedWork.title}» وحفظه في السحابة للأبد!
                  </div>
                  <div className="text-[11px] text-emerald-200/80 mt-0.5">
                    يظهر الآن في القسم لجميع الزوار. يمكنك الآن إضافة روابط Google Drive للحلقات.
                  </div>
                </div>
              </div>

              {onOpenLinksDashboard && (
                <button
                  type="button"
                  onClick={() => {
                    const firstEpId =
                      savedWork.category === 'movie'
                        ? `${savedWork.workId}-movie-1`
                        : `${savedWork.workId}-ep-1`;
                    onClose();
                    onOpenLinksDashboard(savedWork.workId, firstEpId);
                  }}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-xs rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer shadow"
                >
                  <Link2 className="w-4 h-4" />
                  <span>إضافة الروابط الآن</span>
                </button>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Create / Edit Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Cover Image + Title Row */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
              {/* Image Preview & Upload */}
              <div className="sm:col-span-4 space-y-2">
                <label className="text-xs font-bold text-neutral-200 block">
                  صورة الغلاف:
                </label>
                <div
                  onClick={() => imageInputRef.current?.click()}
                  className="aspect-[2/3] w-full max-w-[180px] mx-auto rounded-2xl border-2 border-dashed border-neutral-700 hover:border-rose-500 bg-neutral-950 overflow-hidden flex flex-col items-center justify-center cursor-pointer relative group transition-colors"
                >
                  {coverImage ? (
                    <>
                      <img
                        src={coverImage}
                        alt="معاينة الغلاف"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-bold gap-1">
                        <Upload className="w-5 h-5" />
                        <span>تغيير الصورة</span>
                      </div>
                    </>
                  ) : (
                    <div className="p-4 text-center space-y-2">
                      <ImageIcon className="w-8 h-8 text-neutral-500 mx-auto" />
                      <div className="text-xs font-bold text-neutral-300">
                        {imageProcessing ? 'جاري ضغط الصورة...' : 'اضغط لرفع صورة من جهازك'}
                      </div>
                    </div>
                  )}
                </div>

                <input
                  type="text"
                  value={coverImage.startsWith('data:') ? '' : coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  placeholder="أو الصق رابط الصورة هنا..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-neutral-200 focus:outline-none focus:border-rose-500"
                  dir="ltr"
                />
              </div>

              {/* Fields */}
              <div className="sm:col-span-8 space-y-3">
                <div>
                  <label className="text-xs font-bold text-neutral-200 block mb-1">
                    اسم العمل (يظهر للزوار):
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      category === 'movie'
                        ? 'مثال: فيلم اسمك (Your Name)'
                        : category === 'anime'
                        ? 'مثال: هجوم العمالقة'
                        : 'مثال: عالم غامبول المدهش'
                    }
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-neutral-300 block mb-1">
                      الاسم الإنجليزي / الأصلي (اختياري):
                    </label>
                    <input
                      type="text"
                      value={originalTitle}
                      onChange={(e) => setOriginalTitle(e.target.value)}
                      placeholder="Attack on Titan"
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-neutral-300 block mb-1">
                      التصنيفات (افصل بفاصلة):
                    </label>
                    <input
                      type="text"
                      value={genresText}
                      onChange={(e) => setGenresText(e.target.value)}
                      placeholder="أكشن، مغامرات، فانتازيا"
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-neutral-200 block mb-1">
                    الوصف (Description / قصة العمل):
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={synopsis}
                    onChange={(e) => setSynopsis(e.target.value)}
                    placeholder="اكتب نبذة القصة التي ستظهر للزوار..."
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl p-3 text-xs text-white leading-relaxed focus:outline-none focus:border-rose-500"
                  />
                </div>

                {/* Fields may be cleared while typing (NaN = empty); values are clamped on save */}
                <div className={`grid gap-3 ${category !== 'movie' ? 'grid-cols-3' : 'grid-cols-1'}`}>
                  {category !== 'movie' && (
                    <>
                    <div>
                      <label className="text-xs font-bold text-neutral-300 block mb-1">
                        عدد المواسم:
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={Number.isFinite(seasonsCount) ? seasonsCount : ''}
                        onChange={(e) => setSeasonsCount(e.target.value === '' ? NaN : Number(e.target.value))}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-neutral-300 block mb-1">
                        عدد الحلقات:
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={300}
                        value={Number.isFinite(episodesCount) ? episodesCount : ''}
                        onChange={(e) => setEpisodesCount(e.target.value === '' ? NaN : Number(e.target.value))}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    </>
                  )}
                    <div>
                      <label className="text-xs font-bold text-neutral-300 block mb-1">
                        التقييم:
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        max={10}
                        value={Number.isFinite(rating) ? rating : ''}
                        onChange={(e) => setRating(e.target.value === '' ? NaN : Number(e.target.value))}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-rose-500"
                      />
                    </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-neutral-300 block mb-1">
                    الاستوديو / المترجم (اختياري):
                  </label>
                  <input
                    type="text"
                    value={dubStudio}
                    onChange={(e) => setDubStudio(e.target.value)}
                    placeholder="مثال: دبلجة عربية / ترجمة خاصة"
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>
            </div>

            {/* Submit Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-800">
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={saving || imageProcessing}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-lg shadow-rose-950 flex items-center gap-2 cursor-pointer transition-all"
                >
                  {editingWorkId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  <span>
                    {saving
                      ? 'جاري الحفظ في السحابة...'
                      : editingWorkId
                      ? 'حفظ التعديلات في السحابة'
                      : info.buttonText}
                  </span>
                </button>

                {editingWorkId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    إلغاء التعديل
                  </button>
                )}
              </div>

              <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>يُحفظ في Firebase ويظهر فوراً لكل الزوار</span>
              </span>
            </div>
          </form>

          {/* Existing Owner-Added Works in This Section */}
          {existingList.length > 0 && (
            <div className="pt-4 border-t border-neutral-800 space-y-2.5">
              <h3 className="text-xs font-bold text-neutral-300">
                الأعمال التي أضفتها في {info.label} ({existingList.length}):
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {existingList.map((work) => (
                  <div
                    key={work.workId}
                    className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center gap-3"
                  >
                    <img
                      src={work.coverImage}
                      alt={work.title}
                      className="w-11 h-14 object-cover rounded-lg shrink-0 bg-neutral-800"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate">{work.title}</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">
                        {work.category === 'movie'
                          ? 'فيلم كامل'
                          : `${work.episodesCount} حلقة · ${work.seasonsCount} موسم`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {onOpenLinksDashboard && (
                        <button
                          type="button"
                          onClick={() => {
                            const firstEp =
                              work.category === 'movie'
                                ? `${work.workId}-movie-1`
                                : `${work.workId}-ep-1`;
                            onClose();
                            onOpenLinksDashboard(work.workId, firstEp);
                          }}
                          className="p-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 cursor-pointer"
                          title="إضافة / تعديل روابط الحلقات"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSelectEdit(work)}
                        className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 cursor-pointer"
                        title="تعديل الوصف أو الصورة أو عدد الحلقات"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(work)}
                        className="p-1.5 rounded-lg bg-neutral-800 hover:bg-rose-600/30 text-neutral-400 hover:text-rose-400 cursor-pointer"
                        title="حذف العمل"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
