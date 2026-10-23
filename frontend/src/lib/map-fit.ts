/** Pure camera target computation; invalid coordinates never influence bounds. */
export function listingBounds(points: readonly (readonly number[])[]): [[number, number], [number, number]] | null {
  const valid = points.filter((p) => p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90);
  if (!valid.length) return null;
  return [[Math.min(...valid.map((p) => p[0])), Math.min(...valid.map((p) => p[1]))], [Math.max(...valid.map((p) => p[0])), Math.max(...valid.map((p) => p[1]))]];
}

/** Fit once per ZIP, only after both prerequisites. A saved URL camera wins on first navigation. */
export function shouldFitZip(ready: boolean, loaded: boolean, zip: string, lastZip: string | null, restoreInitial: boolean): boolean {
  return ready && loaded && zip !== lastZip && !(lastZip === null && restoreInitial);
}
