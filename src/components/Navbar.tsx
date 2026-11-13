import React from 'react';
import { BookOpen, Film, Flame, Sparkles, Tv, Clapperboard } from 'lucide-react';

export type NavTabType = 'home' | 'anime' | 'movies' | 'dubbed' | 'comics';

interface NavbarProps {
  currentTab: NavTabType;
  onSelectTab: (tab: NavTabType) => void;
  onOpenFeaturedReader: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  onOpenFeaturedReader,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-800/80 bg-neutral-950/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 lg:px-8 h-16">
        {/* Brand Zone (Single element wordmark) */}
        <button
          onClick={() => onSelectTab('home')}
          className="flex items-center gap-2.5 text-right cursor-pointer group focus:outline-none shrink-0"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-700 via-rose-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-rose-950/40 group-hover:scale-105 transition-transform duration-200">
            <Flame className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-black tracking-tight text-white font-mono flex items-center gap-1">
              AniVerse
              <span className="text-rose-500 text-xs px-1.5 py-0.5 rounded bg-rose-500/10 font-sans border border-rose-500/20">
                عربي
              </span>
            </span>
          </div>
        </button>

        {/* Navigation Zone (Clean single-line links) */}
        <nav className="flex items-center gap-1 sm:gap-3 lg:gap-5 text-xs sm:text-sm font-semibold text-neutral-300 overflow-x-auto py-1">
          <button
            onClick={() => onSelectTab('home')}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              currentTab === 'home'
                ? 'text-white bg-neutral-900 border border-neutral-800 shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            الرئيسية
          </button>
          <button
            onClick={() => onSelectTab('anime')}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              currentTab === 'anime'
                ? 'text-white bg-rose-600/20 text-rose-300 border border-rose-500/40 shadow-sm'
                : 'text-neutral-400 hover:text-rose-400'
            }`}
          >
            <Tv className="w-4 h-4 text-rose-500" />
            <span>الأنمي</span>
            <span className="text-[10px] bg-rose-500 text-white px-1.5 py-0.2 rounded-full font-bold">جديد</span>
          </button>
          <button
            onClick={() => onSelectTab('movies')}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              currentTab === 'movies'
                ? 'text-white bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-neutral-400 hover:text-amber-400'
            }`}
          >
            <Clapperboard className="w-4 h-4 text-amber-500" />
            <span>الأفلام</span>
          </button>
          <button
            onClick={() => onSelectTab('dubbed')}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              currentTab === 'dubbed'
                ? 'text-white bg-neutral-900 border border-neutral-800 shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Film className="w-4 h-4 text-purple-400" />
            الأعمال المدبلجة
          </button>
          <button
            onClick={() => onSelectTab('comics')}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              currentTab === 'comics'
                ? 'text-white bg-neutral-900 border border-neutral-800 shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4 text-emerald-400" />
            الكوميكس
          </button>
        </nav>

        {/* Primary Action Zone */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onOpenFeaturedReader}
            className="px-4 py-2 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 rounded-lg shadow-md shadow-rose-900/30 transition-all duration-150 cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 active:scale-95"
          >
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            اقرأ الفصل الحصري
          </button>
        </div>
      </div>
    </header>
  );
};
