import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthProvider";
import { getJson, paths } from "../../../api/client";
import { ApiError } from "../../../api/errors";
import type { RadarProfileId } from "../../../api/radar";

const RADAR_SEASON = "2026-27";
const searchText = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("en");


export function usePlayerRadar(playerId: string) {
  const { accessToken, user } = useAuth();
  const section = useRef<HTMLElement>(null);
  const comparisonSummary = useRef<HTMLElement>(null);
  const [active, setActive] = useState(() => typeof IntersectionObserver === "undefined");
  const [profile, setProfile] = useState<RadarProfileId | undefined>();
  const [comparison, setComparison] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (active || !section.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setActive(true);
        observer.disconnect();
      }
    }, { rootMargin: "200px 0px" });
    observer.observe(section.current);
    return () => observer.disconnect();
  }, [active]);
  const query = useQuery({
    queryKey: ["players", "radar", user?.userId, playerId, RADAR_SEASON],
    enabled: active && !!accessToken && !!user,
    staleTime: 15 * 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
    queryFn: ({ signal }) => getJson(paths.playerRadar(playerId, RADAR_SEASON), accessToken ?? "", { signal }),
  });
  const radars = query.data?.radars ?? [];
  const selected = radars.find((r) => r.profile === profile) ??
    radars.find((r) => r.profile === query.data?.defaultProfile) ?? radars[0];
  const candidates = (query.data?.compatiblePlayers ?? []).filter((candidate) => candidate.profile === selected?.profile);
  const activeComparison = candidates.some((candidate) => candidate.playerId === comparison) ? comparison : undefined;
  const compareQuery = useQuery({
    queryKey: ["players", "radar-comparison", user?.userId, playerId, RADAR_SEASON, selected?.profile, activeComparison, query.data?.coverage?.datasetId, selected?.snapshotId],
    enabled: active && !!accessToken && !!user && !!activeComparison && !!selected?.comparisonKey,
    staleTime: 15 * 60_000,
    retry: false,
    queryFn: ({ signal }) => getJson(paths.playerRadar(playerId, RADAR_SEASON, selected?.profile, activeComparison), accessToken ?? "", { signal }),
  });
  // An overlay and its primary must come from the same pinned server response.
  const paired = activeComparison ? compareQuery.data : undefined;
  const displayed = paired?.radars.find((r) => r.profile === selected?.profile) ?? selected;
  const filtered = candidates.filter((candidate) => searchText(`${candidate.player} ${candidate.club ?? ""}`).includes(searchText(search.trim())));
  const resetComparison = () => {
    if (comparison) setNotice("Comparison cleared because the role changed.");
    setComparison(undefined); setSearch("");
  };
  const refresh = () => {
    void query.refetch();
    if (activeComparison) void compareQuery.refetch();
  };
  const reason = query.data?.coverage?.reasonCode;
  return { section, comparisonSummary, active, setActive, profile, setProfile, comparison, setComparison, search, setSearch, notice, setNotice, query, selected, candidates, activeComparison, compareQuery, paired, displayed, filtered, resetComparison, refresh, reason, radars };
}
