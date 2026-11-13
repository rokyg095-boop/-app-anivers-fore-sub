import React from 'react';
import { BookOpen, Star, Eye, Calendar, ChevronLeft } from 'lucide-react';
import { Comic } from '../data/mockData.ts';

interface ComicCardProps {
  comic: Comic;
  onSelect: (comic: Comic) => void;
  onQuickRead: (comic: Comic) => void;
}

export const ComicCard: React.FC<ComicCardProps> = ({ comic, onSelect, onQuickRead }) => {
  return (
    <div className="group relative bg-neutral-900 border border-neutral-800/90 rounded-2xl overflow-hidden hover:border-neutral-700 transition-all duration-300 flex flex-col shadow-lg hover:shadow-2xl hover:shadow-rose-950/20">
      {/* Cover Image Area */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-neutral-950">
        <img
          src={comic.coverImage}
          alt={comic.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          referrerPolicy="no-referrer"
        />

        {/* Gradient Scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/20 to-transparent" />

        {/* Top Badges */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          <span className="bg-neutral-950/80 border border-neutral-800 text-neutral-300 text-[11px] font-mono px-2 py-0.5 rounded backdrop-blur">
            {comic.chapters.length} فصول
          </span>
          <span className="bg-rose-950/90 border border-rose-500/40 text-rose-300 text-[11px] px-2 py-0.5 rounded font-bold backdrop-blur">
            {comic.status}
          </span>
        </div>

        {/* Floating Quick Read Button on Hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/40 backdrop-blur-[2px]">
          <button
            onClick={() => onQuickRead(comic)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xl shadow-rose-950 transform translate-y-2 group-hover:translate-y-0 transition-all cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            <span>قراءة فورية</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          {/* Metadata */}
          <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono mb-1.5">
            <span className="flex items-center gap-1 text-amber-400 font-bold">
              <Star className="w-3.5 h-3.5 fill-amber-400" />
              {comic.rating}
            </span>
            <span className="flex items-center gap-1 text-neutral-400">
              <Eye className="w-3 h-3" />
              {comic.views}
            </span>
          </div>

          <h3
            onClick={() => onSelect(comic)}
            className="text-base font-bold text-white group-hover:text-rose-400 transition-colors line-clamp-1 cursor-pointer mb-1"
          >
            {comic.title}
          </h3>

          <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed mb-3">
            {comic.synopsis}
          </p>
        </div>

        {/* Footer info & Action */}
        <div className="pt-3 border-t border-neutral-850 flex items-center justify-between text-xs">
          <span className="text-neutral-400 text-[11px] truncate max-w-[120px]">
            {comic.author}
          </span>
          <button
            onClick={() => onSelect(comic)}
            className="text-rose-500 hover:text-rose-400 font-bold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>التفاصيل</span>
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
