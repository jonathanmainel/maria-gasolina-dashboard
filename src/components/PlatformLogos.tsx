type GoogleAdsLogoProps = {
  size?: number;
  className?: string;
};

const googleAdsLogoUrl =
  "https://www.gstatic.com/marketing-cms/assets/images/a0/c7/a37cda3447639b52f627e91993ee/ads.webp=s80-fcrop64=1,00000000ffffffff-rw";

export function GoogleAdsLogo({ size = 28, className }: GoogleAdsLogoProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      decoding="async"
      height={size}
      src={googleAdsLogoUrl}
      width={size}
    />
  );
}
