import formGoodLight from "../../assets/icon_good_form_light.svg";
import formGoodDark from "../../assets/icon_good_form_dark.svg";
import formMidLight from "../../assets/icon_mid_form_light.svg";
import formMidDark from "../../assets/icon_mid_form_dark.svg";
import formPoorLight from "../../assets/icon_poor_form_light.svg";
import formPoorDark from "../../assets/icon_poor_form_dark.svg";
import formVeryGoodLight from "../../assets/icon_very_good_form_light.svg";
import formVeryGoodDark from "../../assets/icon_very_good_form_dark.svg";

const FORM_RATINGS: Record<string, { label: string; code: string }> = {
  very_bad: { label: "Very poor", code: "bad" },
  poor: { label: "Poor", code: "bad" },
  average: { label: "Average", code: "mid" },
  bad: { label: "Poor", code: "bad" },
  malo: { label: "Poor", code: "bad" },
  mid: { label: "Average", code: "mid" },
  regular: { label: "Average", code: "mid" },
  good: { label: "Good", code: "good" },
  bueno: { label: "Good", code: "good" },
  very_good: { label: "Very good", code: "very_good" },
  muy_bueno: { label: "Very good", code: "very_good" },
};

const FORM_ICONS: Record<string, { light: string; dark: string }> = {
  bad: { light: formPoorLight, dark: formPoorDark },
  mid: { light: formMidLight, dark: formMidDark },
  good: { light: formGoodLight, dark: formGoodDark },
  very_good: { light: formVeryGoodLight, dark: formVeryGoodDark },
};

/** Resolves the published form rating without inferring it from Fantasy points. */
export function playerFormPresentation(value: unknown) {
  if (typeof value !== "string") return null;
  const key = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLocaleLowerCase("en").replace(/[\s-]+/g, "_");
  const rating = Object.hasOwn(FORM_RATINGS, key) ? FORM_RATINGS[key] : null;
  return rating ? { ...rating, icons: FORM_ICONS[rating.code] } : null;
}
