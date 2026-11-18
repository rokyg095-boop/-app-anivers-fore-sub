import React from 'react';
import { X, BookOpen, Heart, Layers, Star } from 'lucide-react';
import { Comic, ComicChapter } from '../data/mockData.ts';
import { useFavorites } from '../utils/favorites';

interface ComicDetailModalProps {
  comic: Comic;
  onClose: () => void;
  onReadChapter: (chapter: ComicChapter) => void;
}

export const ComicDetailModal: React.FC<ComicDetailModalProps> = ({
  comic,
  onClose,
  onReadChapter,
}) => {
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorited = isFavorite(comic.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#040711]/85 p-2 sm:p-5 backdrop-blur-2xl overflow-y-auto"
      dir="rtl"
      onClick={onClose}
    >
      {/* Ambient Backdrop */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <img
          src={comic.coverImage || comic.bannerImage}
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover scale-125 blur-3xl opacity-30"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#070b18]/65 via-[#050811]/75 to-[#04060d]/95" />
      </div>

      {/* Frosted Glass Detail Showcase */}
      <div
        className="relative w-full max-w-5xl rounded-3xl overflow-hidden border border-white/25 bg-[#0c1224]/60 backdrop-blur-3xl shadow-[0_32px_100px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/15 my-auto flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto flex-1">
          {/* Top Frosted Hero Header */}
          <div className="relative overflow-hidden border-b border-white/15">
            <div className="absolute inset-0 pointer-events-none">
              <img
                src={comic.bannerImage || comic.coverImage}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover opacity-45 scale-105"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-l from-[#090e1d]/95 via-[#090e1d]/75 to-[#0d1630]/35" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b1020] via-[#0b1020]/35 to-white/[0.06]" />
            </div>

            <div className="relative z-10 flex items-center justify-between gap-4 px-5 sm:px-8 py-4 border-b border-white/10 bg-white/[0.03] backdrop-blur-md">
              <span className="text-xs text-white/80 font-medium truncate">
                {comic.arabicPublisher}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
                <span>إغلاق</span>
              </button>
            </div>

            <div className="relative z-10 px-5 sm:px-8 py-6 sm:py-8">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-6 lg:gap-10">
                <div className="flex-1 text-right space-y-4 w-full">
                  <div className="space-y-2">
                    <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight [text-wrap:balance]">
                      {comic.title}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-white/80">
                      <span className="text-amber-300 font-bold flex items-center gap-1 tabular-nums">
                        <Star className="w-3.5 h-3.5 fill-amber-300" />
                        {comic.rating}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>الحالة: {comic.status}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{comic.chapters.length} فصول</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-white/75">{comic.genres.join('، ')}</span>
                    </div>
                    <p className="text-xs font-mono text-white/55" dir="ltr">
                      {comic.originalTitle}
                    </p>
                  </div>

                  <p className="text-xs sm:text-sm text-white/85 leading-relaxed max-w-2xl">
                    {comic.synopsis}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-white/75">
                    <span>المؤلف: <strong className="text-white">{comic.author}</strong></span>
                    <span>الرسام: <strong className="text-white">{comic.artist}</strong></span>
                    <span>المترجم: <strong className="text-violet-300">{comic.arabicTranslator}</strong></span>
                  </div>

                  <div className="pt-1 flex flex-wrap items-center gap-3">
                    {comic.chapters[0] && (
                      <button
                        type="button"
                        onClick={() => {
                          onReadChapter(comic.chapters[0]);
                          onClose();
                        }}
                        className="min-h-[44px] px-6 py-2.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/50 backdrop-blur-md text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg transition-all cursor-pointer"
                      >
                        <BookOpen className="w-4 h-4" />
                        <span>ابدأ القراءة الآن</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleFavorite(comic.id)}
                      className={`min-h-[44px] px-5 py-2.5 rounded-full border backdrop-blur-md font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer ${
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
                </div>

                {/* Framed Cover Poster */}
                <div className="w-40 sm:w-48 aspect-[2/3] rounded-2xl overflow-hidden shrink-0 border border-white/30 shadow-2xl bg-black/30">
                  <img
                    src={comic.coverImage}
                    alt={comic.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Chapters List inside Frost */}
          <div className="p-5 sm:p-8 space-y-4 bg-[#090e1c]/45">
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-300" />
              <span>فصول الكوميكس المتاحة ({comic.chapters.length})</span>
            </h3>

            <div className="space-y-2.5">
              {comic.chapters.map((ch) => (
                <div
                  key={ch.id}
                  className="flex items-center justify-between gap-3 p-3.5 bg-white/[0.06] hover:bg-white/[0.11] rounded-2xl border border-white/15 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-white/10 text-violet-200 font-mono font-bold flex items-center justify-center text-sm shrink-0 group-hover:bg-violet-600 group-hover:text-white transition-colors tabular-nums">
                      {ch.chapterNumber}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-white group-hover:text-violet-200 transition-colors truncate">
                        {ch.title}
                      </h4>
                      <div className="flex items-center gap-2 text-[11px] text-white/60 font-mono mt-0.5 tabular-nums">
                        <span>{ch.pagesCount} صفحة</span>
                        <span aria-hidden="true">·</span>
                        <span>{ch.releaseDate}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onReadChapter(ch);
                      onClose();
                    }}
                    className="min-h-[40px] px-4 py-2 bg-white/15 hover:bg-white/25 border border-white/30 text-white rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>قراءة الفصل</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
