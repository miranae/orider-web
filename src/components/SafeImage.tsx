import { useState, type ImgHTMLAttributes } from "react";

interface SafeImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  fallbackClassName?: string;
  fallbackLabel?: string;
}

export default function SafeImage({
  src,
  alt,
  className,
  fallbackClassName,
  fallbackLabel,
  ...props
}: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        aria-label={alt || fallbackLabel}
        className={fallbackClassName ?? className}
        role={alt ? "img" : undefined}
        style={{
          display: "grid",
          placeItems: "center",
          background: "var(--bg-3)",
          color: "var(--ink-4)",
          ...(props.style ?? {}),
        }}
      >
        {fallbackLabel ? fallbackLabel.slice(0, 1).toUpperCase() : null}
      </div>
    );
  }
  return <img {...props} src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}
