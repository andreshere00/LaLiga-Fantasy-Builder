import { Avatar } from "@base-ui/react/avatar";
import type { ReactNode } from "react";

import "./ProfilePhoto.css";

type ProfilePhotoProps = {
  url: string | null;
  className?: string;
  fallback: ReactNode;
};

export function ProfilePhoto({ url, className, fallback }: ProfilePhotoProps) {
  return (
    <Avatar.Root className={`fb-avatar ${className ?? ""}`}>
      {url ? <Avatar.Image className="fb-avatar-image" src={url} alt="" loading="lazy"
        decoding="async" referrerPolicy="no-referrer" /> : null}
      <Avatar.Fallback className="fb-avatar-fallback">{fallback}</Avatar.Fallback>
    </Avatar.Root>
  );
}
