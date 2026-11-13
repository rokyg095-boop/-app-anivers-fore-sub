import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { ADMIN_EMAIL } from './adminConfig.ts';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export { ADMIN_EMAIL };

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function isVerifiedAdminUser(user: User | null): boolean {
  if (!user) return false;
  return Boolean(user.emailVerified && user.email === ADMIN_EMAIL);
}

export async function signInWithGoogleAdmin(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/unauthorized-domain') {
      throw new Error(
        `لا يمكن تسجيل الدخول بحساب Google من هذا العنوان (${window.location.hostname}). ` +
          'افتح الموقع عبر localhost على الكمبيوتر، أو أضف هذا العنوان في Firebase Console ← Authentication ← Settings ← Authorized domains.'
      );
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('المتصفح منع نافذة تسجيل الدخول — اسمح بالنوافذ المنبثقة لهذا الموقع ثم حاول مجدداً.');
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('تم إغلاق نافذة تسجيل الدخول قبل الإكمال.');
    }
    throw err;
  }
}

export async function signOutAdmin(): Promise<void> {
  await signOut(auth);
}

export function subscribeAuthState(
  callback: (user: User | null, ready: boolean) => void
): () => void {
  return onAuthStateChanged(auth, (user) => {
    callback(user, true);
  });
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

if (typeof window !== 'undefined') {
  void testConnection();
}
