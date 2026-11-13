import React from 'react';
import {
  X,
  BookOpen,
  Star,
  Eye,
  User,
  Palette,
  Globe,
  Share2,
  Calendar,
  Layers,
  ChevronLeft
} from 'lucide-react';
import { Comic, ComicChapter } from '../data/mockData.ts';

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
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-md overflow-y-auto"
      dir="rtl"
    >
      <div className="relative w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl my-auto">
        {/* Banner header */}
        <div className="relative h-44 sm:h-56 w-full bg-neutral-950 overflow-hidden">
          <img
            src={comic.bannerImage}
            alt={comic.title}
            className="w-full h-full object-cover opacity-40 filter blur-sm scale-105"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/60 to-transparent" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-2 rounded-full bg-neutral-950/80 hover:bg-neutral-800 text-white border border-neutral-700/50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Section */}
        <div className="relative px-6 pb-8 pt-0 -mt-20">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            {/* Poster Thumbnail */}
            <div className="w-36 sm:w-48 aspect-[2/3] rounded-2xl overflow-hidden border-2 border-rose-500/50 shadow-2xl bg-neutral-950 shrink-0 mx-auto sm:mx-0">
              <img
                src={comic.coverImage}
                alt={comic.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Info Column */}
            <div className="flex-1 text-right w-full">
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400 mb-2">
                <span className="text-rose-500 font-bold">{comic.arabicPublisher}</span>
                <span aria-hidden="true">·</span>
                <span>الحالة: {comic.status}</span>
                <span aria-hidden="true">·</span>
                <span className="text-amber-400 font-bold flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                  {comic.rating}
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-white mb-1">
                {comic.title}
              </h2>
              <p className="text-sm font-mono text-neutral-400 mb-4">{comic.originalTitle}</p>

              {/* Creators list */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs text-neutral-300 mb-4 bg-neutral-950/60 p-3 rounded-xl border border-neutral-850">
                <div>
                  <span className="text-neutral-500 block text-[11px]">المؤلف:</span>
                  <span className="font-semibold">{comic.author}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[11px]">الرسام:</span>
                  <span className="font-semibold">{comic.artist}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[11px]">المترجم:</span>
                  <span className="font-semibold text-rose-400">{comic.arabicTranslator}</span>
                </div>
              </div>

              {/* Genres */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {comic.genres.map((g, idx) => (
                  <span
                    key={idx}
                    className="text-xs bg-neutral-800 text-neutral-300 px-2.5 py-1 rounded-md border border-neutral-700/50"
                  >
                    {g}
                  </span>
                ))}
              </div>

              {/* Synopsis */}
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed mb-6">
                {comic.synopsis}
              </p>
            </div>
          </div>

          {/* Chapters List */}
          <div className="mt-8 pt-6 border-t border-neutral-800">
            <h3 className="text-base sm:text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5 text-rose-500" />
              <span>فصول الكوميكس المتاحة ({comic.chapters.length})</span>
            </h3>

            <div className="space-y-2.5">
              {comic.chapters.map((ch) => (
                <div
                  key={ch.id}
                  className="flex items-center justify-between p-3.5 bg-neutral-950/80 hover:bg-neutral-850 rounded-xl border border-neutral-800 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-neutral-800 text-rose-400 font-mono font-bold flex items-center justify-center text-sm group-hover:bg-rose-600 group-hover:text-white transition-colors">
                      {ch.chapterNumber}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white group-hover:text-rose-400 transition-colors">
                        {ch.title}
                      </h4>
                      <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono mt-0.5">
                        <span>{ch.pagesCount} صفحة</span>
                        <span>·</span>
                        <span>{ch.releaseDate}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        onReadChapter(ch);
                        onClose();
                      }}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-rose-950"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>قراءة الفصل</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
