import React from 'react';
import { AVATAR_OPTIONS } from '../data/seedData';

interface AvatarProps {
  avatarId: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const AvatarIllustration: React.FC<AvatarProps> = ({
  avatarId,
  size = 'md',
  className = '',
}) => {
  const found = AVATAR_OPTIONS.find((a) => a.id === avatarId) || AVATAR_OPTIONS[0];

  const sizeMap = {
    sm: 'w-8 h-8 text-base',
    md: 'w-11 h-11 text-xl',
    lg: 'w-16 h-16 text-3xl',
    xl: 'w-20 h-20 text-4xl',
  };

  return (
    <div
      className={`rounded-full flex items-center justify-center select-none shrink-0 font-medium shadow-xs border border-white/80 ${sizeMap[size]} ${className}`}
      style={{ backgroundColor: found.bg }}
      title={found.label}
      aria-label={found.label}
    >
      <span role="img" aria-hidden="true">
        {found.emoji}
      </span>
    </div>
  );
};

interface BadgeArtworkProps {
  badgeId: string;
  earned: boolean;
  size?: 'md' | 'lg';
}

export const BadgeArtwork: React.FC<BadgeArtworkProps> = ({
  badgeId,
  earned,
  size = 'lg',
}) => {
  const dim = size === 'lg' ? 'w-16 h-16' : 'w-12 h-12';

  const getColors = () => {
    if (!earned) {
      return { bg: '#ECEAE4', ring: '#D6D3CB', emoji: '🔒' };
    }
    if (badgeId.endsWith('badge_01_sprout')) {
      return { bg: '#CCF3E4', ring: '#34D399', emoji: '🌱' };
    }
    if (badgeId.endsWith('badge_02_messenger')) {
      return { bg: '#F9D8D6', ring: '#F472B6', emoji: '💌' };
    }
    if (badgeId.endsWith('badge_03_observer')) {
      return { bg: '#E2DAFA', ring: '#818CF8', emoji: '👀' };
    }
    if (badgeId.endsWith('badge_04_carer')) {
      return { bg: '#FBE3C8', ring: '#FB923C', emoji: '🤝' };
    }
    return { bg: '#FEF08A', ring: '#FACC15', emoji: '🌟' };
  };

  const { bg, ring, emoji } = getColors();

  return (
    <div
      className={`${dim} rounded-2xl flex items-center justify-center relative shrink-0 transition-transform duration-150`}
      style={{
        backgroundColor: bg,
        border: `2px solid ${ring}`,
        opacity: earned ? 1 : 0.65,
      }}
    >
      <span className={size === 'lg' ? 'text-3xl' : 'text-xl'} role="img" aria-hidden="true">
        {emoji}
      </span>
    </div>
  );
};
