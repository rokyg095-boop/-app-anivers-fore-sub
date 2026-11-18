import React from 'react';

export const CAT_LOGO_SRC =
  '/assets/aistudio/_______Logo_Kyodo_Comunidades___Chats__44f4e664.jpeg';

interface BrandLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  className = '',
}) => {
  const sizeClass =
    size === 'xs'
      ? 'w-7 h-7 rounded-lg p-[2px]'
      : size === 'sm'
      ? 'w-8 h-8 rounded-xl p-[2px]'
      : size === 'lg'
      ? 'w-14 h-14 rounded-2xl p-1'
      : 'w-9 h-9 rounded-xl p-[2px]';

  return (
    <span
      className={`inline-flex items-center justify-center bg-white overflow-hidden shadow-md ring-1 ring-rose-500/40 shrink-0 ${sizeClass} ${className}`}
    >
      <img
        src={CAT_LOGO_SRC}
        alt="AniVerse"
        className="w-full h-full object-contain scale-110 select-none"
        draggable={false}
      />
    </span>
  );
};
