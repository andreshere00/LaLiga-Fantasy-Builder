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
    <span
      className="market-availability has-hover-tooltip-panel market-availability-tooltip-target"
      tabIndex={0}
    >
      <img className="market-availability-icon" src={icon} alt="" aria-hidden="true" />
      <span className="market-availability-label">{label}</span>
      <span className="hover-tooltip-panel is-align-start" role="tooltip">
        {tooltip}
      </span>
    </span>
  );
}
