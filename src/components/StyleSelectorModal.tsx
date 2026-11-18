import React from 'react';
import { createPortal } from 'react-dom';
import { Palette, Check, X, Sparkles } from 'lucide-react';
import {
  SITE_STYLES,
  SiteStyleId,
  SiteStyleMeta,
} from '../utils/siteStyle.ts';

interface StyleSelectorModalProps {
  isOpen: boolean;
  currentStyleId: SiteStyleId;
  onSelectStyle: (styleId: SiteStyleId) => void;
  onClose: () => void;
  sampleCovers?: string[];
}

const StyleMiniaturePreview: React.FC<{
  styleMeta: SiteStyleMeta;
  sampleCovers: string[];
}> = ({ styleMeta, sampleCovers }) => {
  const c0 = sampleCovers[0] || '/pwa-192x192.png';
  const c1 = sampleCovers[1] || c0;
  const c2 = sampleCovers[2] || c0;

  return (
    <div
      className="relative h-28 w-full rounded-2xl overflow-hidden border border-white/10 p-2.5 flex flex-col justify-between"
      style={{ backgroundColor: styleMeta.bgHex }}
    >
      {/* Ambient Wash */}
      <div
        className="absolute inset-0 pointer-events-none opacity-45"
        style={{
          background: `radial-gradient(circle at 25% 25%, ${styleMeta.accentHex}55, transparent 60%), radial-gradient(circle at 80% 80%, ${styleMeta.secondaryHex}44, transparent 55%)`,
        }}
      />

      {styleMeta.previewType === 'wing-3d' && (
        <div className="relative z-10 flex-1 flex items-center justify-center gap-1.5" dir="ltr">
          <img
            src={c1}
            alt=""
            className="w-8 h-12 rounded-md object-cover opacity-65 -rotate-6 scale-90 border border-white/20"
            referrerPolicy="no-referrer"
          />
          <img
            src={c0}
            alt=""
            className="w-12 h-16 rounded-lg object-cover shadow-lg border-2"
            style={{ borderColor: styleMeta.accentHex }}
            referrerPolicy="no-referrer"
          />
          <img
            src={c2}
            alt=""
            className="w-8 h-12 rounded-md object-cover opacity-65 rotate-6 scale-90 border border-white/20"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      {styleMeta.previewType === 'curved-fan' && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-full bg-white/85" />
          <div className="flex items-center justify-center gap-1" dir="ltr">
            {[c1, c2, c0, c1, c2].map((src, i) => (
              <img
                key={i}
                src={src}
                alt=""
                style={{
                  transform: `translateY(${Math.abs(i - 2) * 2}px) rotate(${(i - 2) * 4}deg)`,
                }}
                className="w-6 h-10 rounded-md object-cover border border-white/25"
                referrerPolicy="no-referrer"
              />
            ))}
          </div>
        </div>
      )}

      {styleMeta.previewType === 'focal-stage' && (
        <div className="relative z-10 flex-1 flex items-center justify-between gap-2 px-1">
          <div className="space-y-1 flex-1 text-right">
            <div
              className="h-2 w-16 rounded-full"
              style={{ backgroundColor: styleMeta.accentHex }}
            />
            <div className="h-1.5 w-11 rounded-full bg-white/40" />
            <div className="flex gap-1 pt-1">
              <span className="h-3 w-7 rounded bg-white/25" />
              <span className="h-3 w-7 rounded bg-white/15" />
            </div>
          </div>
          <img
            src={c0}
            alt=""
            className="w-12 h-16 rounded-xl object-cover border border-rose-400/50 shadow-xl -rotate-3"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      {(styleMeta.previewType === 'cinema' ||
        styleMeta.previewType === 'split-glass' ||
        styleMeta.previewType === 'neon-hud' ||
        styleMeta.previewType === 'light-paper') && (
        <div className="relative z-10 flex-1 flex items-end justify-between gap-2 px-1">
          <div className="space-y-1 flex-1 text-right">
            <div
              className="h-2 w-14 rounded-full"
              style={{ backgroundColor: styleMeta.accentHex }}
            />
            <div
              className={`h-1.5 w-20 rounded-full ${
                styleMeta.isLight ? 'bg-neutral-800/70' : 'bg-white/60'
              }`}
            />
            <div className="flex items-center gap-1 pt-1">
              {[c0, c1, c2].map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="w-6 h-8 rounded object-cover border border-white/25"
                  referrerPolicy="no-referrer"
                />
              ))}
            </div>
          </div>
          <img
            src={c0}
            alt=""
            className="w-11 h-16 rounded-lg object-cover shadow-md border"
            style={{
              borderColor:
                styleMeta.previewType === 'neon-hud'
                  ? styleMeta.accentHex
                  : 'rgba(255,255,255,0.2)',
            }}
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </div>
  );
};

export const StyleSelectorModal: React.FC<StyleSelectorModalProps> = ({
  isOpen,
  currentStyleId,
  onSelectStyle,
  onClose,
  sampleCovers = [],
}) => {
  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-5 overflow-y-auto"
      dir="rtl"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="اختيار نمط وتصميم الموقع"
    >
      <div
        className="w-full max-w-4xl max-h-[90dvh] overflow-y-auto rounded-3xl bg-[#0a0d17] border border-white/15 shadow-2xl p-5 sm:p-7 space-y-6 my-auto text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-rose-500 via-violet-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shrink-0">
              <Palette className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                <span>أنماط وتصاميم الموقع</span>
              </h2>
              <p className="text-xs sm:text-sm text-white/65 mt-0.5">
                اختر الستايل والتصميم الذي يظهر به الموقع وأعمالك فوراً — يتغير التخطيط والألوان بالكامل حسب ذوقك
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center cursor-pointer shrink-0 transition-colors"
            aria-label="إغلاق الأنماط"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Style Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SITE_STYLES.map((styleMeta) => {
            const selected = styleMeta.id === currentStyleId;
            return (
              <button
                key={styleMeta.id}
                type="button"
                onClick={() => {
                  onSelectStyle(styleMeta.id);
                  onClose();
                }}
                className={`group text-right rounded-3xl border p-3.5 transition-all duration-200 cursor-pointer flex flex-col gap-3 ${
                  selected
                    ? 'bg-violet-600/20 border-violet-400 ring-2 ring-violet-400/40 shadow-xl'
                    : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/10 hover:border-white/30'
                }`}
              >
                <StyleMiniaturePreview
                  styleMeta={styleMeta}
                  sampleCovers={sampleCovers}
                />

                <div className="flex-1 flex flex-col justify-between gap-2 px-1">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm sm:text-base font-black text-white group-hover:text-violet-200 transition-colors">
                        {styleMeta.name}
                      </span>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0"
                        style={{
                          borderColor: `${styleMeta.accentHex}66`,
                          color: styleMeta.isLight ? '#fda4af' : '#e2e8f0',
                          backgroundColor: `${styleMeta.accentHex}22`,
                        }}
                      >
                        {styleMeta.tag}
                      </span>
                    </div>

                    <p className="text-xs text-white/65 leading-relaxed mt-1">
                      {styleMeta.description}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/30"
                        style={{ backgroundColor: styleMeta.bgHex }}
                      />
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/30"
                        style={{ backgroundColor: styleMeta.accentHex }}
                      />
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/30"
                        style={{ backgroundColor: styleMeta.secondaryHex }}
                      />
                    </div>

                    {selected ? (
                      <span className="text-emerald-300 font-black flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>مفعّل حالياً</span>
                      </span>
                    ) : (
                      <span className="text-violet-300 group-hover:text-white font-bold flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        <span>تطبيق النمط</span>
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
};
