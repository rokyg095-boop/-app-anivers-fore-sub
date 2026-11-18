import React, { useState } from 'react';
import {
  BookOpen,
  Film,
  Sparkles,
  Tv,
  Clapperboard,
  MonitorPlay,
  Search,
  MoreVertical,
  X,
  Home,
  ChevronLeft,
  Palette,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { BrandLogo } from './BrandLogo.tsx';

export type NavTabType = 'home' | 'anime' | 'movies' | 'tv' | 'dubbed' | 'comics';

interface NavbarProps {
  currentTab: NavTabType;
  onSelectTab: (tab: NavTabType) => void;
  onOpenFeaturedReader: () => void;
  onOpenSearch: () => void;
  onOpenStyles: () => void;
  currentStyleName?: string;
  isLightMode?: boolean;
}

const NAV_ITEMS: {
  id: NavTabType;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'home',
    label: 'الرئيسية',
    description: 'الواجهة الرئيسية وأبرز الأعمال',
    icon: <Home className="w-5 h-5 text-violet-400" />,
  },
  {
    id: 'anime',
    label: 'الأنمي',
    description: 'مسلسلات الأنمي المترجمة والمدبلجة',
    icon: <Tv className="w-5 h-5 text-rose-400" />,
  },
  {
    id: 'movies',
    label: 'الأفلام',
    description: 'صالة الأفلام السينمائية الكاملة',
    icon: <Clapperboard className="w-5 h-5 text-amber-400" />,
  },
  {
    id: 'tv',
    label: 'المسلسلات التلفزيونية',
    description: 'المسلسلات العالمية والدرامية والمواسم',
    icon: <MonitorPlay className="w-5 h-5 text-sky-400" />,
  },
  {
    id: 'dubbed',
    label: 'الأنميشن والكرتون',
    description: 'مسلسلات الأنميشن والكرتون المدبلجة',
    icon: <Film className="w-5 h-5 text-purple-400" />,
  },
  {
    id: 'comics',
    label: 'الكوميكس',
    description: 'قراءة الكوميكس والمانجا المترجمة',
    icon: <BookOpen className="w-5 h-5 text-emerald-400" />,
  },
];

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  onOpenFeaturedReader,
  onOpenSearch,
  onOpenStyles,
  currentStyleName,
  isLightMode = false,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const handleChooseTab = (tab: NavTabType) => {
    setMobileMenuOpen(false);
    onSelectTab(tab);
  };

  return (
    <>
      <header
        className={`sticky top-0 z-40 w-full border-b backdrop-blur-xl transition-colors duration-200 ${
          isLightMode
            ? 'bg-[#faf7f2]/90 border-neutral-300/80 text-neutral-900'
            : 'bg-[#060911]/80 border-white/10 text-white'
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center gap-2 sm:gap-4 px-3 sm:px-6 lg:px-8 h-16">
          {/* Zone 1 (Start/Right in RTL): Cat Brand Logo + Wordmark */}
          <button
            type="button"
            onClick={() => handleChooseTab('home')}
            className="flex items-center gap-2 text-right cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 rounded-lg whitespace-nowrap shrink-0"
          >
            <BrandLogo
              size="sm"
              className="group-hover:scale-105 transition-transform duration-200"
            />
            <span
              className={`text-base sm:text-xl font-black tracking-tight whitespace-nowrap shrink-0 ${
                isLightMode ? 'text-neutral-950' : 'text-white'
              }`}
            >
              AniVerse
            </span>
          </button>

          {/* Zone 2 & 3 Pushed Toward the End ("الأقسام مائلة إلى الأخير" + "الأنماط" بجانبها) */}
          <div className="ms-auto flex items-center gap-1.5 sm:gap-2.5 lg:gap-4 min-w-0">
            {/* Desktop Sections pushed toward the end */}
            <nav className="hidden lg:flex items-center gap-4 xl:gap-5 text-sm font-semibold">
              {NAV_ITEMS.map((item) => {
                const active = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleChooseTab(item.id)}
                    className={`relative py-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none ${
                      active
                        ? isLightMode
                          ? 'text-neutral-950 font-black'
                          : 'text-white font-bold'
                        : isLightMode
                        ? 'text-neutral-600 hover:text-neutral-950'
                        : 'text-white/65 hover:text-white'
                    }`}
                  >
                    <span>{item.label}</span>
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 -bottom-[1px] h-0.5 rounded-full bg-gradient-to-r from-rose-500 to-violet-500"
                      />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Styles Switcher Button ("الأنماط") right next to the sections */}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenStyles();
              }}
              className={`min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3.5 py-1.5 rounded-full border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                isLightMode
                  ? 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700'
                  : 'bg-violet-500/15 hover:bg-violet-500/30 border-violet-400/50 text-violet-200 hover:text-white'
              }`}
              title={currentStyleName ? `النمط الحالي: ${currentStyleName}` : 'تغيير نمط الموقع'}
              aria-label="الأنماط"
            >
              <Palette className="w-4 h-4 text-rose-400 shrink-0" />
              <span>الأنماط</span>
            </button>

            {/* Search Icon/Button */}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenSearch();
              }}
              className={`min-h-[38px] min-w-[38px] sm:min-h-[40px] px-2.5 sm:px-3 rounded-full border flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                isLightMode
                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                  : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/15 text-white/85 hover:text-white'
              }`}
              aria-label="بحث وتصنيفات"
              title="بحث عن عمل أو تصنيف"
            >
              <Search className="w-4 h-4" />
              <span className="hidden xl:inline">بحث</span>
            </button>

            {/* PWA Install Button */}
            <PWAInstallButton variant="header" />

            {/* Exclusive Comic Chapter Button */}
            <button
              type="button"
              onClick={onOpenFeaturedReader}
              className="hidden xl:flex min-h-[40px] px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-full shadow-lg shadow-rose-950/35 transition-all duration-150 cursor-pointer items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95"
            >
              <Sparkles className="w-4 h-4 text-amber-200" />
              <span>اقرأ الفصل الحصري</span>
            </button>

            {/* Mobile & Tablet Menu Button ("الأقسام") */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className={`lg:hidden min-h-[38px] min-w-[38px] px-2.5 sm:px-3 rounded-full border flex items-center justify-center gap-1 cursor-pointer transition-colors shrink-0 ${
                mobileMenuOpen
                  ? 'bg-rose-600 text-white border-rose-400'
                  : isLightMode
                  ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-900 border-neutral-300'
                  : 'bg-white/[0.08] hover:bg-white/[0.14] text-white border-white/15'
              }`}
              aria-label="فتح قائمة الأقسام"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <X className="w-4 h-4" />
              ) : (
                <>
                  <MoreVertical className="w-4 h-4" />
                  <span className="text-xs font-bold">الأقسام</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Sheet Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 top-16 z-50 lg:hidden bg-black/75 backdrop-blur-xl overflow-y-auto"
          dir="rtl"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="bg-[#080c17]/95 backdrop-blur-2xl border-b border-white/15 rounded-b-3xl shadow-2xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-1 pb-2 border-b border-white/10">
              <span className="text-xs font-black text-white/90">
                اختر القسم الذي تريد تصفحه
              </span>
              <span className="text-[11px] text-white/50">الأقسام والأنماط</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {NAV_ITEMS.map((item) => {
                const active = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleChooseTab(item.id)}
                    className={`min-h-[54px] w-full px-4 py-3 rounded-2xl border flex items-center justify-between gap-3 text-right cursor-pointer transition-colors ${
                      active
                        ? 'bg-rose-600/25 border-rose-400/60 text-white'
                        : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/10 text-white/85'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0">
                        {item.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">{item.label}</div>
                        <div className="text-[11px] text-white/55 truncate">
                          {item.description}
                        </div>
                      </div>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-white/40 shrink-0" />
                  </button>
                );
              })}
            </div>

            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenStyles();
                }}
                className="min-h-[48px] w-full px-4 py-3 rounded-2xl bg-violet-600/20 hover:bg-violet-600/35 border border-violet-400/50 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Palette className="w-4 h-4 text-violet-300" />
                <span>الأنماط وتغيير شكل الموقع</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenSearch();
                }}
                className="min-h-[48px] w-full px-4 py-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Search className="w-4 h-4 text-violet-300" />
                <span>البحث بالاسم والتصنيفات</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenFeaturedReader();
                }}
                className="sm:col-span-2 min-h-[48px] w-full px-4 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-200" />
                <span>اقرأ الفصل الحصري</span>
              </button>

              <div className="sm:col-span-2">
                <PWAInstallButton
                  variant="drawer"
                  onAfterTrigger={() => setMobileMenuOpen(false)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
