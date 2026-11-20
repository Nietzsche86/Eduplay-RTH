import { useState } from 'react';

export const SCHOOL_LOGO_SRC = '/assets/aistudio/logo_sekolah_1ae42865.png';
export const SCHOOL_NAME = 'MTs. Roudhotut Thowalib';

interface SchoolLogoProps {
  className?: string;
  alt?: string;
}

export function SchoolLogo({
  className = 'h-10 w-10',
  alt = 'Logo MTs. Roudhotut Thowalib Al-Mukhlisiyyah',
}: SchoolLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        aria-label={alt}
        className={`inline-flex items-center justify-center rounded-xl bg-emerald-700 font-display text-base font-black text-amber-300 ${className}`}
      >
        E
      </span>
    );
  }

  return (
    <img
      src={SCHOOL_LOGO_SRC}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-contain drop-shadow-sm select-none ${className}`}
    />
  );
}
