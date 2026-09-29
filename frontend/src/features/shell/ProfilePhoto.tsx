import { useEffect, useState, type ReactNode } from "react";

type ProfilePhotoProps = {
  url: string | null;
  className?: string;
  fallback: ReactNode;
};

export function ProfilePhoto({ url, className, fallback }: ProfilePhotoProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (!url || failed) return fallback;
  return (
    <img
      className={className}
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
