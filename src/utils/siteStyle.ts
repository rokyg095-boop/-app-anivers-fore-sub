import { useEffect, useState } from 'react';

export type SiteStyleId =
  | 'cinema-aura'
  | 'spiderverse-stage'
  | 'netflix-3d'
  | 'oli-studio'
  | 'aurora-glass'
  | 'cyber-neon'
  | 'sakura-light';

export interface SiteStyleMeta {
  id: SiteStyleId;
  name: string;
  tag: string;
  description: string;
  isLight?: boolean;
  accentHex: string;
  secondaryHex: string;
  bgHex: string;
  previewType:
    | 'cinema'
    | 'focal-stage'
    | 'wing-3d'
    | 'curved-fan'
    | 'split-glass'
    | 'neon-hud'
    | 'light-paper';
}

export const SITE_STYLES: SiteStyleMeta[] = [
  {
    id: 'cinema-aura',
    name: 'السينمائي المضيء',
    tag: 'الافتراضي',
    description: 'واجهة سينمائية بخلفية متوهجة تندمج مع ألوان العمل وشريط بوسترات أفقي.',
    accentHex: '#7c3aed',
    secondaryHex: '#ec4899',
    bgHex: '#060911',
    previewType: 'cinema',
  },
  {
    id: 'spiderverse-stage',
    name: 'العرض المسرحي الجريء',
    tag: 'ديناميكي',
    description: 'تصميم بطولي جريء بهالة قرمزية ليلية وشريط مشاهد سريعة بأسهم دائرية.',
    accentHex: '#e11d48',
    secondaryHex: '#4f46e5',
    bgHex: '#090716',
    previewType: 'focal-stage',
  },
  {
    id: 'netflix-3d',
    name: 'المنصة ثلاثية الأبعاد',
    tag: 'عرض 3D',
    description: 'بوستر مركزي بارز محاط بأجنحة بوسترات مائلة وبحث مباشر وصف متابعة المشاهدة.',
    accentHex: '#dc2626',
    secondaryHex: '#f59e0b',
    bgHex: '#0a0b0f',
    previewType: 'wing-3d',
  },
  {
    id: 'oli-studio',
    name: 'الاستوديو الفني المنحني',
    tag: 'معرض فني',
    description: 'معرض أفقي مقوّس يستعرض أعمالك في لوحات متجاورة مائلة بشعار القطة بالمنتصف.',
    accentHex: '#f43f5e',
    secondaryHex: '#fb923c',
    bgHex: '#0c0c10',
    previewType: 'curved-fan',
  },
  {
    id: 'aurora-glass',
    name: 'الزجاج القطبي',
    tag: 'هادئ',
    description: 'توازن أنيق بزجاج شفاف وإضاءة زمردية وبنفسجية ناعمة وتفاصيل واضحة.',
    accentHex: '#10b981',
    secondaryHex: '#6366f1',
    bgHex: '#070c14',
    previewType: 'split-glass',
  },
  {
    id: 'cyber-neon',
    name: 'النيون المستقبلي',
    tag: 'عالي التباين',
    description: 'إطارات نيون سيان وأرجوانية حادة بأسلوب مستقبلي عصري وتوهج تقني.',
    accentHex: '#06b6d4',
    secondaryHex: '#d946ef',
    bgHex: '#05050a',
    previewType: 'neon-hud',
  },
  {
    id: 'sakura-light',
    name: 'الورق الدافئ الفاتح',
    tag: 'وضع نهاري',
    description: 'نمط فاتح مريح للعين بخلفية ورقية دافئة وخط داكن واضح ولمسات قرمزية.',
    isLight: true,
    accentHex: '#e11d48',
    secondaryHex: '#7c3aed',
    bgHex: '#f6f2eb',
    previewType: 'light-paper',
  },
];

const STORAGE_KEY = 'aniverse_site_style_v1';
export const SITE_STYLE_CHANGED_EVENT = 'aniverse:site-style-changed';

export function getSavedSiteStyle(): SiteStyleId {
  if (typeof window === 'undefined') return 'cinema-aura';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) as SiteStyleId | null;
    if (raw && SITE_STYLES.some((s) => s.id === raw)) {
      return raw;
    }
  } catch {
    // ignore storage errors
  }
  return 'cinema-aura';
}

export function setSavedSiteStyle(styleId: SiteStyleId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, styleId);
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(
    new CustomEvent<SiteStyleId>(SITE_STYLE_CHANGED_EVENT, { detail: styleId })
  );
}

export function getSiteStyleMeta(styleId: SiteStyleId): SiteStyleMeta {
  return SITE_STYLES.find((s) => s.id === styleId) || SITE_STYLES[0];
}

export function useSiteStyle(): [SiteStyleId, (next: SiteStyleId) => void, SiteStyleMeta] {
  const [styleId, setStyleId] = useState<SiteStyleId>(() => getSavedSiteStyle());

  useEffect(() => {
    const onChanged = (e: Event) => {
      const custom = e as CustomEvent<SiteStyleId>;
      if (custom.detail) {
        setStyleId(custom.detail);
      } else {
        setStyleId(getSavedSiteStyle());
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setStyleId(getSavedSiteStyle());
      }
    };
    window.addEventListener(SITE_STYLE_CHANGED_EVENT, onChanged);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SITE_STYLE_CHANGED_EVENT, onChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const updateStyle = (next: SiteStyleId) => {
    setStyleId(next);
    setSavedSiteStyle(next);
  };

  return [styleId, updateStyle, getSiteStyleMeta(styleId)];
}
