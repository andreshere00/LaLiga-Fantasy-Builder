import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getJson, paths } from "../../api/client";
import { ApiContractError } from "../../api/errors";
import { useCurrentWeekQuery, useWeekFixturesQuery } from "../../api/queries";
import type { FixturesDto, WeekWeatherDto } from "../../api/schemas";
import { useAuth } from "../../auth/AuthProvider";
import { useNow } from "../../hooks/useNow";
import { normalizeRound, retainWeatherForecasts, selectFixtureRound, validWeek } from "./fixturePanelModel";

const WEATHER_REFRESH_MS = 30 * 60_000;

/** Load competition matches without coupling their lifecycle to lineup editing. */
export function useFixturePanel() {
  const { accessToken } = useAuth();
  const enabled = accessToken != null;
  const now = useNow(30_000);
  const client = useQueryClient();
  const currentQuery = useCurrentWeekQuery(enabled);
  const current = currentQuery.data;
  const week = validWeek(current?.weekNumber);
  const fixtures = useWeekFixturesQuery(week, enabled && current != null);
  const round = normalizeRound(fixtures.data, now);
  const previousCandidate = validWeek(current?.previousWeek);
  const previousWeek = week != null && previousCandidate != null && previousCandidate < week ? previousCandidate : null;
  const priorCached = normalizeRound(client.getQueryData<FixturesDto>(["calendar", "fixtures", previousWeek]), now);
  const checkPrevious = week != null && previousWeek != null && previousWeek < week &&
    (round == null ? priorCached != null || fixtures.isError : !round.complete && !round.started && current?.isLive !== true);
  const previous = useWeekFixturesQuery(previousWeek, enabled && checkPrevious, !priorCached?.complete);
  const nextCandidate = validWeek(current?.nextWeek);
  const nextWeek = week != null && nextCandidate != null && nextCandidate > week ? nextCandidate : null;
  const fetchNext = week != null && nextWeek != null && nextWeek > week && round?.complete === true;
  const next = useWeekFixturesQuery(nextWeek, enabled && fetchNext);
  const rounds = new Map([
    [week ?? -1, round],
    [previousWeek ?? -2, normalizeRound(previous.data, now)],
    [nextWeek ?? -3, normalizeRound(next.data, now)],
  ]);
  const selection = selectFixtureRound(current, rounds);
  const shown = selection ? rounds.get(selection.week) : undefined;
  const selectedQuery = selection?.week === previousWeek ? previous : selection?.week === nextWeek ? next : fixtures;
  const weatherWeek = selection?.week ?? null;
  const signature = shown?.signature ?? "";
  const weatherKey = ["calendar", "weather", weatherWeek, signature] as const;
  const weatherEligible = weatherWeek != null && shown?.matches.some((match) =>
    match.status === "scheduled" && match.kickoffMs != null && match.kickoffMs > now) === true;
  const weather = useQuery({
    queryKey: weatherKey,
    enabled: enabled && weatherEligible,
    staleTime: WEATHER_REFRESH_MS,
    gcTime: WEATHER_REFRESH_MS,
    refetchInterval: WEATHER_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async ({ signal }) => {
      if (weatherWeek == null) throw new Error("No fixture selected");
      const incoming = await getJson(paths.weekWeather(weatherWeek), accessToken ?? "", { signal });
      if (incoming.weekNumber !== weatherWeek) throw new ApiContractError();
      return retainWeatherForecasts(client.getQueryData<WeekWeatherDto>(weatherKey), incoming);
    },
  });

  const pendingNext = selection?.mode === "finished" && selection.week !== 38;
  const handoff = selection?.nextWeek === week ? fixtures : next;
  const nextUnavailable = pendingNext && (selection?.nextWeek == null || handoff.isError ||
    (handoff.isSuccess && handoff.data.length === 0));
  const error = currentQuery.error ?? (currentQuery.isSuccess && week == null ? new ApiContractError() : selectedQuery.error) ??
    (selection?.week !== week && !pendingNext ? fixtures.error : null);
  return {
    selection, round: shown, now, weather,
    loading: !error && (currentQuery.isPending || selection?.mode === "loading"),
    error, stale: error != null && shown != null && shown.matches.length > 0,
    fetching: currentQuery.isFetching || selectedQuery.isFetching || (pendingNext && handoff.isFetching),
    updatedAt: selectedQuery.dataUpdatedAt,
    pendingNext, nextUnavailable,
    refresh: async () => {
      await Promise.allSettled([
        currentQuery.refetch(),
        ...(week != null ? [fixtures.refetch()] : []),
        ...(checkPrevious ? [previous.refetch()] : []),
        ...(fetchNext ? [next.refetch()] : []),
        ...(weatherEligible ? [weather.refetch()] : []),
      ]);
    },
  };
}
