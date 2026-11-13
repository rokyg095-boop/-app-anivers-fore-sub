import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, isVerifiedAdminUser, OperationType } from '../firebase.ts';
import { DubEpisode, DubSeason, DubSeries } from '../data/mockData.ts';
import { SOURCES_UPDATED_EVENT } from './videoSource.ts';

export type CustomWorkCategory = 'anime' | 'movie' | 'dubbed';

export interface CustomWorkRecord {
  workId: string;
  category: CustomWorkCategory;
  title: string;
  originalTitle: string;
  coverImage: string;
  bannerImage: string;
  genres: string[];
  dubStudio: string;
  rating: number;
  seasonsCount: number;
  episodesCount: number;
  synopsis: string;
  updatedAt?: string;
}

const CUSTOM_WORKS_COLLECTION = 'customWorks';
const CUSTOM_WORKS_STORAGE_KEY = 'aniverse_custom_works_v1';
export const CUSTOM_WORKS_UPDATED_EVENT = 'aniverse_custom_works_updated';
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

function readLocalCustomWorks(): Record<string, CustomWorkRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CUSTOM_WORKS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalCustomWorks(data: Record<string, CustomWorkRecord>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_WORKS_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to mirror custom works to localStorage:', e);
  }
}

let inMemoryCustomWorks: Record<string, CustomWorkRecord> = readLocalCustomWorks();

export function generateWorkId(category: CustomWorkCategory, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `cw-${category}-${slug || 'work'}-${stamp}-${rand}`.slice(0, 120);
}

/**
 * Compresses an uploaded image file to a fast, compact JPEG Data URL under ~320KB
 * so it stays well within Firestore's document size limits while looking crisp.
 */
