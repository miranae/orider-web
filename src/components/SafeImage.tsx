import { useState, type ImgHTMLAttributes } from "react";
import { reportProfileAvatarLoadError, useProfileAvatarDisplayUrl } from "../hooks/useProfileAvatarDisplayUrl";

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
  const displayUrl = useProfileAvatarDisplayUrl(src);
  const [failed, setFailed] = useState<string>();
  if (!displayUrl || displayUrl === failed) {
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
  return (
    <img
      {...props}
      src={displayUrl}
      alt={alt}
      className={className}
      onError={() => {
        reportProfileAvatarLoadError(src);
        setFailed(displayUrl);
      }}
    />
  );
}
