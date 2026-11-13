import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  X,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  BookOpen,
  LayoutGrid,
  List,
  Sparkles,
  Upload,
  CheckCircle2,
  HardDrive
} from 'lucide-react';
import { getStoredChapterPages, saveChapterPages } from '../utils/comicStorage';

interface ComicReaderProps {
  comicId?: string;
  chapterId?: string;
  title: string;
  chapterTitle: string;
  pages: string[];
  initialPage?: number;
  onClose: () => void;
  onNextChapter?: () => void;
  onPrevChapter?: () => void;
}

export const ComicReader: React.FC<ComicReaderProps> = ({
  comicId = 'adventure-time',
  chapterId = 'at-ch-1',
  title,
  chapterTitle,
  pages: initialPages,
  initialPage = 0,
  onClose,
}) => {
  const [pages, setPages] = useState<string[]>(initialPages);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [readingMode, setReadingMode] = useState<'single' | 'webtoon'>('single');
  const [showThumbnails, setShowThumbnails] = useState<boolean>(false);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const [brokenPages, setBrokenPages] = useState<Record<number, boolean>>({});
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load any previously imported pages from IndexedDB for this specific comic & chapter
  useEffect(() => {
    let isMounted = true;
    const loadStoredPages = async () => {
      if (!comicId || !chapterId) return;
      try {
        const stored = await getStoredChapterPages(comicId, chapterId);
        if (isMounted && stored && stored.length > 0) {
          setPages(stored);
          setBrokenPages({});
        } else if (isMounted) {
          setPages(initialPages);
          setBrokenPages({});
        }
      } catch {
        if (isMounted) {
          setPages(initialPages);
        }
      }
    };
    loadStoredPages();
    return () => {
      isMounted = false;
    };
  }, [comicId, chapterId, initialPages]);

  // Handle files selected via file dialog
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setIsImporting(true);
    try {
      // Natural alphanumeric sort by filename so 01.JPG, 02.JPG, ... 17.JPG are in order
      const filesArray = Array.from(fileList).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      );

      const dataUrlPromises = filesArray.map((file) => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });
      });

      const dataUrls = await Promise.all(dataUrlPromises);

      if (dataUrls.length > 0) {
        setPages(dataUrls);
        setBrokenPages({});
        setCurrentPage(0);
        // Persist to browser's IndexedDB
        if (comicId && chapterId) {
          await saveChapterPages(comicId, chapterId, dataUrls);
        }
        setImportSuccessMessage(`تم استيراد ${dataUrls.length} صفحة بنجاح وتثبيتها في قارئ الكوميكس!`);
        setTimeout(() => setImportSuccessMessage(null), 5000);
      }
    } catch (err) {
      console.error('Error importing pages:', err);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const nextPage = useCallback(() => {
    if (currentPage < pages.length - 1) {
      setCurrentPage((prev) => prev + 1);
      setZoomLevel(1);
    }
  }, [currentPage, pages.length]);

  const prevPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage((prev) => prev - 1);
      setZoomLevel(1);
    }
  }, [currentPage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        nextPage();
      } else if (e.key === 'ArrowRight') {
        prevPage();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextPage, prevPage, onClose]);

  // Auto-hide controls after inactivity
  const handleMouseMove = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 4000);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-50 flex flex-col bg-neutral-950/98 text-white select-none backdrop-blur-xl"
      dir="rtl"
    >
      {/* Hidden File Input for Batch Importing Images */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleFilesSelected}
        className="hidden"
      />

      {/* Success Notification Banner */}
      {importSuccessMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-5 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 border border-emerald-400 font-medium text-xs sm:text-sm animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-100 flex-shrink-0" />
          <span>{importSuccessMessage}</span>
        </div>
      )}

      {/* Top Floating Control Bar */}
      <div
        className={`fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-4 sm:px-8 py-3 bg-gradient-to-b from-black/90 via-black/70 to-transparent transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-700/60 text-neutral-300 hover:text-white transition-all cursor-pointer"
            title="إغلاق العارض (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span className="text-rose-500 font-black">AniVerse</span>
              <span>·</span>
              <span>{title}</span>
            </h2>
            <p className="text-xs text-neutral-400">{chapterTitle}</p>
          </div>
        </div>

        {/* View Mode, Zoom & Import Controls */}
        <div className="flex items-center gap-2">
          {/* Direct File Import Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-700/80 text-xs text-neutral-200 hover:text-white transition-all cursor-pointer shadow-sm"
            title="استيراد وتحديث صور الفصل من جهازك مباشرة"
          >
            <Upload className="w-3.5 h-3.5 text-rose-400" />
            <span>{isImporting ? 'جاري التحميل...' : 'استيراد صور الفصل'}</span>
          </button>

          {/* Reading Mode Switch */}
          <div className="flex items-center bg-neutral-900/90 rounded-lg p-1 border border-neutral-800">
            <button
              onClick={() => setReadingMode('single')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                readingMode === 'single'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="صفحة بعد صفحة (سلاسة)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تقليب صفحات</span>
            </button>
            <button
              onClick={() => setReadingMode('webtoon')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                readingMode === 'webtoon'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="تمرير رأسي (ويب تون)"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تمرير رأسي</span>
            </button>
          </div>

          {/* Zoom controls (Only in Single Page Mode) */}
          {readingMode === 'single' && (
            <div className="hidden md:flex items-center bg-neutral-900/90 rounded-lg p-1 border border-neutral-800 gap-1">
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.7, z - 0.2))}
                className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                title="تصغير"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono text-neutral-400 px-1">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.2))}
                className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                title="تكبير"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoomLevel(1)}
                className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                title="إعادة ضبط الحجم"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Thumbnails Toggle */}
          <button
            onClick={() => setShowThumbnails(!showThumbnails)}
            className={`p-2 rounded-lg border transition-colors cursor-pointer ${
              showThumbnails
                ? 'bg-rose-600 text-white border-rose-500'
                : 'bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 border-neutral-800'
            }`}
            title="معاينة كافة الصفحات"
          >
            <BookOpen className="w-4 h-4" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition-colors cursor-pointer"
            title="ملء الشاشة"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Comic Viewer Area */}
      <div className="flex-1 w-full h-full overflow-auto flex items-center justify-center relative p-2 sm:p-4">
        {readingMode === 'single' ? (
          <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
            {/* Click Left Zone to navigate */}
            <div
              onClick={nextPage}
              className="absolute left-0 top-0 bottom-0 w-1/4 z-10 cursor-w-resize group flex items-center justify-start pl-4"
              title="الصفحة التالية"
            >
              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-neutral-900/80 text-white p-3 rounded-full border border-neutral-700 shadow-xl backdrop-blur">
                <ChevronLeft className="w-6 h-6" />
              </div>
            </div>

            {/* Click Right Zone to navigate */}
            <div
              onClick={prevPage}
              className="absolute right-0 top-0 bottom-0 w-1/4 z-10 cursor-e-resize group flex items-center justify-end pr-4"
              title="الصفحة السابقة"
            >
              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-neutral-900/80 text-white p-3 rounded-full border border-neutral-700 shadow-xl backdrop-blur">
                <ChevronRight className="w-6 h-6" />
              </div>
            </div>

            {/* Current Active Page Image */}
            <div
              className="relative max-h-full max-w-full flex items-center justify-center transition-transform duration-200 ease-out"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              {brokenPages[currentPage] ? (
                <div className="w-[360px] sm:w-[500px] bg-neutral-900/90 border border-neutral-800 rounded-3xl flex flex-col items-center justify-center p-8 text-center text-white shadow-2xl backdrop-blur-xl">
                  <div className="w-16 h-16 rounded-2xl bg-rose-600/20 text-rose-400 flex items-center justify-center mb-4 border border-rose-500/30">
                    <BookOpen className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold mb-1">
                    صفحة {currentPage + 1} من {pages.length}
                  </h3>
                  <p className="text-xs text-neutral-400 mb-6">{chapterTitle}</p>

                  <div className="bg-neutral-950/80 rounded-2xl p-4 border border-neutral-800 w-full mb-6">
                    <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed mb-4">
                      يمكنك تثبيت واستعراض صفحات هذا الفصل الـ {pages.length} بدقة كاملة وفورياً:
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isImporting}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-rose-950 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>{isImporting ? 'جاري الاستيراد...' : '📂 اضغط هنا لاختيار وتثبيت الـ 17 صفحة من جهازك'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono">
                    <HardDrive className="w-3.5 h-3.5 text-neutral-500" />
                    <span>يتم حفظ الصور محلياً في المتصفح للاستعراض السريع دون انقطاع</span>
                  </div>
                </div>
              ) : (
                <img
                  src={pages[currentPage]}
                  alt={`صفحة ${currentPage + 1}`}
                  onError={() => setBrokenPages((prev) => ({ ...prev, [currentPage]: true }))}
                  className="max-h-[85vh] sm:max-h-[90vh] w-auto object-contain rounded-md shadow-2xl border border-neutral-800/80"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>
          </div>
        ) : (
          /* Webtoon Continuous Vertical Scroll Mode */
          <div className="w-full max-w-3xl flex flex-col items-center gap-2 py-16">
            {pages.map((pageUrl, idx) => (
              <div key={idx} className="w-full relative group">
                {brokenPages[idx] ? (
                  <div className="w-full aspect-[16/10] bg-neutral-900/90 border border-neutral-800 rounded-2xl flex flex-col items-center justify-center p-6 text-center">
                    <BookOpen className="w-7 h-7 text-rose-500 mb-2" />
                    <span className="text-sm font-bold text-neutral-200 mb-1">
                      صفحة {idx + 1} من {pages.length}
                    </span>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-2 px-3 py-1.5 bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>استيراد الصور</span>
                    </button>
                  </div>
                ) : (
                  <img
                    src={pageUrl}
                    alt={`صفحة ${idx + 1}`}
                    loading="lazy"
                    onError={() => setBrokenPages((prev) => ({ ...prev, [idx]: true }))}
                    className="w-full h-auto object-contain rounded shadow-lg border border-neutral-900"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 text-[11px] font-mono text-neutral-300 rounded backdrop-blur">
                  {idx + 1} / {pages.length}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Bottom Navigation Controls (Single page mode) */}
      {readingMode === 'single' && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2.5 bg-neutral-900/90 border border-neutral-800 rounded-2xl shadow-2xl backdrop-blur-md transition-opacity duration-300 ${
            controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          <button
            onClick={prevPage}
            disabled={currentPage === 0}
            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold"
            title="الصفحة السابقة"
          >
            <ChevronRight className="w-4 h-4" />
            <span className="hidden sm:inline">السابق</span>
          </button>

          {/* Quick Page Slider / Selector */}
          <div className="flex items-center gap-2 px-2">
            <span className="text-xs font-mono font-bold text-rose-500 tabular-nums">
              {currentPage + 1}
            </span>
            <span className="text-xs text-neutral-500 font-mono">/</span>
            <span className="text-xs font-mono text-neutral-400 tabular-nums">
              {pages.length}
            </span>
            <input
              type="range"
              min="0"
              max={pages.length - 1}
              value={currentPage}
              onChange={(e) => setCurrentPage(parseInt(e.target.value, 10))}
              className="w-24 sm:w-36 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-rose-500 mr-2"
            />
          </div>

          <button
            onClick={nextPage}
            disabled={currentPage === pages.length - 1}
            className="p-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold"
            title="الصفحة التالية"
          >
            <span className="hidden sm:inline">التالي</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Slide-out Thumbnail Drawer */}
      {showThumbnails && (
        <div className="fixed inset-y-0 left-0 w-72 sm:w-80 bg-neutral-900/95 border-r border-neutral-800 z-30 p-4 overflow-y-auto backdrop-blur-xl animate-in slide-in-from-left duration-200">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-neutral-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-500" />
              فهرس الصفحات ({pages.length})
            </h3>
            <button
              onClick={() => setShowThumbnails(false)}
              className="p-1 rounded text-neutral-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {pages.map((pageUrl, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setCurrentPage(idx);
                  setShowThumbnails(false);
                }}
                className={`relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all cursor-pointer group ${
                  currentPage === idx
                    ? 'border-rose-500 shadow-md shadow-rose-950/50 scale-102'
                    : 'border-neutral-800 hover:border-neutral-600'
                }`}
              >
                <img
                  src={pageUrl}
                  alt={`صفحة ${idx + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-center p-1.5">
                  <span
                    className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      currentPage === idx ? 'bg-rose-600 text-white' : 'text-neutral-300 bg-black/60'
                    }`}
                  >
                    ص {idx + 1}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
