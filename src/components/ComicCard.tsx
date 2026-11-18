import React from 'react';
import { BookOpen, Heart, Plus, ChevronLeft } from 'lucide-react';
import { Comic } from '../data/mockData.ts';
import { useFavorites } from '../utils/favorites';

interface ComicCardProps {
  comic: Comic;
  onSelect: (comic: Comic) => void;
  onQuickRead: (comic: Comic) => void;
}

export const ComicCard: React.FC<ComicCardProps> = ({ comic, onSelect, onQuickRead }) => {
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorited = isFavorite(comic.id);

  return (
    <div className="group relative bg-white/[0.03] border border-white/10 hover:border-violet-400/50 rounded-2xl overflow-hidden transition-all duration-300 flex flex-col shadow-xl">
      {/* Vertical Cover Poster */}
      <div
        onClick={() => onSelect(comic)}
        className="relative aspect-[2/3] w-full overflow-hidden bg-neutral-950 cursor-pointer"
      >
        <img
          src={comic.coverImage}
          alt={comic.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          referrerPolicy="no-referrer"
        />

        {/* Gradient Scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#060911] via-[#060911]/25 to-transparent" />

        {/* Favorite Toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(comic.id);
          }}
          aria-label={favorited ? 'إزالة من المفضلة' : 'أضف إلى المفضلة'}
          className={`absolute top-3 left-3 w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center transition-all cursor-pointer ${
            favorited
              ? 'bg-rose-500/80 border-rose-300 text-white'
              : 'bg-black/50 border-white/25 text-white/85 hover:bg-white/20'
          }`}
        >
          {favorited ? (
            <Heart className="w-4 h-4 fill-white" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
        </button>

        {/* Quick Read Hover Affordance */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/30">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onQuickRead(comic);
            }}
            className="px-4 py-2 bg-white/20 hover:bg-white/30 border border-white/50 backdrop-blur-md text-white rounded-full font-bold text-xs flex items-center gap-1.5 shadow-xl cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>قراءة فورية</span>
          </button>
        </div>

        {/* Clean Unboxed Bottom Metadata */}
        <div className="absolute inset-x-0 bottom-0 p-3.5 text-right space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] text-white/75 tabular-nums">
            <span className="text-amber-300 font-bold">★ {comic.rating}</span>
            <span aria-hidden="true">·</span>
            <span>{comic.chapters.length} فصول</span>
            <span aria-hidden="true">·</span>
            <span>{comic.status}</span>
          </div>
          <h3 className="text-sm sm:text-base font-black text-white group-hover:text-violet-200 transition-colors line-clamp-1">
            {comic.title}
          </h3>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-3.5 flex-1 flex flex-col justify-between gap-3 bg-[#090d18]/90 text-right">
        <p className="text-xs text-white/60 line-clamp-2 leading-relaxed">
          {comic.synopsis}
        </p>

        <div className="pt-2.5 border-t border-white/10 flex items-center justify-between gap-2 text-xs">
          <span className="text-white/50 text-[11px] truncate max-w-[130px]">
            {comic.author}
          </span>
          <button
            type="button"
            onClick={() => onSelect(comic)}
            className="text-violet-300 hover:text-white font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
          >
            <span>الفصول</span>
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
