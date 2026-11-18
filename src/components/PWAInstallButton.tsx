import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  Smartphone,
  Monitor,
  Share,
  PlusSquare,
  X,
  CheckCircle2,
  MoreVertical,
} from 'lucide-react';
import { ClientPlatform, usePWAInstall } from '../hooks/usePWAInstall.ts';
import { BrandLogo } from './BrandLogo.tsx';

interface PWAInstallButtonProps {
  variant?: 'header' | 'drawer' | 'footer';
  onAfterTrigger?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  onAfterTrigger,
}) => {
  const { isInstallable, isInstalled, isIOSSafari, platform, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [selectedGuideTab, setSelectedGuideTab] = useState<ClientPlatform>(platform);

  useEffect(() => {
    setSelectedGuideTab(platform);
  }, [platform]);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        onAfterTrigger?.();
        return;
      }
    }
    setSelectedGuideTab(platform);
    setShowGuideModal(true);
  };

  return (
    <>
      {variant === 'drawer' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className="min-h-[48px] w-full px-4 py-3 rounded-2xl bg-gradient-to-l from-rose-600/25 via-fuchsia-600/20 to-violet-600/25 hover:from-rose-600/40 hover:to-violet-600/40 border border-rose-400/50 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-lg shadow-rose-950/20"
        >
          <Download className="w-4 h-4 text-rose-300" />
          <span>تثبيت تطبيق AniVerse على جهازك</span>
        </button>
      ) : variant === 'footer' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/45 text-rose-200 hover:text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5 text-rose-300" />
          <span>تثبيت التطبيق (PWA)</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          className="min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3.5 py-1.5 rounded-full bg-rose-600 hover:bg-rose-500 border border-rose-400/50 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 shadow-sm shadow-rose-950/30"
          title="تثبيت AniVerse كتطبيق على Android وiPhone والحاسوب"
          aria-label="تثبيت التطبيق"
        >
          <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white shrink-0" />
          <span className="sm:hidden">تثبيت</span>
          <span className="hidden sm:inline">تثبيت التطبيق</span>
        </button>
      )}

      {showGuideModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto"
            dir="rtl"
            onClick={() => setShowGuideModal(false)}
          >
            <div
              className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl bg-neutral-950 border border-neutral-800 shadow-2xl p-5 sm:p-6 space-y-5 my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-neutral-800 pb-4">
                <div className="flex items-center gap-3">
                  <BrandLogo size="md" className="w-11 h-11 rounded-2xl" />
                  <div>
                    <h3 className="text-base font-black text-white">تثبيت تطبيق AniVerse</h3>
                    <p className="text-xs text-neutral-400">
                      يعمل بشاشة كاملة على Android وiPhone والحاسوب
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  className="w-9 h-9 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center border border-neutral-800 cursor-pointer shrink-0"
                  aria-label="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Device Selector Tabs */}
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-neutral-900 border border-neutral-800">
                <button
                  type="button"
                  onClick={() => setSelectedGuideTab('android')}
                  className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    selectedGuideTab === 'android'
                      ? 'bg-emerald-600 text-white'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Android</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedGuideTab('ios')}
                  className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    selectedGuideTab === 'ios'
                      ? 'bg-rose-600 text-white'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>iPhone</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedGuideTab('desktop')}
                  className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    selectedGuideTab === 'desktop'
                      ? 'bg-sky-600 text-white'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>الحاسوب</span>
                </button>
              </div>

              {selectedGuideTab === 'ios' ? (
                <div className="space-y-3 text-sm text-neutral-200">
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-400">
                    <Smartphone className="w-4 h-4" />
                    <span>خطوات التثبيت على iPhone و iPad</span>
                  </div>

                  {platform === 'ios' && !isIOSSafari && (
                    <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-xs text-sky-200 leading-relaxed">
                      في متصفح Chrome على الآيفون، زر المشاركة{' '}
                      <Share className="w-3.5 h-3.5 text-sky-400 inline" /> موجود{' '}
                      <strong>أعلى يسار الشاشة بجانب رابط الموقع</strong>. (وإن لم يظهر خيار الإضافة
                      في قائمته، افتح الرابط في متصفح <strong>Safari</strong>).
                    </div>
                  )}

                  <ol className="space-y-2.5 text-xs sm:text-sm leading-relaxed">
                    <li className="flex items-start gap-2.5 bg-neutral-900/90 border border-neutral-800 rounded-2xl p-3">
                      <span className="w-6 h-6 rounded-lg bg-rose-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                        1
                      </span>
                      <span className="flex items-center gap-1.5 flex-wrap">
                        اضغط على زر <strong>المشاركة</strong> (<bdi dir="ltr">Share</bdi>){' '}
                        <Share className="w-4 h-4 text-sky-400 inline" />{' '}
                        {platform === 'ios' && !isIOSSafari
                          ? 'أعلى يسار شريط العنوان.'
                          : 'أسفل متصفح Safari.'}
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5 bg-neutral-900/90 border border-neutral-800 rounded-2xl p-3">
                      <span className="w-6 h-6 rounded-lg bg-rose-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                        2
                      </span>
                      <span className="flex items-center gap-1.5 flex-wrap">
                        مرّر للأسفل واختر <strong>إضافة إلى الصفحة الرئيسية</strong> (
                        <bdi dir="ltr">Add to Home Screen</bdi>){' '}
                        <PlusSquare className="w-4 h-4 text-emerald-400 inline" />.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5 bg-neutral-900/90 border border-neutral-800 rounded-2xl p-3">
                      <span className="w-6 h-6 rounded-lg bg-rose-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                        3
                      </span>
                      <span>
                        اضغط <strong>إضافة</strong> (<bdi dir="ltr">Add</bdi>) بالأعلى ليظهر التطبيق
                        بأيقونته على شاشتك الرئيسية.
                      </span>
                    </li>
                  </ol>
                </div>
              ) : selectedGuideTab === 'android' ? (
                <div className="space-y-3 text-sm text-neutral-200">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                    <Smartphone className="w-4 h-4" />
                    <span>خطوات التثبيت على Android</span>
                  </div>
                  <ol className="space-y-2.5 text-xs sm:text-sm leading-relaxed">
                    <li className="flex items-start gap-2.5 bg-neutral-900/90 border border-neutral-800 rounded-2xl p-3">
                      <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                        1
                      </span>
                      <span className="flex items-center gap-1.5 flex-wrap">
                        افتح الموقع في متصفح <strong>Chrome</strong> واضغط قائمة النقاط الثلاث{' '}
                        <MoreVertical className="w-4 h-4 text-neutral-300 inline" /> بالأعلى.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5 bg-neutral-900/90 border border-neutral-800 rounded-2xl p-3">
                      <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                        2
                      </span>
                      <span>
                        اختر <strong>تثبيت التطبيق (Install app)</strong> أو{' '}
                        <strong>الإضافة إلى الشاشة الرئيسية</strong>.
                      </span>
                    </li>
                  </ol>
                </div>
              ) : (
                <div className="space-y-3 text-sm text-neutral-200">
                  <div className="flex items-center gap-2 text-xs font-bold text-sky-400">
                    <Monitor className="w-4 h-4" />
                    <span>خطوات التثبيت على الحاسوب (Windows / Mac)</span>
                  </div>
                  <ol className="space-y-2.5 text-xs sm:text-sm leading-relaxed">
                    <li className="flex items-start gap-2.5 bg-neutral-900/90 border border-neutral-800 rounded-2xl p-3">
                      <span className="w-6 h-6 rounded-lg bg-sky-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                        1
                      </span>
                      <span>
                        في <strong>Chrome / Edge:</strong> اضغط على أيقونة التثبيت{' '}
                        <Download className="w-3.5 h-3.5 text-rose-400 inline" /> يمين شريط العنوان
                        بالأعلى ثم اختر <strong>Install</strong>.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5 bg-neutral-900/90 border border-neutral-800 rounded-2xl p-3">
                      <span className="w-6 h-6 rounded-lg bg-sky-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                        2
                      </span>
                      <span>
                        في <strong>Mac Safari:</strong> من القائمة العلوية اختر{' '}
                        <strong>File ← Add to Dock</strong>.
                      </span>
                    </li>
                  </ol>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <span className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>تطبيق مستقل بدون شريط متصفح</span>
                </span>

                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer transition-colors"
                >
                  حسناً
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