export async function compressImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('الملف المختار ليس صورة صالحة'));
      img.onload = () => {
        const maxDim = 640;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('تعذر معالجة الصورة'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let quality = 0.84;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 350000 && quality > 0.35) {
          quality -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        if (dataUrl.length > 390000) {
          const smallCanvas = document.createElement('canvas');
          smallCanvas.width = Math.round(canvas.width * 0.7);
          smallCanvas.height = Math.round(canvas.height * 0.7);
          const sCtx = smallCanvas.getContext('2d');
          if (sCtx) {
            sCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
            dataUrl = smallCanvas.toDataURL('image/jpeg', 0.72);
          }
        }

        resolve(dataUrl);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function docDataToCustomWork(workId: string, data: Record<string, unknown>): CustomWorkRecord {
  const rawUpdatedAt = data.updatedAt;
  let isoUpdatedAt: string | undefined;
  if (rawUpdatedAt instanceof Timestamp) {
    isoUpdatedAt = rawUpdatedAt.toDate().toISOString();
  } else if (typeof rawUpdatedAt === 'string') {
    isoUpdatedAt = rawUpdatedAt;
  }

  const catRaw = String(data.category || 'anime');
  const category: CustomWorkCategory =
    catRaw === 'movie' || catRaw === 'dubbed' ? catRaw : 'anime';

  return {
    workId,
    category,
    title: String(data.title || 'عمل جديد'),
    originalTitle: String(data.originalTitle || ''),
    coverImage: String(data.coverImage || ''),
    bannerImage: String(data.bannerImage || data.coverImage || ''),
    genres:
      Array.isArray(data.genres) && data.genres.length > 0
        ? data.genres.map((g) => String(g))
        : ['مغامرات'],
    dubStudio: String(data.dubStudio || 'فريق الموقع'),
    rating: typeof data.rating === 'number' ? data.rating : 9.0,
    seasonsCount: typeof data.seasonsCount === 'number' ? Math.max(1, data.seasonsCount) : 1,
    episodesCount: typeof data.episodesCount === 'number' ? Math.max(1, data.episodesCount) : 1,
    synopsis: String(data.synopsis || ''),
    updatedAt: isoUpdatedAt,
  };
}

export function buildDubSeriesFromCustomWork(work: CustomWorkRecord): DubSeries {
  const safeCategory: CustomWorkCategory = work.category;
  const totalSeasons = safeCategory === 'movie' ? 1 : Math.min(30, Math.max(1, work.seasonsCount || 1));
  const totalEpisodes = safeCategory === 'movie' ? 1 : Math.min(300, Math.max(1, work.episodesCount || 1));
  const studioLabel = work.dubStudio?.trim() || 'إضافة المالك';
  const cover = work.coverImage;
  const banner = work.bannerImage?.trim() || cover;

  if (safeCategory === 'movie') {
    const movieEp: DubEpisode = {
      id: `${work.workId}-movie-1`,
      episodeNumber: 1,
      title: `${work.title} (الفيلم الكامل)`,
      duration: '02:00:00',
      thumbnail: banner,
      videoUrl: '',
      dubStudio: studioLabel,
      voiceActors: [studioLabel],
      releaseDate: '2026',
      description: work.synopsis,
      isComingSoon: true,
    };

    const movieSeason: DubSeason = {
      id: `${work.workId}-season-1`,
      seasonNumber: 1,
      title: 'الفيلم السينمائي الكامل',
      episodesCount: 1,
      episodes: [movieEp],
    };

    return {
      id: work.workId,
      title: work.title,
      originalTitle: work.originalTitle || work.title,
      coverImage: cover,
      bannerImage: banner,
      genres: work.genres.length > 0 ? work.genres : ['سينما'],
      dubStudio: studioLabel,
      director: studioLabel,
      rating: work.rating || 9.0,
      episodesCount: 1,
      synopsis: work.synopsis,
      seasons: [movieSeason],
      episodes: [movieEp],
      category: 'movie',
    };
  }

  const allEpisodes: DubEpisode[] = [];
  for (let i = 1; i <= totalEpisodes; i += 1) {
    allEpisodes.push({
      id: `${work.workId}-ep-${i}`,
      episodeNumber: i,
      title: `الحلقة ${i}`,
      duration: '24:00',
      thumbnail: cover,
      videoUrl: '',
      dubStudio: studioLabel,
      voiceActors: [studioLabel],
      releaseDate: '2026',
      description: work.synopsis,
      isComingSoon: true,
    });
  }

  const seasons: DubSeason[] = [];
  const perSeason = Math.ceil(allEpisodes.length / totalSeasons);
  for (let s = 0; s < totalSeasons; s += 1) {
    const chunk = allEpisodes.slice(s * perSeason, (s + 1) * perSeason);
    if (chunk.length > 0 || s === 0) {
      seasons.push({
        id: `${work.workId}-season-${s + 1}`,
        seasonNumber: s + 1,
        title: `الموسم ${s + 1}`,
        episodesCount: chunk.length,
        episodes: chunk,
      });
    }
  }

  return {
    id: work.workId,
    title: work.title,
    originalTitle: work.originalTitle || work.title,
    coverImage: cover,
    bannerImage: banner,
    genres: work.genres.length > 0 ? work.genres : ['مغامرات'],
    dubStudio: studioLabel,
    director: studioLabel,
    rating: work.rating || 9.0,
    episodesCount: allEpisodes.length,
    synopsis: work.synopsis,
    seasons,
    episodes: allEpisodes,
    category: safeCategory,
  };
}

export async function syncCustomWorksFromCloud(): Promise<Record<string, CustomWorkRecord>> {
  if (typeof window === 'undefined') return inMemoryCustomWorks;
  const q = query(collection(db, CUSTOM_WORKS_COLLECTION), where('isPublic', '==', true));
  try {
    const snap = await getDocs(q);
    const cloudWorks: Record<string, CustomWorkRecord> = {};
    snap.forEach((docSnap) => {
      cloudWorks[docSnap.id] = docDataToCustomWork(docSnap.id, docSnap.data());
    });
    inMemoryCustomWorks = cloudWorks;
    writeLocalCustomWorks(cloudWorks);
    window.dispatchEvent(new CustomEvent(CUSTOM_WORKS_UPDATED_EVENT));
    window.dispatchEvent(new CustomEvent(SOURCES_UPDATED_EVENT));
    return inMemoryCustomWorks;
  } catch (error) {
    console.warn('Custom works cloud sync skipped or failed:', error);
    return inMemoryCustomWorks;
  }
}

export function attachCustomWorksRealtimeListener(): () => void {
  const q = query(collection(db, CUSTOM_WORKS_COLLECTION), where('isPublic', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const cloudWorks: Record<string, CustomWorkRecord> = {};
      snap.forEach((docSnap) => {
        cloudWorks[docSnap.id] = docDataToCustomWork(docSnap.id, docSnap.data());
      });
      inMemoryCustomWorks = cloudWorks;
      writeLocalCustomWorks(cloudWorks);
      window.dispatchEvent(new CustomEvent(CUSTOM_WORKS_UPDATED_EVENT));
      window.dispatchEvent(new CustomEvent(SOURCES_UPDATED_EVENT));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, CUSTOM_WORKS_COLLECTION);
    }
  );
}

export function getCustomWorkRecords(category?: CustomWorkCategory): CustomWorkRecord[] {
  const all = Object.values(inMemoryCustomWorks);
  const filtered = category ? all.filter((w) => w.category === category) : all;
  return filtered.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function getCustomSeriesByCategory(category: CustomWorkCategory): DubSeries[] {
  return getCustomWorkRecords(category).map(buildDubSeriesFromCustomWork);
}

export async function saveCustomWorkToCloud(
  input: Omit<CustomWorkRecord, 'workId' | 'updatedAt'> & { workId?: string }
): Promise<CustomWorkRecord> {
  const user = auth.currentUser;
  if (!user || !isVerifiedAdminUser(user)) {
    throw new Error('يجب تسجيل الدخول بحساب المشرف لحفظ العمل في سحابة Firebase.');
  }

  const workId = (input.workId?.trim() || generateWorkId(input.category, input.title)).slice(0, 128);
  if (!VALID_ID_REGEX.test(workId)) {
    throw new Error('معرّف العمل غير صالح.');
  }

  const sanitizedTitle = input.title.trim().slice(0, 200);
  const sanitizedSynopsis = input.synopsis.trim().slice(0, 4000);
  const sanitizedCover = input.coverImage.trim().slice(0, 400000);
  const sanitizedBanner = (input.bannerImage?.trim() || sanitizedCover).slice(0, 400000);
  const sanitizedOriginal = (input.originalTitle || '').trim().slice(0, 200);
  const sanitizedStudio = (input.dubStudio || 'إضافة المالك').trim().slice(0, 120);
  const sanitizedGenres =
    input.genres
      .map((g) => g.trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 8);
  if (sanitizedGenres.length === 0) {
    sanitizedGenres.push(input.category === 'movie' ? 'سينما' : 'مغامرات');
  }
  const sanitizedRating = Math.min(10, Math.max(0, Number(input.rating) || 9.0));
  const sanitizedSeasons =
    input.category === 'movie' ? 1 : Math.min(30, Math.max(1, Math.round(input.seasonsCount || 1)));
  const sanitizedEpisodes =
    input.category === 'movie' ? 1 : Math.min(300, Math.max(1, Math.round(input.episodesCount || 12)));

  if (!sanitizedTitle || !sanitizedCover || !sanitizedSynopsis) {
    throw new Error('يرجى إدخال الاسم وصورة الغلاف والوصف.');
  }

  const docPath = `${CUSTOM_WORKS_COLLECTION}/${workId}`;
  const docRef = doc(db, CUSTOM_WORKS_COLLECTION, workId);

  let existsOnCloud = false;
  try {
    const snap = await getDoc(docRef);
    existsOnCloud = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }

  const payloadFields = {
    category: input.category,
    title: sanitizedTitle,
    originalTitle: sanitizedOriginal,
    coverImage: sanitizedCover,
    bannerImage: sanitizedBanner,
    genres: sanitizedGenres,
    dubStudio: sanitizedStudio,
    rating: sanitizedRating,
    seasonsCount: sanitizedSeasons,
    episodesCount: sanitizedEpisodes,
    synopsis: sanitizedSynopsis,
    updatedByUid: user.uid,
    updatedAt: serverTimestamp(),
  };

  if (existsOnCloud) {
    try {
      await updateDoc(docRef, payloadFields);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
  } else {
    try {
      await setDoc(docRef, {
        workId,
        ...payloadFields,
        isPublic: true,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    }
  }

  const savedRecord: CustomWorkRecord = {
    workId,
    category: input.category,
    title: sanitizedTitle,
    originalTitle: sanitizedOriginal,
    coverImage: sanitizedCover,
    bannerImage: sanitizedBanner,
    genres: sanitizedGenres,
    dubStudio: sanitizedStudio,
    rating: sanitizedRating,
    seasonsCount: sanitizedSeasons,
    episodesCount: sanitizedEpisodes,
    synopsis: sanitizedSynopsis,
    updatedAt: new Date().toISOString(),
  };

  inMemoryCustomWorks = {
    ...inMemoryCustomWorks,
    [workId]: savedRecord,
  };
  writeLocalCustomWorks(inMemoryCustomWorks);
  window.dispatchEvent(new CustomEvent(CUSTOM_WORKS_UPDATED_EVENT));
  window.dispatchEvent(new CustomEvent(SOURCES_UPDATED_EVENT));

  return savedRecord;
}

export async function deleteCustomWorkFromCloud(workId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !isVerifiedAdminUser(user)) {
    throw new Error('يجب تسجيل الدخول بحساب المشرف لحذف العمل.');
  }

  const docPath = `${CUSTOM_WORKS_COLLECTION}/${workId}`;
  try {
    await deleteDoc(doc(db, CUSTOM_WORKS_COLLECTION, workId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }

  const next = { ...inMemoryCustomWorks };
  delete next[workId];
  inMemoryCustomWorks = next;
  writeLocalCustomWorks(next);
  window.dispatchEvent(new CustomEvent(CUSTOM_WORKS_UPDATED_EVENT));
  window.dispatchEvent(new CustomEvent(SOURCES_UPDATED_EVENT));
}
