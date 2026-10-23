/** Only real decoded dimensions determine the quality warning and scale cap. */
export function previewQuality(width: number, height: number) {
  const known = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
  return { known, limited: known && Math.min(width, height) < 600,
    label: known ? `${width} × ${height} px` : "Resolução não identificada" };
}
