import { useEffect } from 'react';

export function useBodyScrollLock(locked) {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.classList.toggle('overlay-locked', locked);
    return () => document.body.classList.remove('overlay-locked');
  }, [locked]);
}
