import { ProfilePhoto } from "./ProfilePhoto";
import { PersonIcon } from "./icons";
import "./ManagerIdentity.css";

/** Groups a manager's photo and readable name in ownership cells. */
export function ManagerIdentity({ name, avatarUrl }: {
  name: string;
  avatarUrl?: string | null;
}) {
  return (
    <span className="manager-identity">
      <span className="manager-identity-avatar" aria-hidden="true">
        <ProfilePhoto url={avatarUrl ?? null} fallback={<PersonIcon />} />
      </span>
      <span className="manager-identity-name">{name}</span>
    </span>
  );
}
