import { useEffect, useState } from 'react';

const FAVORITES_STORAGE_KEY = 'aniverse_favorites_v1';
export const FAVORITES_UPDATED_EVENT = 'aniverse-favorites-updated';

export function getFavoriteIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function isFavoriteWork(id: string): boolean {
  return getFavoriteIds().includes(id);
}

export function toggleFavoriteWork(id: string): string[] {
  if (typeof window === 'undefined') return [];
  const current = getFavoriteIds();
  const next = current.includes(id)
    ? current.filter((item) => item !== id)
    : [id, ...current];
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  window.dispatchEvent(new CustomEvent(FAVORITES_UPDATED_EVENT, { detail: next }));
  return next;
}

export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => getFavoriteIds());

  useEffect(() => {
    const sync = () => setFavoriteIds(getFavoriteIds());
    window.addEventListener(FAVORITES_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(FAVORITES_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return {
    favoriteIds,
    isFavorite: (id: string) => favoriteIds.includes(id),
    toggleFavorite: (id: string) => toggleFavoriteWork(id),
  };
}
