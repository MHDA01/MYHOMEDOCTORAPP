// ============================================================
// components/ui/Avatar.tsx — Avatar reutilizable de la Dra. Hilda
// ============================================================
'use client';

import Image from 'next/image';

interface AvatarProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showStatus?: boolean;
  className?: string;
}

const sizeMap = {
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

export default function DraHildaAvatar({
  size = 'md',
  showStatus = false,
  className = '',
}: AvatarProps) {
  const px = sizeMap[size];

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      <Image
        src="/images/dra_hilda_avatar.png"
        alt="Dra. Hilda — Asistente de Teleorientación"
        width={px}
        height={px}
        className="rounded-full object-cover ring-2 ring-white shadow-md"
        priority={size === 'xl' || size === 'lg'}
      />
      {showStatus && (
        <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-green-400 ring-2 ring-white" />
      )}
    </div>
  );
}
