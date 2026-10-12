import { Help } from "../../../components/ui/Help";
import availableIcon from "../../../assets/button_available.svg";
import notAvailableIcon from "../../../assets/button_not_available.svg";
import questionableIcon from "../../../assets/button_questionable.svg";
import { AVAILABILITY_TOOLTIPS, type Availability } from "../model/availability";

const META: Record<Availability, { label: string; icon: string }> = {
  available: { label: "Available", icon: availableIcon },
  questionable: { label: "Questionable", icon: questionableIcon },
  unavailable: { label: "Not available", icon: notAvailableIcon },
};

export function AvailabilityCell({ availability }: { availability: Availability }) {
  const { label, icon } = META[availability];
  const tooltip = AVAILABILITY_TOOLTIPS[availability];

  return (
    <Help className="market-availability" content={tooltip}>
      <img className="market-availability-icon" src={icon} alt="" aria-hidden="true" />
      <span className="market-availability-label">{label}</span>
    </Help>
  );
}
