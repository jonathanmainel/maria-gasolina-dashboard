type GoogleAdsLogoProps = {
  size?: number;
  className?: string;
};

export function GoogleAdsLogo({ size = 28, className }: GoogleAdsLogoProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      height={size}
      viewBox="0 0 48 48"
      width={size}
    >
      <path d="M24 6.6 41 36" stroke="#4285F4" strokeLinecap="round" strokeWidth="11" />
      <path d="M24 6.6 7 36" stroke="#FBBC04" strokeLinecap="round" strokeWidth="11" />
      <circle cx="7" cy="36" fill="#34A853" r="6.5" />
    </svg>
  );
}
