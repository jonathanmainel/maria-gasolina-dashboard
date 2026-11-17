export function parseBrl(input: string): string | null {
  const raw = input.trim().replace(/^R\$\s*/, "");
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.replaceAll(".", "").split(",");
  const digits = whole.replace(/^0+(?=\d)/, "");
  return digits.length <= 12 ? `${digits}.${fraction.padEnd(2, "0")}` : null;
}
