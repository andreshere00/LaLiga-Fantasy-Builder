import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getJson, paths } from "../../api/client";
import { ApiError, NeedsReauthError } from "../../api/errors";
import {
  asCurrentWeek,
  asStanding,
  callerTeamId,
  captainFromLineup,
  clampWeek,
  defaultWeek,
  formatTeamValue,
  formationLabel,
  groupsFromLineup,
  hasPlayers,
  leagueId,
  mapRanking,
  maxWeek,
  playersOf,
  selectedTeamValue,
  squadCards,
  tacticalOf,
  weekPointsForTeam,
  type LineupGroup,
  type RankingEntry,
  type SquadCard,
} from "../../api/mappers";
import { useAuth } from "../../auth/AuthProvider";
import { useLeague } from "./LeagueProvider";

export type LineupBoard = {
  titleName: string | null;
  ranking: RankingEntry[];
  selectedTeamId: string | null;
  selectTeam: (teamId: string) => void;
  week: number;
  maxWeek: number;
  goToWeek: (week: number) => void;
  scorePoints: number | null;
  formation: string;
  teamValueLabel: string;
  groups: LineupGroup[];
  captainId: string | null;
  squad: SquadCard[];
  pitchEmpty: boolean;
  isLoading: boolean;
  squadLoading: boolean;
  lineupLoading: boolean;
  errorMessage: string | null;
  squadMessage: string | null;
  emptyLeague: boolean;
};

function failureMessage(error: unknown): string | null {
  if (!error || error instanceof NeedsReauthError) return null;
  if (error instanceof ApiError && error.status === 401) {
    return "Your session expired. Log in again.";
  }
  return "League data could not be loaded.";
}

function displayName(
  row: RankingEntry | undefined,
  isCaller: boolean,
  managerName: string | null,
): string | null {
  if (row && row.name !== "Opponent") return row.name;
  if (isCaller && managerName) return managerName;
  return row?.name ?? managerName;
}

export function useLineupBoard(): LineupBoard {
  const { accessToken, managerName, markNeedsReauth } = useAuth();
  const { selected, isLoading: leaguesLoading, error: leaguesError } = useLeague();
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;
  const leagueKey = selected ? leagueId(selected) : "";
  const callerId = selected ? callerTeamId(selected) : null;
  const [pickedTeamId, setPickedTeamId] = useState<string | null>(null);
  const [requestedWeek, setRequestedWeek] = useState<number | null>(null);

  useEffect(() => {
    setPickedTeamId(null);
    setRequestedWeek(null);
  }, [leagueKey]);

  const enabled = leagueKey.length > 0 && accessToken != null;

  const currentQuery = useQuery({
    queryKey: ["calendar", "current"],
    enabled: accessToken != null,
    queryFn: () => getJson(paths.currentWeek(), tokenRef.current ?? ""),
  });

  const standingQuery = useQuery({
    queryKey: ["standing", leagueKey],
    enabled,
    queryFn: () => getJson(paths.standing(leagueKey), tokenRef.current ?? ""),
  });

  const current = asCurrentWeek(currentQuery.data);
  const upper = maxWeek(current);
  const week = clampWeek(requestedWeek ?? defaultWeek(current), upper);
  const weekReady = currentQuery.isSuccess || currentQuery.isError;

  const weekQuery = useQuery({
    queryKey: ["standing", leagueKey, week],
    enabled: enabled && weekReady,
    queryFn: () => getJson(paths.weekStanding(leagueKey, week), tokenRef.current ?? ""),
  });

  const activeTeamId = pickedTeamId ?? callerId;

  const teamQuery = useQuery({
    queryKey: ["team", leagueKey, activeTeamId],
    enabled: enabled && activeTeamId != null,
    queryFn: () => getJson(paths.team(leagueKey, activeTeamId ?? ""), tokenRef.current ?? ""),
  });

  const lineupQuery = useQuery({
    queryKey: ["lineup", activeTeamId],
    enabled: activeTeamId != null && accessToken != null,
    queryFn: async () => {
      try {
        return await getJson(paths.lineup(activeTeamId ?? ""), tokenRef.current ?? "");
      } catch (error) {
        if (error instanceof NeedsReauthError) throw error;
        return null;
      }
    },
  });

  const needsReauth = [
    leaguesError,
    currentQuery.error,
    standingQuery.error,
    weekQuery.error,
    teamQuery.error,
    lineupQuery.error,
  ].some((error) => error instanceof NeedsReauthError);

  useEffect(() => {
    if (needsReauth) markNeedsReauth();
  }, [needsReauth, markNeedsReauth]);

  const ranking = mapRanking(asStanding(standingQuery.data));
  const weekRows = asStanding(weekQuery.data);
  const groups = lineupQuery.data == null ? [] : groupsFromLineup(lineupQuery.data);
  const captainId = lineupQuery.data == null ? null : captainFromLineup(lineupQuery.data);
  const row = ranking.find((item) => item.teamId === activeTeamId);
  const isCaller = activeTeamId != null && activeTeamId === callerId;

  return {
    titleName: displayName(row, isCaller, managerName),
    ranking,
    selectedTeamId: activeTeamId,
    selectTeam: (teamId: string) => {
      if (ranking.some((item) => item.teamId === teamId && item.selectable)) {
        setPickedTeamId(teamId);
      }
    },
    week,
    maxWeek: upper,
    goToWeek: (next) => setRequestedWeek(clampWeek(next, upper)),
    scorePoints: activeTeamId ? weekPointsForTeam(weekRows, activeTeamId) : null,
    formation: formationLabel(tacticalOf(lineupQuery.data)),
    teamValueLabel: formatTeamValue(
      selectedTeamValue(ranking, activeTeamId, callerId, selected?.team?.teamValue),
    ),
    groups,
    captainId,
    squad: squadCards(playersOf(teamQuery.data), captainId),
    pitchEmpty: lineupQuery.isSuccess && !hasPlayers(groups),
    isLoading: leaguesLoading || standingQuery.isLoading || currentQuery.isLoading,
    squadLoading: teamQuery.isLoading,
    lineupLoading: lineupQuery.isLoading,
    errorMessage: failureMessage(leaguesError ?? standingQuery.error ?? currentQuery.error),
    squadMessage:
      teamQuery.error && !(teamQuery.error instanceof NeedsReauthError)
        ? "This squad could not be loaded."
        : null,
    emptyLeague: !leaguesLoading && !leaguesError && selected == null,
  };
}
