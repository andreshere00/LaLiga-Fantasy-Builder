import availableIcon from "../../../assets/button_available.svg";
import notAvailableIcon from "../../../assets/button_not_available.svg";
import questionableIcon from "../../../assets/button_questionable.svg";
import type { Availability } from "../model/availability";

const META: Record<Availability, { label: string; icon: string }> = {
  available: { label: "Available", icon: availableIcon },
  questionable: { label: "Questionable", icon: questionableIcon },
  unavailable: { label: "Not available", icon: notAvailableIcon },
};

export function AvailabilityCell({ availability }: { availability: Availability }) {
  const { label, icon } = META[availability];
  return (
    <span className={`market-availability is-${availability}`}>
      <img className="market-availability-icon" src={icon} alt="" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
