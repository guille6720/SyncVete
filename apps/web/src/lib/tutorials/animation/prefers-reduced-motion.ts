export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Subscribe to changes in the user's motion preference. */
export function subscribePrefersReducedMotion(
  listener: (reduced: boolean) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onChange = () => listener(media.matches);
  listener(media.matches);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
