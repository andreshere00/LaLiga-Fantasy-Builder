import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { getJson, paths, putJson } from "../../api/client";
import { ApiError, NeedsReauthError } from "../../api/errors";
import {
  CATALOG_STALE_MS,
  useCurrentWeekQuery,
  usePlayersCatalogQuery,
  useReauthOnError,
} from "../../api/queries";
import {
  asCurrentWeek,
  asStanding,
  avatarsByTeamId,
  callerTeamId,
  teamIdsMissingAvatars,
  catalogMediaByMasterId,
  captainFromLineup,
  clampWeek,
  defaultWeek,
  enrichSquadMapFromLineup,
  formatTeamValue,
  formationLabel,
  freeFormationCodesFromLineup,
  groupsFromLineup,
  hasPlayers,
  leagueId,
  mapRanking,
  maxWeek,
  playersOf,
  teamIdOf,
  withCallerAvatar,
  selectedTeamValue,
  squadCards,
  tacticalOf,
  weekMvpMasterIds,
  weekPointsByMasterId,
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

type StoredDraft = {
  draft: LineupDraft;
  dirty: boolean;
};

type SaveLineupVariables = {
  leagueKey: string;
  teamId: string;
  week: number;
  body: Record<string, unknown>;
};

/** Identity of the lineup a draft belongs to. */
export function lineupSourceKey(leagueKey: string, teamId: string, week: number): string {
  return `${leagueKey}:${teamId}:${week}`;
}

export type UseLineupBoardOptions = {
  initialTeamId?: string | null;
};

export function useLineupBoard(options: UseLineupBoardOptions = {}): LineupBoard {
  const initialTeamId = options.initialTeamId?.trim() || null;
  const queryClient = useQueryClient();
  const { accessToken, managerName, managerAvatar, markNeedsReauth } = useAuth();
  const { selected, isLoading: leaguesLoading, error: leaguesError } = useLeague();
  const leagueKey = selected ? leagueId(selected) : "";
  const callerId = selected ? callerTeamId(selected) : null;
  const [pickedTeamId, setPickedTeamId] = useState<string | null>(null);
  const [requestedWeek, setRequestedWeek] = useState<number | null>(null);
  const draftsRef = useRef(new Map<string, StoredDraft>());
  const activeKeyRef = useRef("");
  const [activeDraft, setActiveDraft] = useState<StoredDraft | null>(null);
  const [pitchSelection, setPitchSelection] = useState<PitchSelection | null>(null);
  const [pastFixtureNoticeOpen, setPastFixtureNoticeOpen] = useState(false);
  const [squadSearch, setSquadSearch] = useState("");
  const [squadPage, setSquadPage] = useState(0);
  const previousLeagueKeyRef = useRef(leagueKey);
  const leagueChanged = previousLeagueKeyRef.current !== leagueKey;
  if (leagueChanged) {
    previousLeagueKeyRef.current = leagueKey;
    setPickedTeamId(null);
    setRequestedWeek(null);
    setPitchSelection(null);
    setPastFixtureNoticeOpen(false);
    setSquadSearch("");
  }

  const enabled = leagueKey.length > 0 && accessToken != null;
  const token = accessToken ?? "";

  const currentQuery = useCurrentWeekQuery(accessToken != null);
  const catalogQuery = usePlayersCatalogQuery(accessToken != null, CATALOG_STALE_MS);

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
  const week = clampWeek(
    leagueChanged ? defaultWeek(current) : (requestedWeek ?? defaultWeek(current)),
    upper,
  );
  const weekReady = currentQuery.isSuccess || currentQuery.isError;
  const lineupUsesCurrent = week === nextWeek;

  const weekQuery = useQuery({
    queryKey: ["standing", leagueKey, week],
    enabled: enabled && weekReady,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => getJson(paths.weekStanding(leagueKey, week), token, { signal }),
  });

  const standingTeamIds = useMemo(
    () => [
      ...new Set(
        asStanding(standingQuery.data)
          .map((row) => teamIdOf(row))
          .filter((id) => id.length > 0),
      ),
    ],
    [standingQuery.data],
  );

  const validInitialTeamId = useMemo(() => {
    if (!initialTeamId) return null;
    return standingTeamIds.includes(initialTeamId) ? initialTeamId : null;
  }, [initialTeamId, standingTeamIds]);

  const awaitingInitialTeam =
    initialTeamId != null && !standingQuery.isSuccess && !standingQuery.isError;
  const activeTeamId =
    pickedTeamId ?? validInitialTeamId ?? (awaitingInitialTeam ? null : callerId);
  const activeKey =
    leagueKey.length > 0 && activeTeamId != null
      ? lineupSourceKey(leagueKey, activeTeamId, week)
      : "";
  if (activeKeyRef.current !== activeKey) {
    activeKeyRef.current = activeKey;
    setActiveDraft(draftsRef.current.get(activeKey) ?? null);
    setPitchSelection(null);
    setPastFixtureNoticeOpen(false);
    setSquadSearch("");
  }

  const teamQuery = useQuery({
    queryKey: ["team", leagueKey, activeTeamId],
    enabled: enabled && activeTeamId != null,
    queryFn: ({ signal }) =>
      getJson(paths.team(leagueKey, activeTeamId ?? ""), token, { signal }),
  });

  const knownAvatars = useMemo(() => {
    const map = avatarsByTeamId(teamsQuery.data);
    for (const [key, url] of avatarsByTeamId(teamQuery.data)) {
      if (!map.has(key)) map.set(key, url);
    }
    return map;
  }, [teamQuery.data, teamsQuery.data]);
  const teamsMissingAvatars = useMemo(() => {
    if (!teamsQuery.isSuccess && !teamsQuery.isError) return [];
    return teamIdsMissingAvatars(standingTeamIds, knownAvatars).filter(
      (teamId) => teamId !== activeTeamId,
    );
  }, [
    activeTeamId,
    knownAvatars,
    standingTeamIds,
    teamsQuery.isError,
    teamsQuery.isSuccess,
  ]);
  const peerTeamQueries = useQueries({
    queries: teamsMissingAvatars.map((teamId) => ({
      queryKey: ["team", leagueKey, teamId],
      enabled: enabled && teamId.length > 0,
      staleTime: 5 * 60 * 1000,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.team(leagueKey, teamId), token, { signal }),
    })),
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
  const mvpByMasterId = useMemo(
    () => weekMvpMasterIds(weekStatsQuery.data),
    [weekStatsQuery.data],
  );
  const scoreLookup = useMemo(
    () =>
      lineupUsesCurrent
        ? undefined
        : { week, pointsByMasterId, mvpByMasterId },
    [lineupUsesCurrent, week, pointsByMasterId, mvpByMasterId],
  );

  const lineupPayload =
    !lineupPending && lineupQuery.isSuccess ? lineupQuery.data : null;
  const serverGroups = useMemo(
    () =>
      lineupPayload == null
        ? []
        : groupsFromLineup(lineupPayload, catalogByMasterId, scoreLookup),
    [lineupPayload, catalogByMasterId, scoreLookup],
  );
  const serverTactical = lineupPayload == null ? null : tacticalOf(lineupPayload);
  const captainId =
    lineupPayload == null ? null : captainFromLineup(lineupPayload);
  useEffect(() => {
    if (lineupPending || activeTeamId == null || lineupQuery.data == null) return;
    if (leagueKey.length === 0) return;
    const sourceKey = lineupSourceKey(leagueKey, activeTeamId, week);
    if (draftsRef.current.get(sourceKey)?.dirty) return;
    const nextDraft = draftFromGroups(
      groupsFromLineup(lineupQuery.data, catalogByMasterId, scoreLookup),
      tacticalOf(lineupQuery.data),
    );
    if (!nextDraft) return;
    const stored: StoredDraft = { draft: nextDraft, dirty: false };
    draftsRef.current.set(sourceKey, stored);
    if (activeKeyRef.current === sourceKey) setActiveDraft(stored);
  }, [
    lineupPending,
    lineupQuery.data,
    activeTeamId,
    week,
    leagueKey,
    catalogByMasterId,
    scoreLookup,
  ]);

  useReauthOnError([
    leaguesError,
    currentQuery.error,
    standingQuery.error,
    teamsQuery.error,
    weekQuery.error,
    teamQuery.error,
    ...peerTeamQueries.map((query) => query.error),
    lineupQuery.error,
    weekStatsQuery.error,
  ]);

  const avatarByTeamId = useMemo(() => {
    const map = new Map(knownAvatars);
    for (const query of peerTeamQueries) {
      for (const [key, url] of avatarsByTeamId(query.data)) {
        if (!map.has(key)) map.set(key, url);
      }
    }
    const fallback =
      managerAvatar?.trim() ||
      selected?.team?.manager?.avatar?.trim() ||
      selected?.team?.manager?.profileImage?.trim() ||
      null;
    if (fallback && callerId) map.set(callerId, fallback);
    return map;
  }, [
    callerId,
    managerAvatar,
    knownAvatars,
    peerTeamQueries,
    selected,
  ]);
  const ranking = withCallerAvatar(
    mapRanking(asStanding(standingQuery.data), avatarByTeamId),
    {
      teamId: callerId,
      name: managerName,
      avatar:
        managerAvatar?.trim() ||
        selected?.team?.manager?.avatar?.trim() ||
        selected?.team?.manager?.profileImage?.trim() ||
        null,
    },
  );
  const weekRows = asStanding(weekQuery.data);
  const row = ranking.find((item) => item.teamId === activeTeamId);
  const isCaller = activeTeamId != null && activeTeamId === callerId;
  const editable = isCaller && lineupUsesCurrent;
  const draft = activeDraft?.draft ?? null;
  const draftDirty = activeDraft?.dirty ?? false;

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
    () => formationSelectOptions(freeFormationCodes, formationCode),
    [formationCode, freeFormationCodes],
  );

  const saveMutation = useMutation({
    mutationFn: async (variables: SaveLineupVariables) =>
      putJson(paths.lineup(variables.teamId), token, variables.body),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["lineup", variables.leagueKey, variables.teamId],
      });
      const sourceKey = lineupSourceKey(
        variables.leagueKey,
        variables.teamId,
        variables.week,
      );
      const current = draftsRef.current.get(sourceKey);
      if (current) {
        const clean: StoredDraft = { draft: current.draft, dirty: false };
        draftsRef.current.set(sourceKey, clean);
        if (activeKeyRef.current === sourceKey) setActiveDraft(clean);
      }
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
      if (!draft || !editable || activeTeamId == null || leagueKey.length === 0) return;
      const sourceKey = lineupSourceKey(leagueKey, activeTeamId, week);
      if (activeKeyRef.current !== sourceKey) return;
      const stored: StoredDraft = {
        draft: applyFormationCode(draft, squad, code),
        dirty: true,
      };
      draftsRef.current.set(sourceKey, stored);
      setActiveDraft(stored);
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
      if (activeTeamId == null || leagueKey.length === 0) return;
      const sourceKey = lineupSourceKey(leagueKey, activeTeamId, week);
      if (activeKeyRef.current !== sourceKey) return;
      const stored: StoredDraft = {
        draft: applyPitchPick(draft, pitchSelection, playerId, squad),
        dirty: true,
      };
      draftsRef.current.set(sourceKey, stored);
      setActiveDraft(stored);
      setPitchSelection(null);
    },
    saveLineup: () => {
      if (!draft || !draftDirty || !activeTeamId || leagueKey.length === 0) return;
      if (!isDraftComplete(draft)) return;
      const sourceKey = lineupSourceKey(leagueKey, activeTeamId, week);
      if (activeKeyRef.current !== sourceKey) return;
      saveMutation.mutate({
        leagueKey,
        teamId: activeTeamId,
        week,
        body: lineupWriteBody(draft, captainId),
      });
    },
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
