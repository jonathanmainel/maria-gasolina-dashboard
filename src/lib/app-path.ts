const baseUrl = import.meta.env.BASE_URL;

export function appUrl(path: string) {
  return `${baseUrl}${path.replace(/^\/+/, "")}`;
}

export const brandLogoUrl = appUrl("brand/maria-gasolina.svg");
export const googleAdsLogoUrl = appUrl("brand/google-ads.png");
