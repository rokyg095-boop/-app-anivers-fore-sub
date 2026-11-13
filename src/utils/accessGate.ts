import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  db,
  auth,
  isVerifiedAdminUser,
  OperationType,
  handleFirestoreError,
} from '../firebase.ts';

export const ACCESS_GATE_STORAGE_KEY = 'aniverse_access_unlock_v1';
export const ACCESS_GATE_UPDATED_EVENT = 'aniverse-access-gate-updated';

// SHA-256 hex digest of default initial invite code
const DEFAULT_PASSCODE_HASH =
  '73a2af8864fc500fa49048bf3003776c19938f360e56bd03663866fb3087884a';

export interface AccessGateConfig {
  enabled: boolean;
  passcodeHash: string;
  gateVersion: number;
  source: 'cloud' | 'default';
}

export async function hashPasscode(code: string): Promise<string> {
  const normalized = code.trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getDefaultAccessGateConfig(): AccessGateConfig {
  return {
    enabled: true,
    passcodeHash: DEFAULT_PASSCODE_HASH,
    gateVersion: 1,
    source: 'default',
  };
}

export async function fetchAccessGateConfig(): Promise<AccessGateConfig> {
  const docPath = 'siteSettings/accessGate';
  const ref = doc(db, 'siteSettings', 'accessGate');
  let timerId: ReturnType<typeof setTimeout> | undefined;
  try {
    const snap = await Promise.race([
      getDoc(ref),
      new Promise<null>((resolve) => {
        timerId = setTimeout(() => resolve(null), 3500);
      }),
    ]);
    if (timerId) clearTimeout(timerId);
    if (!snap || !snap.exists()) {
      return getDefaultAccessGateConfig();
    }
    const data = snap.data() as Record<string, unknown>;
    const enabled = typeof data.enabled === 'boolean' ? data.enabled : true;
    const passcodeHash =
      typeof data.passcodeHash === 'string' && /^[a-f0-9]{64}$/.test(data.passcodeHash)
        ? data.passcodeHash
        : DEFAULT_PASSCODE_HASH;
    const gateVersion =
      typeof data.gateVersion === 'number' && data.gateVersion >= 1
        ? Math.floor(data.gateVersion)
        : 1;

    return {
      enabled,
      passcodeHash,
      gateVersion,
      source: 'cloud',
    };
  } catch (error) {
    if (timerId) clearTimeout(timerId);
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

interface StoredUnlockPayload {
  hash: string;
  gateVersion: number;
  unlockedAt: number;
}

export function isAccessUnlockedLocally(config: AccessGateConfig): boolean {
  if (!config.enabled) return true;
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(ACCESS_GATE_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<StoredUnlockPayload>;
    return (
      parsed.hash === config.passcodeHash &&
      parsed.gateVersion === config.gateVersion
    );
  } catch {
    return false;
  }
}

export async function verifyAndUnlockPasscode(
  inputCode: string,
  config: AccessGateConfig
): Promise<boolean> {
  const trimmed = inputCode.trim();
  if (!trimmed) return false;

  const enteredHash = await hashPasscode(trimmed);
  if (enteredHash !== config.passcodeHash) {
    return false;
  }

  if (typeof window !== 'undefined') {
    const payload: StoredUnlockPayload = {
      hash: config.passcodeHash,
      gateVersion: config.gateVersion,
      unlockedAt: Date.now(),
    };
    window.localStorage.setItem(ACCESS_GATE_STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new Event(ACCESS_GATE_UPDATED_EVENT));
  }
  return true;
}

export function clearStoredAccessUnlock(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_GATE_STORAGE_KEY);
  window.dispatchEvent(new Event(ACCESS_GATE_UPDATED_EVENT));
}

export async function saveAccessGateSettings(params: {
  enabled: boolean;
  newPasscode?: string;
}): Promise<AccessGateConfig> {
  const user = auth.currentUser;
  if (!user || !isVerifiedAdminUser(user)) {
    throw new Error('يجب تسجيل الدخول بحساب مالك الموقع لتعديل إعدادات رمز الدخول.');
  }

  const docPath = 'siteSettings/accessGate';
  const ref = doc(db, 'siteSettings', 'accessGate');

  let existingExists = false;
  let currentHash = DEFAULT_PASSCODE_HASH;
  let currentVersion = 1;

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      existingExists = true;
      const data = snap.data() as Record<string, unknown>;
      if (typeof data.passcodeHash === 'string' && /^[a-f0-9]{64}$/.test(data.passcodeHash)) {
        currentHash = data.passcodeHash;
      }
      if (typeof data.gateVersion === 'number' && data.gateVersion >= 1) {
        currentVersion = Math.floor(data.gateVersion);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }

  const trimmedNewCode = (params.newPasscode || '').trim();
  let nextHash = currentHash;
  let nextVersion = currentVersion;

  if (trimmedNewCode.length > 0) {
    if (trimmedNewCode.length < 3 || trimmedNewCode.length > 64) {
      throw new Error('يجب أن يتكون رمز الدخول من 3 إلى 64 حرفاً أو رقماً.');
    }
    nextHash = await hashPasscode(trimmedNewCode);
    nextVersion = existingExists ? Math.min(currentVersion + 1, 1000000) : 1;
  }

  if (!existingExists) {
    try {
      await setDoc(ref, {
        settingId: 'accessGate',
        enabled: params.enabled,
        passcodeHash: nextHash,
        gateVersion: nextVersion,
        isPublic: true,
        updatedByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    }
  } else {
    try {
      await updateDoc(ref, {
        enabled: params.enabled,
        passcodeHash: nextHash,
        gateVersion: nextVersion,
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
  }

  const updatedConfig: AccessGateConfig = {
    enabled: params.enabled,
    passcodeHash: nextHash,
    gateVersion: nextVersion,
    source: 'cloud',
  };

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ACCESS_GATE_UPDATED_EVENT, { detail: updatedConfig }));
  }

  return updatedConfig;
}
