import React, { useMemo, useState } from 'react';
import {
  Search,
  X,
  BookOpen,
  Play,
  Tv,
  Film,
  MonitorPlay,
  Volume2,
  SlidersHorizontal,
} from 'lucide-react';
import { COMICS_DATA, Comic, DubSeries } from '../data/mockData';
import { getAllEffectiveMediaWorks } from '../utils/catalogOverrides';
import { NavTabType } from './Navbar';

type SectionFilter = 'all' | 'anime' | 'movie' | 'tv' | 'dubbed' | 'comics';

const SECTION_LABELS: { id: SectionFilter; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'anime', label: 'الأنمي' },
  { id: 'movie', label: 'الأفلام' },
  { id: 'tv', label: 'المسلسلات التلفزيونية' },
  { id: 'dubbed', label: 'الأنميشن والكرتون' },
  { id: 'comics', label: 'الكوميكس' },
];

const CORE_GENRES: string[] = [
  'أكشن',
  'مغامرات',
  'فانتازيا',
  'دراما',
  'خيال علمي',
  'غموض',
  'كوميديا',
  'رعب نفسي',
];

interface UnifiedResultItem {
  id: string;
  kind: 'media' | 'comic';
  section: Exclude<SectionFilter, 'all'>;
  sectionLabel: string;
  title: string;
  originalTitle: string;
  coverImage: string;
  genres: string[];
  rating: number;
  metaText: string;
  synopsis: string;
  mediaSeries?: DubSeries;
  comic?: Comic;
}

interface GlobalSearchPanelProps {
  onSelectMedia: (series: DubSeries) => void;
  onSelectComic: (comic: Comic) => void;
  onNavigateTab: (tab: NavTabType) => void;
  onCloseModal?: () => void;
  isModal?: boolean;
  initialQuery?: string;
}

