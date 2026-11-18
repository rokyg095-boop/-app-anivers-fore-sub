import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (import.meta.env.DEV) {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then(async (regs) => {
        if (regs.length > 0) {
          await Promise.all(regs.map((r) => r.unregister()));
          if (typeof caches !== 'undefined') {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          try {
            if (!sessionStorage.getItem('aniverse_dev_sw_reset')) {
              sessionStorage.setItem('aniverse_dev_sw_reset', '1');
              window.location.reload();
            }
          } catch {}
        }
      })
      .catch(() => {});
  }
} else {
  registerSW({ immediate: true });
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'حدث خطأ غير متوقع أثناء عرض الصفحة',
    };
  }

  componentDidCatch(error: Error) {
    console.error('RootErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen bg-[#070b18] text-white flex items-center justify-center p-6"
        >
          <div className="max-w-md w-full rounded-3xl border border-white/15 bg-white/[0.05] backdrop-blur-xl p-6 text-center space-y-4 shadow-2xl">
            <h1 className="text-xl font-black text-rose-300">
              حدث خلل مؤقت في عرض الصفحة
            </h1>
            <p className="text-xs text-white/75 leading-relaxed">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem('aniverse_tmdb_client_cache_v1');
                  localStorage.removeItem('aniverse_tmdb_client_cache_v2');
                } catch {}
                window.location.reload();
              }}
              className="px-5 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
            >
              إعادة تحميل الموقع
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
