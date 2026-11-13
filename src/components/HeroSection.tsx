import React from 'react';
import { Play, BookOpen, Star, Eye, Sparkles, ChevronLeft, Award } from 'lucide-react';
import { Comic, DubSeries } from '../data/mockData.ts';

interface HeroSectionProps {
  featuredComic: Comic;
  featuredDub: DubSeries;
  onReadComic: (comic: Comic) => void;
  onWatchDub: (dub: DubSeries) => void;
  onSelectComicSeries: (comic: Comic) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  featuredComic,
  featuredDub,
  onReadComic,
  onWatchDub,
  onSelectComicSeries,
}) => {
  return (
    <section className="relative w-full overflow-hidden border-b border-neutral-800/80 bg-neutral-950">
      {/* Background Ambience Backdrop */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl" />
        <div
          className="absolute inset-0 opacity-15 bg-cover bg-center filter contrast-125 mix-blend-overlay"
          style={{ backgroundImage: `url(${featuredComic.bannerImage})` }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Main Visual Poster Banner */}
          <div className="lg:col-span-5 flex justify-center order-1 lg:order-2">
            <div className="relative group max-w-sm sm:max-w-md w-full">
              {/* Glowing Aura Frame */}
              <div className="absolute -inset-1.5 bg-gradient-to-tr from-amber-500 via-rose-500 to-sky-500 rounded-2xl blur-lg opacity-40 group-hover:opacity-75 transition duration-500" />

              <div className="relative rounded-2xl overflow-hidden border-2 border-amber-500/40 bg-neutral-900 shadow-2xl shadow-amber-950/40 aspect-[2/3]">
                <img
                  src={featuredComic.coverImage}
                  alt={featuredComic.title}
                  className="w-full h-full object-cover transform group-hover:scale-102 transition duration-500"
                  referrerPolicy="no-referrer"
                />

                {/* Overlay Badge */}
                <div className="absolute top-3 right-3 bg-neutral-950/85 border border-amber-500/40 text-amber-400 text-xs font-bold px-3 py-1 rounded-full backdrop-blur-md flex items-center gap-1.5 shadow-lg">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>العدد الأول الحصري</span>
                </div>

                {/* Bottom Quick Read Overlay */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-neutral-950 via-neutral-950/80 to-transparent p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono text-neutral-300">
                    <span className="text-amber-400 font-bold flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      {featuredComic.rating}
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5 text-neutral-400" />
                      {featuredComic.views}
                    </span>
                  </div>

                  <button
                    onClick={() => onReadComic(featuredComic)}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold rounded-lg shadow transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span>اقرأ الآن</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Hero Typography & Content Column */}
          <div className="lg:col-span-7 flex flex-col justify-center order-2 lg:order-1 text-right">
            {/* Unboxed Metadata */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400 mb-3">
              <span className="text-amber-400 font-bold uppercase tracking-wider">{featuredComic.arabicPublisher}</span>
              <span aria-hidden="true">·</span>
              <span>تعريب: {featuredComic.arabicTranslator}</span>
              <span aria-hidden="true">·</span>
              <span className="text-sky-400">فصول حصرية كاملة</span>
              <span aria-hidden="true">·</span>
              <span>{featuredComic.chapters[0].pagesCount} صفحة</span>
            </div>

            {/* Title */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight sm:leading-none mb-3">
              {featuredComic.title}
            </h1>

            <p className="text-base sm:text-lg font-mono text-neutral-400 mb-4">
              {featuredComic.originalTitle}
            </p>

            {/* Description / Synopsis */}
            <p className="text-sm sm:text-base text-neutral-300 leading-relaxed mb-6 max-w-2xl text-justify">
              {featuredComic.synopsis}
            </p>

            {/* Genre Highlights */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400 mb-8">
              <span className="text-neutral-500">التصنيفات:</span>
              {featuredComic.genres.map((g, idx) => (
                <span key={idx} className="bg-neutral-900 border border-neutral-800 text-neutral-300 px-2.5 py-1 rounded-md">
                  {g}
                </span>
              ))}
            </div>

            {/* Dual CTAs for Comics & Dubbing */}
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => onReadComic(featuredComic)}
                className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-bold text-sm sm:text-base shadow-xl shadow-amber-950/40 flex items-center gap-2.5 transition-all duration-150 cursor-pointer active:scale-95"
              >
                <BookOpen className="w-5 h-5 text-neutral-950" />
                <span>اقرأ الكوميكس الآن (عارض الصفحات المستقل)</span>
              </button>

              <button
                onClick={() => onWatchDub(featuredDub)}
                className="px-6 py-3.5 rounded-xl bg-neutral-900 hover:bg-neutral-850 text-neutral-200 hover:text-white font-bold text-sm sm:text-base border border-neutral-800 hover:border-neutral-700 flex items-center gap-2.5 transition-all duration-150 cursor-pointer active:scale-95"
              >
                <Play className="w-5 h-5 fill-amber-400 text-amber-400" />
                <span>مشاهدة النسخة المدبلجة</span>
              </button>
            </div>

            {/* Trust and credits footnote */}
            <div className="mt-8 pt-6 border-t border-neutral-850 flex items-center gap-4 text-xs text-neutral-400">
              <Award className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                سلسلة مستقلة مع صفحة فصول وعارض صور خاص بها بنسبة 100% دون أي تداخل.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
