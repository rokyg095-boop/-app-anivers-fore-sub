import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 sm:right-auto z-50 flex items-center justify-center sm:justify-start gap-2 rounded-2xl bg-amber-600/95 backdrop-blur-md border border-amber-400/40 px-4 py-2.5 text-xs font-bold text-white shadow-2xl"
      dir="rtl"
      role="status"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>لا يوجد اتصال بالإنترنت — يتم عرض النسخة المحفوظة مؤقتاً</span>
    </div>
  );
};
