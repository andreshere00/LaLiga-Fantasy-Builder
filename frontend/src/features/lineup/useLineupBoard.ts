import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getJson, paths, putJson } from "../../api/client";
import { ApiError, NeedsReauthError } from "../../api/errors";
import {
  asCurrentWeek,
  asStanding,
  avatarsByTeamId,
  callerTeamId,
  catalogMediaByMasterId,
  captainFromLineup,
  clampWeek,
  defaultWeek,
  enrichSquadMapFromLineup,
  weekPointsByMasterId,
  formatTeamValue,
  formationLabel,
  freeFormationCodesFromLineup,
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
import {
  DEFAULT_FREE_FORMATION_CODES,
  codeFromTactical,
  formationSelectOptions,
} from "./formations";
import {
  applyFormationCode,
  applyPitchPick,
  draftFromGroups,
  groupsForPitchDisplay,
  groupsFromDraft,
  isDraftComplete,
  lineupWriteBody,
  squadPickerPool,
  type LineupDraft,
  type PitchSelection,
} from "./lineupDraft";
import { lineupLoadMessage } from "./lineupMessages";
import { useLeague } from "./LeagueProvider";
import { squadPageSlice } from "./squadPanel";

export type LineupBoard = {
  titleName: string | null;
  ranking: RankingEntry[];
  selectedTeamId: string | null;
  selectTeam: (teamId: string) => void;
  week: number;
  maxWeek: number;
  goToWeek: (week: number) => void;
  scorePoints: number | null;
  weekLoading: boolean;
  formation: string;
  teamValueLabel: string;
  groups: LineupGroup[];
  captainId: string | null;
  squad: SquadCard[];
  squadPicker: SquadCard[];
  squadPanelPlayers: SquadCard[];
  squadPage: number;
  squadPageCount: number;
  squadPagePrev: () => void;
  squadPageNext: () => void;
  squadSearch: string;
  setSquadSearch: (value: string) => void;
  pitchEmpty: boolean;
  isLoading: boolean;
  squadLoading: boolean;
  lineupLoading: boolean;
  errorMessage: string | null;
  squadMessage: string | null;
  lineupMessage: string | null;
  emptyLeague: boolean;
  editable: boolean;
  formationCode: string | null;
  formationOptions: { value: string; label: string }[];
  setFormationCode: (code: string) => void;
  pitchSelection: PitchSelection | null;
  selectPitchPlayer: (role: PitchSelection["role"], playerId: string) => void;
  pickSquadPlayer: (playerId: string) => void;
  saveLineup: () => void;
  saveDisabled: boolean;
  savePending: boolean;
  saveMessage: string | null;
  isPastFixture: boolean;
  pastFixtureNoticeOpen: boolean;
  dismissPastFixtureNotice: () => void;
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
  const queryClient = useQueryClient();
  const { accessToken, managerName, managerAvatar, markNeedsReauth } = useAuth();
  const { selected, isLoading: leaguesLoading, error: leaguesError } = useLeague();
  const leagueKey = selected ? leagueId(selected) : "";
  const callerId = selected ? callerTeamId(selected) : null;
  const [pickedTeamId, setPickedTeamId] = useState<string | null>(null);
  const [requestedWeek, setRequestedWeek] = useState<number | null>(null);
  const [draft, setDraft] = useState<LineupDraft | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const draftDirtyRef = useRef(false);
  const draftSourceRef = useRef("");
  draftDirtyRef.current = draftDirty;
  const [pitchSelection, setPitchSelection] = useState<PitchSelection | null>(null);
  const [pastFixtureNoticeOpen, setPastFixtureNoticeOpen] = useState(false);
  const [squadSearch, setSquadSearch] = useState("");
  const [squadPage, setSquadPage] = useState(0);
  const previousLeagueKeyRef = useRef(leagueKey);
  if (previousLeagueKeyRef.current !== leagueKey) {
    previousLeagueKeyRef.current = leagueKey;
    setPickedTeamId(null);
    setRequestedWeek(null);
    setPitchSelection(null);
    setPastFixtureNoticeOpen(false);
    setSquadSearch("");
  }

  const enabled = leagueKey.length > 0 && accessToken != null;
  const token = accessToken ?? "";

  const currentQuery = useQuery({
    queryKey: ["calendar", "current"],
    enabled: accessToken != null,
    queryFn: ({ signal }) => getJson(paths.currentWeek(), token, { signal }),
  });

  const catalogQuery = useQuery({
    queryKey: ["players", "catalog"],
    enabled: accessToken != null,
    staleTime: 60 * 60 * 1000,
    queryFn: ({ signal }) => getJson(paths.playersCatalog(), token, { signal }),
  });

  const standingQuery = useQuery({
    queryKey: ["standing", leagueKey],
    enabled,
    queryFn: ({ signal }) => getJson(paths.standing(leagueKey), token, { signal }),
  });

  const teamsQuery = useQuery({
    queryKey: ["league-teams", leagueKey],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: ({ signal }) => getJson(paths.leagueTeams(leagueKey), token, { signal }),
  });

  const current = asCurrentWeek(currentQuery.data);
  const upper = maxWeek(current);
  const nextWeek = upper;
  const week = clampWeek(requestedWeek ?? defaultWeek(current), upper);
  const weekReady = currentQuery.isSuccess || currentQuery.isError;
  const lineupUsesCurrent = week === nextWeek;

  const weekQuery = useQuery({
    queryKey: ["standing", leagueKey, week],
    enabled: enabled && weekReady,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => getJson(paths.weekStanding(leagueKey, week), token, { signal }),
  });

  const activeTeamId = pickedTeamId ?? callerId;

  const teamQuery = useQuery({
    queryKey: ["team", leagueKey, activeTeamId],
    enabled: enabled && activeTeamId != null,
    queryFn: ({ signal }) =>
      getJson(paths.team(leagueKey, activeTeamId ?? ""), token, { signal }),
  });

  const weekStatsQuery = useQuery({
    queryKey: ["calendar", "stats", week],
    enabled: accessToken != null && weekReady && !lineupUsesCurrent,
    staleTime: 5 * 60 * 1000,
    queryFn: ({ signal }) => getJson(paths.weekStats(week), token, { signal }),
  });

  const lineupQuery = useQuery({
    queryKey: [
      "lineup",
      leagueKey,
      activeTeamId,
      week,
      lineupUsesCurrent ? "current" : "week",
    ],
    enabled: enabled && activeTeamId != null && weekReady,
    queryFn: ({ signal }) =>
      lineupUsesCurrent
        ? getJson(paths.lineup(activeTeamId ?? ""), token, { signal })
        : getJson(paths.lineupWeek(activeTeamId ?? "", week), token, { signal }),
  });

  const lineupPending = lineupQuery.isPending;
  const catalogByMasterId = useMemo(
    () => catalogMediaByMasterId(catalogQuery.data),
    [catalogQuery.data],
  );
  const pointsByMasterId = useMemo(
    () => weekPointsByMasterId(weekStatsQuery.data),
    [weekStatsQuery.data],
  );
  const scoreLookup = useMemo(
    () =>
      lineupUsesCurrent
        ? undefined
        : { week, pointsByMasterId },
    [lineupUsesCurrent, week, pointsByMasterId],
  );

  const lineupPayload =
    !lineupPending && lineupQuery.isSuccess ? lineupQuery.data : null;
  const serverGroups =
    lineupPayload == null
      ? []
      : groupsFromLineup(lineupPayload, catalogByMasterId, scoreLookup);
  const serverTactical = lineupPayload == null ? null : tacticalOf(lineupPayload);
  const captainId =
    lineupPayload == null ? null : captainFromLineup(lineupPayload);
  useEffect(() => {
    if (lineupPending || activeTeamId == null || lineupQuery.data == null) {
      return;
    }
    const groups = groupsFromLineup(lineupQuery.data, catalogByMasterId, scoreLookup);
    const tactical = tacticalOf(lineupQuery.data);
    const sourceKey = `${activeTeamId}:${week}`;
    if (sourceKey !== draftSourceRef.current) {
      draftSourceRef.current = sourceKey;
      setDraft(draftFromGroups(groups, tactical));
      setDraftDirty(false);
      setPitchSelection(null);
      setSquadSearch("");
      return;
    }
    if (!draftDirtyRef.current) {
      setDraft(draftFromGroups(groups, tactical));
    }
  }, [
    lineupPending,
    lineupQuery.data,
    activeTeamId,
    week,
    catalogByMasterId,
    scoreLookup,
  ]);

  const needsReauth = [
    leaguesError,
    currentQuery.error,
    standingQuery.error,
    teamsQuery.error,
    weekQuery.error,
    teamQuery.error,
    lineupQuery.error,
    weekStatsQuery.error,
  ].some((error) => error instanceof NeedsReauthError);

  useEffect(() => {
    if (needsReauth) markNeedsReauth();
  }, [needsReauth, markNeedsReauth]);

  const avatarByTeamId = useMemo(() => {
    const map = avatarsByTeamId(teamsQuery.data);
    const fallback =
      managerAvatar?.trim() ||
      selected?.team?.manager?.avatar?.trim() ||
      selected?.team?.manager?.profileImage?.trim() ||
      null;
    if (callerId && fallback && !map.has(callerId)) map.set(callerId, fallback);
    return map;
  }, [callerId, managerAvatar, selected, teamsQuery.data]);
  const ranking = mapRanking(asStanding(standingQuery.data), avatarByTeamId);
  const weekRows = asStanding(weekQuery.data);
  const row = ranking.find((item) => item.teamId === activeTeamId);
  const isCaller = activeTeamId != null && activeTeamId === callerId;
  const editable = isCaller && lineupUsesCurrent;

  const squad = squadCards(
    playersOf(teamQuery.data),
    captainId,
    catalogByMasterId,
    scoreLookup,
  );
  const squadById = useMemo(
    () => new Map(squad.map((player) => [player.id, player])),
    [squad],
  );

  const pitchSquadById = useMemo(() => {
    if (lineupPayload == null) return squadById;
    return enrichSquadMapFromLineup(
      squadById,
      lineupPayload,
      catalogByMasterId,
      scoreLookup,
    );
  }, [lineupPayload, squadById, catalogByMasterId, scoreLookup]);

  const tacticalForDisplay =
    draft && editable ? draft.tactical : serverTactical;
  const groups = useMemo(() => {
    const rawGroups =
      draft && editable ? groupsFromDraft(draft, pitchSquadById) : serverGroups;
    return groupsForPitchDisplay(rawGroups, tacticalForDisplay, pitchSquadById);
  }, [draft, editable, pitchSquadById, serverGroups, tacticalForDisplay]);

  const formationCode =
    draft && editable
      ? codeFromTactical(draft.tactical)
      : codeFromTactical(serverTactical);

  const freeFormationCodes = useMemo(() => {
    if (lineupPayload == null) return DEFAULT_FREE_FORMATION_CODES;
    return freeFormationCodesFromLineup(lineupPayload) ?? DEFAULT_FREE_FORMATION_CODES;
  }, [lineupPayload]);

  const formationOptions = useMemo(
    () => formationSelectOptions(freeFormationCodes),
    [freeFormationCodes],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft || !activeTeamId || !isDraftComplete(draft)) {
        throw new ApiError(400, "incomplete_lineup");
      }
      return putJson(
        paths.lineup(activeTeamId),
        token,
        lineupWriteBody(draft, captainId),
      );
    },
    onSuccess: async () => {
      setDraftDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["lineup", activeTeamId] });
      setPitchSelection(null);
      setSquadSearch("");
    },
  });

  useEffect(() => {
    if (saveMutation.error instanceof NeedsReauthError) markNeedsReauth();
  }, [saveMutation.error, markNeedsReauth]);

  const weekLoadError =
    weekQuery.error && weekQuery.data === undefined ? weekQuery.error : null;

  const pickerRole = pitchSelection?.role ?? null;
  const squadPicker =
    editable && draft && pickerRole != null
      ? squadPickerPool(squad, draft, pickerRole, squadSearch)
      : [];

  const squadListForPanel = pitchSelection != null ? squadPicker : squad;
  const squadPageData = squadPageSlice(squadListForPanel, squadPage);

  useEffect(() => {
    setSquadPage(0);
  }, [activeTeamId, pickerRole, squadSearch, pitchSelection]);

  useEffect(() => {
    if (squadPage > squadPageData.pageCount - 1) {
      setSquadPage(Math.max(0, squadPageData.pageCount - 1));
    }
  }, [squadPage, squadPageData.pageCount]);

  const saveMessage =
    saveMutation.error && !(saveMutation.error instanceof NeedsReauthError)
      ? "Lineup could not be saved."
      : null;
  const dismissPastFixtureNotice = useCallback(() => {
    setPastFixtureNoticeOpen(false);
  }, []);

  return {
    titleName: displayName(row, isCaller, managerName),
    ranking,
    selectedTeamId: activeTeamId,
    selectTeam: (teamId: string) => {
      if (ranking.some((item) => item.teamId === teamId && item.selectable)) {
        setPickedTeamId(teamId);
        setPitchSelection(null);
        setPastFixtureNoticeOpen(false);
        setSquadSearch("");
      }
    },
    week,
    maxWeek: upper,
    goToWeek: (next) => {
      setRequestedWeek(clampWeek(next, upper));
      setPitchSelection(null);
      setPastFixtureNoticeOpen(false);
      setSquadSearch("");
    },
    scorePoints: activeTeamId ? weekPointsForTeam(weekRows, activeTeamId) : null,
    weekLoading: weekQuery.isLoading,
    formation:
      draft && editable
        ? formationLabel(draft.tactical)
        : formationLabel(serverTactical),
    teamValueLabel: formatTeamValue(
      selectedTeamValue(ranking, activeTeamId, callerId, selected?.team?.teamValue),
    ),
    groups,
    captainId,
    squad,
    squadPicker,
    squadPanelPlayers: squadPageData.pageItems,
    squadPage: squadPageData.page + 1,
    squadPageCount: squadPageData.pageCount,
    squadPagePrev: () => setSquadPage((current) => Math.max(0, current - 1)),
    squadPageNext: () =>
      setSquadPage((current) => {
        const { pageCount } = squadPageSlice(squadListForPanel, current);
        return Math.min(pageCount - 1, current + 1);
      }),
    squadSearch,
    setSquadSearch,
    pitchEmpty: lineupPayload != null && !hasPlayers(groups),
    isLoading: leaguesLoading || standingQuery.isLoading || currentQuery.isLoading,
    squadLoading: teamQuery.isPending,
    lineupLoading: lineupPending,
    errorMessage: failureMessage(
      leaguesError ?? standingQuery.error ?? currentQuery.error ?? weekLoadError,
    ),
    squadMessage:
      teamQuery.error && !(teamQuery.error instanceof NeedsReauthError)
        ? "This squad could not be loaded."
        : null,
    lineupMessage:
      !lineupPending && lineupQuery.error
        ? lineupLoadMessage(lineupQuery.error)
        : null,
    emptyLeague: !leaguesLoading && !leaguesError && selected == null,
    editable,
    formationCode,
    formationOptions,
    setFormationCode: (code: string) => {
      if (!draft || !editable) return;
      setDraftDirty(true);
      setDraft(applyFormationCode(draft, squad, code));
    },
    pitchSelection,
    selectPitchPlayer: (role, playerId) => {
      if (!lineupUsesCurrent) {
        setPastFixtureNoticeOpen(true);
        return;
      }
      if (!editable) return;
      if (
        pitchSelection?.role === role &&
        pitchSelection.playerId === playerId
      ) {
        setPitchSelection(null);
        return;
      }
      setPitchSelection({ role, playerId });
      setSquadSearch("");
    },
    pickSquadPlayer: (playerId: string) => {
      if (!draft || !editable || !pitchSelection) return;
      setDraftDirty(true);
      setDraft(applyPitchPick(draft, pitchSelection, playerId, squad));
      setPitchSelection(null);
    },
    saveLineup: () => saveMutation.mutate(),
    saveDisabled:
      !editable ||
      !draft ||
      !draftDirty ||
      !isDraftComplete(draft) ||
      saveMutation.isPending,
    savePending: saveMutation.isPending,
    saveMessage,
    isPastFixture: !lineupUsesCurrent,
    pastFixtureNoticeOpen,
    dismissPastFixtureNotice,
  };
}