export const GlobalSearchPanel: React.FC<GlobalSearchPanelProps> = ({
  onSelectMedia,
  onSelectComic,
  onNavigateTab,
  onCloseModal,
  isModal = false,
  initialQuery = '',
}) => {
  const [query, setQuery] = useState<string>(initialQuery);
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');

  const allItems = useMemo<UnifiedResultItem[]>(() => {
    const mediaWorks = getAllEffectiveMediaWorks();
    const mappedMedia: UnifiedResultItem[] = mediaWorks.map((series) => {
      const sec: Exclude<SectionFilter, 'all' | 'comics'> =
        series.category === 'anime' ||
        series.category === 'movie' ||
        series.category === 'tv'
          ? series.category
          : 'dubbed';
      const sectionLabel =
        sec === 'anime'
          ? 'الأنمي'
          : sec === 'movie'
          ? 'الأفلام'
          : sec === 'tv'
          ? 'المسلسلات التلفزيونية'
          : 'الأنميشن والكرتون';
      const metaText =
        sec === 'movie'
          ? 'فيلم كامل'
          : `${series.seasons.length} ${series.seasons.length === 1 ? 'موسم' : 'مواسم'} · ${series.episodesCount} حلقة`;

      return {
        id: series.id,
        kind: 'media',
        section: sec,
        sectionLabel,
        title: series.title,
        originalTitle: series.originalTitle || '',
        coverImage: series.coverImage,
        genres: series.genres || [],
        rating: series.rating || 0,
        metaText,
        synopsis: series.synopsis || '',
        mediaSeries: series,
      };
    });

    const mappedComics: UnifiedResultItem[] = COMICS_DATA.map((comic) => ({
      id: `comic-${comic.id}`,
      kind: 'comic',
      section: 'comics',
      sectionLabel: 'الكوميكس',
      title: comic.title,
      originalTitle: comic.originalTitle || '',
      coverImage: comic.coverImage,
      genres: comic.genres || [],
      rating: comic.rating || 0,
      metaText: `${comic.chapters.length} فصول · ${comic.status}`,
      synopsis: comic.synopsis || '',
      comic,
    }));

    return [...mappedMedia, ...mappedComics];
  }, []);

  const allGenres = useMemo<string[]>(() => {
    const set = new Set<string>();
    allItems.forEach((item) => {
      item.genres.forEach((g) => {
        const clean = g.trim();
        if (clean) set.add(clean);
      });
    });
    CORE_GENRES.forEach((g) => set.add(g));
    return Array.from(set);
  }, [allItems]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allItems.filter((item) => {
      if (sectionFilter !== 'all' && item.section !== sectionFilter) return false;
      if (selectedGenre !== 'all') {
        const gLower = selectedGenre.toLowerCase();
        const hasGenre = item.genres.some((g) => g.toLowerCase().includes(gLower));
        if (!hasGenre) return false;
      }
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.originalTitle.toLowerCase().includes(q) ||
        item.synopsis.toLowerCase().includes(q) ||
        item.sectionLabel.toLowerCase().includes(q) ||
        item.genres.some((g) => g.toLowerCase().includes(q))
      );
    });
  }, [allItems, query, sectionFilter, selectedGenre]);

  const showResults =
    isModal || query.trim().length > 0 || sectionFilter !== 'all' || selectedGenre !== 'all';

  const handleOpenItem = (item: UnifiedResultItem) => {
    if (onCloseModal) onCloseModal();
    if (item.kind === 'comic' && item.comic) {
      onSelectComic(item.comic);
    } else if (item.mediaSeries) {
      onSelectMedia(item.mediaSeries);
    }
  };

  const renderSectionIcon = (sec: Exclude<SectionFilter, 'all'>) => {
    if (sec === 'anime') return <Tv className="w-3.5 h-3.5 text-rose-400" />;
    if (sec === 'movie') return <Film className="w-3.5 h-3.5 text-amber-400" />;
    if (sec === 'tv') return <MonitorPlay className="w-3.5 h-3.5 text-sky-400" />;
    if (sec === 'comics') return <BookOpen className="w-3.5 h-3.5 text-emerald-400" />;
    return <Volume2 className="w-3.5 h-3.5 text-purple-400" />;
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Search Box */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-400 absolute top-1/2 right-3.5 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن فيلم، أنمي، مسلسل تلفزيوني، كوميكس، أو اكتب تصنيفاً (أكشن، فانتازيا، دراما...)"
            autoFocus={isModal}
            className="w-full min-h-[44px] bg-neutral-950 border border-neutral-700/90 focus:border-rose-500 rounded-2xl py-2.5 pr-10 pl-10 text-xs sm:text-sm text-white placeholder:text-neutral-500 focus:outline-none transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="w-8 h-8 rounded-lg text-neutral-400 hover:text-white flex items-center justify-center absolute top-1/2 left-2 -translate-y-1/2 cursor-pointer"
              aria-label="مسح البحث"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {(query || sectionFilter !== 'all' || selectedGenre !== 'all') && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSectionFilter('all');
              setSelectedGenre('all');
            }}
            className="min-h-[44px] px-3.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            إعادة ضبط
          </button>
        )}
      </div>

      {/* Section Filter Buttons */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] font-bold text-neutral-400 flex items-center gap-1 shrink-0">
            <SlidersHorizontal className="w-3.5 h-3.5 text-rose-400" />
            <span>القسم:</span>
          </span>
          {SECTION_LABELS.map((sec) => {
            const active = sectionFilter === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setSectionFilter(sec.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                  active
                    ? 'bg-rose-600 text-white border-rose-500 shadow'
                    : 'bg-neutral-900 text-neutral-300 hover:text-white border-neutral-800'
                }`}
              >
                {sec.label}
              </button>
            );
          })}
        </div>

        {/* Genre / Classification Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="text-[11px] font-bold text-neutral-400 shrink-0 ml-1">
            التصنيفات:
          </span>
          <button
            type="button"
            onClick={() => setSelectedGenre('all')}
            className={`min-h-[34px] px-3 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
              selectedGenre === 'all'
                ? 'bg-amber-500 text-neutral-950 border-amber-400 font-black'
                : 'bg-neutral-900 text-neutral-400 hover:text-white border-neutral-800'
            }`}
          >
            كل التصنيفات
          </button>
          {allGenres.map((genre) => {
            const active = selectedGenre === genre;
            return (
              <button
                key={genre}
                type="button"
                onClick={() => setSelectedGenre(active ? 'all' : genre)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                  active
                    ? 'bg-amber-500 text-neutral-950 border-amber-400 font-black'
                    : 'bg-neutral-900 text-neutral-300 hover:text-white border-neutral-800'
                }`}
              >
                {genre}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results List */}
      {showResults && (
        <div className="pt-2 space-y-3">
          <div className="flex items-center justify-between text-xs text-neutral-400 border-b border-neutral-800 pb-2">
            <span>
              نتائج البحث ({filteredItems.length})
              {selectedGenre !== 'all' ? ` · تصنيف: ${selectedGenre}` : ''}
            </span>
            {sectionFilter === 'tv' && filteredItems.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  if (onCloseModal) onCloseModal();
                  onNavigateTab('tv');
                }}
                className="text-sky-400 hover:underline font-bold cursor-pointer"
              >
                الانتقال إلى قسم المسلسلات التلفزيونية
              </button>
            )}
          </div>

          {filteredItems.length === 0 ? (
            <div className="p-6 rounded-2xl bg-neutral-950 border border-neutral-800 text-center text-xs text-neutral-400">
              لم يتم العثور على أعمال مطابقة لبحثك أو التصنيف المختار حالياً.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleOpenItem(item)}
                  className="text-right p-3 rounded-2xl bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 hover:border-rose-500/50 flex items-center gap-3 transition-all cursor-pointer group"
                >
                  <img
                    src={item.coverImage}
                    alt={item.title}
                    className="w-14 h-20 object-cover rounded-xl shrink-0 bg-neutral-900 border border-neutral-800"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 mb-1">
                      {renderSectionIcon(item.section)}
                      <span className="font-bold text-neutral-300">{item.sectionLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{item.metaText}</span>
                    </div>
                    <h4 className="text-xs sm:text-sm font-black text-white group-hover:text-rose-400 transition-colors truncate">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                      {item.genres.slice(0, 3).join(' · ')}
                    </p>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-neutral-900 group-hover:bg-rose-600 text-neutral-300 group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                    {item.kind === 'comic' ? (
                      <BookOpen className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4 fill-current" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMedia: (series: DubSeries) => void;
  onSelectComic: (comic: Comic) => void;
  onNavigateTab: (tab: NavTabType) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectMedia,
  onSelectComic,
  onNavigateTab,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 overflow-y-auto"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl p-4 sm:p-6 my-4 sm:my-10 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-rose-500" />
            <h2 className="text-base sm:text-lg font-black text-white">
              البحث الشامل والتصفية بالتصنيفات
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            aria-label="إغلاق البحث"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <GlobalSearchPanel
          isModal
          onSelectMedia={onSelectMedia}
          onSelectComic={onSelectComic}
          onNavigateTab={onNavigateTab}
          onCloseModal={onClose}
        />
      </div>
    </div>
  );
};
