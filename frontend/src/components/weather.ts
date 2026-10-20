import type { WeatherCondition } from "../features/players/playerDetailWidgets";

const icons = import.meta.glob<string>("../assets/weather/icon_weather_*_gray.svg", {
  eager: true, query: "?url", import: "default",
});

export const WEATHER_CONDITIONS: Record<WeatherCondition, string> = {
  clear: "Clear", few_clouds: "Few clouds", scattered_clouds: "Scattered clouds",
  broken_clouds: "Broken clouds", overcast: "Overcast", drizzle: "Drizzle", rain: "Rain",
  shower_rain: "Showers", thunderstorm: "Thunderstorm", snow: "Snow", mist: "Mist",
};

/** Reuse the product's neutral weather artwork in compact and expanded views. */
export function weatherIcon(condition: WeatherCondition | null): string {
  return condition ? icons[`../assets/weather/icon_weather_${condition}_gray.svg`] ?? "" : "";
}

export function weatherReason(value: unknown): string {
  switch (value) {
    case "beyond_forecast_horizon": return "Outside the forecast window";
    case "venue_unknown": return "Stadium weather unavailable";
    case "kickoff_unknown": return "Kickoff time not confirmed";
    case "disabled": return "Weather forecast disabled";
    case "provider_unavailable": return "Forecast unavailable";
    case "match_started": return "Kickoff forecast unavailable";
    case "status_unknown": return "Forecast awaiting match status";
    default: return "Weather unavailable";
  }
}
