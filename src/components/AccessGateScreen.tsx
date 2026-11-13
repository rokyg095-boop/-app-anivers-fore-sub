import React, { useState } from 'react';
import { Lock, Eye, EyeOff, KeyRound, ShieldCheck, AlertCircle, LogIn } from 'lucide-react';
import {
  AccessGateConfig,
  verifyAndUnlockPasscode,
} from '../utils/accessGate.ts';
import {
  ADMIN_EMAIL,
  isVerifiedAdminUser,
  signInWithGoogleAdmin,
  signOutAdmin,
} from '../firebase.ts';

interface AccessGateScreenProps {
  gateConfig: AccessGateConfig;
  onUnlocked: () => void;
}

export const AccessGateScreen: React.FC<AccessGateScreenProps> = ({
  gateConfig,
  onUnlocked,
}) => {
  const [codeInput, setCodeInput] = useState<string>('');
  const [showCode, setShowCode] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [adminLoading, setAdminLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeInput.trim()) {
      setErrorMsg('يرجى إدخال رمز الدخول أولاً.');
      return;
    }

    setChecking(true);
    setErrorMsg(null);
    try {
      const ok = await verifyAndUnlockPasscode(codeInput, gateConfig);
      if (ok) {
        onUnlocked();
      } else {
        setErrorMsg('رمز الدخول غير صحيح. تأكد من الرمز وحاول مرة أخرى.');
      }
    } catch {
      setErrorMsg('تعذر التحقق من الرمز في هذا المتصفح.');
    } finally {
      setChecking(false);
    }
  };

  const handleOwnerLogin = async () => {
    setAdminLoading(true);
    setErrorMsg(null);
    try {
      const user = await signInWithGoogleAdmin();
      if (isVerifiedAdminUser(user)) {
        onUnlocked();
      } else {
        await signOutAdmin();
        setErrorMsg(`الدخول التلقائي مخصص لبريد المالك فقط (${ADMIN_EMAIL}). يرجى إدخال رمز الدعوة.`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تسجيل الدخول بحساب Google.');
    } finally {
      setAdminLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 relative overflow-hidden"
      dir="rtl"
    >
      {/* Ambient Background Glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 right-1/4 w-96 h-96 rounded-full bg-rose-600/15 blur-3xl" />
        <div className="absolute -bottom-40 left-1/4 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md bg-neutral-900/95 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
        {/* Brand & Lock Emblem */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-600 to-rose-700 flex items-center justify-center text-white shadow-xl shadow-rose-950/60 border border-rose-400/30">
              <Lock className="w-8 h-8" />
            </div>
            <div className="w-7 h-7 rounded-lg bg-neutral-950 border border-neutral-700 flex items-center justify-center text-[11px] font-mono font-black text-amber-400 absolute -bottom-1.5 -left-1.5 shadow">
              AV
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>دخول خاص بالمدعوين فقط</span>
            </span>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight pt-1">
              منصة AniVerse الخاصة
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
              هذا الموقع محمي برمز دخول خاص. أدخل الكود الذي حصلت عليه من المشرف لفتح المكتبة.
            </p>
          </div>
        </div>

        {/* Passcode Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>رمز الدخول (كود الدعوة):</span>
            </label>

            <div className="relative">
              <input
                type={showCode ? 'text' : 'password'}
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="أدخل رمز الدخول..."
                autoFocus
                autoComplete="off"
                dir="ltr"
                className="w-full bg-neutral-950 border border-neutral-700 focus:border-rose-500 rounded-xl py-3 px-11 text-center text-lg font-mono tracking-[0.25em] text-white placeholder:text-neutral-600 placeholder:tracking-normal placeholder:text-xs focus:outline-none transition-colors"
              />

              <button
                type="button"
                onClick={() => setShowCode((prev) => !prev)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer"
                title={showCode ? 'إخفاء الرمز' : 'إظهار الرمز'}
              >
                {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={checking}
            className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm shadow-lg shadow-rose-950/60 transition-all cursor-pointer active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            <span>{checking ? 'جاري التحقق من الرمز...' : 'فتح الدخول للموقع'}</span>
          </button>
        </form>

        {/* Owner Direct Sign-In */}
        <div className="pt-4 border-t border-neutral-800/80 flex flex-col items-center gap-2 text-center">
          <button
            type="button"
            onClick={handleOwnerLogin}
            disabled={adminLoading}
            className="text-xs font-bold text-neutral-400 hover:text-amber-400 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{adminLoading ? 'جاري فتح نافذة Google...' : 'دخول مالك الموقع مباشرة (Google)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
