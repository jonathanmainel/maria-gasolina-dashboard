import { googleAdsLogoUrl } from "../lib/app-path";

type GoogleAdsLogoProps = {
  size?: number;
  className?: string;
};

export function GoogleAdsLogo({ size = 28, className }: GoogleAdsLogoProps) {
  return <img aria-hidden="true" className={className} src={googleAdsLogoUrl} width={size} height={size} alt="" />;
}

export function GoogleAnalyticsLogo({ size = 28, className }: GoogleAdsLogoProps) {
  return (
    <span
      aria-hidden="true"
      className={`google-analytics-logo ${className ?? ""}`.trim()}
      style={{ width: size, height: size }}
    >
      <span />
      <span />
      <span />
    </span>
  );
}

