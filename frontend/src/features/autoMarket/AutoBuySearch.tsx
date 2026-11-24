import { useId, useMemo, useState } from "react";
import { asRecord, idText, mediaFromPlayerMaster } from "../../api/mappers";
import { formatEuro } from "../../api/format";
import { usePlayersCatalogQuery } from "../../api/queries";
import { Field, FieldDescription, FieldLabel, Input } from "../../components/ui/Fields";
import { t, useTranslation } from "../../i18n";
import { normalizeSearchText } from "../../searchText";
import type { AutoRuleTarget } from "./autoRule";
import "./AutoMarket.css";

const MIN_QUERY = 2;
const MAX_RESULTS = 8;

export type Candidate = { target: AutoRuleTarget; club: string | null; key: string };

export function candidates(catalog: unknown): Candidate[] {
  if (!Array.isArray(catalog)) return [];
  const found: Candidate[] = [];
  for (const entry of catalog) {
    const record = asRecord(entry);
    const id = idText(record?.id);
    const name = String(record?.nickname || record?.name || "");
    if (!record || !id || !name) continue;
    const media = mediaFromPlayerMaster(record);
    const club = asRecord(record.team)?.name;
    found.push({
      key: normalizeSearchText(name), club: typeof club === "string" ? club : null,
      target: {
        side: "buy", playerId: id, playerTeamId: null, name, ...media, clause: null, listed: false,
        marketValue: typeof record.marketValue === "number" ? record.marketValue : null,
      },
    });
  }
  return found;
}

/** Finds any player in the game, on the market or not, and starts an auto-buy for them. */
export function AutoBuySearch({ open, onPick }: { open: boolean; onPick: (target: AutoRuleTarget) => void }) {
  useTranslation();
  const ids = useId();
  const [query, setQuery] = useState("");
  const catalog = usePlayersCatalogQuery(open);
  const all = useMemo(() => candidates(catalog.data), [catalog.data]);
  const needle = normalizeSearchText(query.trim());
  const results = useMemo(
    () => (needle.length < MIN_QUERY ? [] : all.filter((item) => item.key.includes(needle)).slice(0, MAX_RESULTS)),
    [all, needle],
  );
  return (
    <Field>
      <FieldLabel htmlFor={`${ids}-q`}>{t("Buy any player automatically")}</FieldLabel>
      <FieldDescription id={`${ids}-hint`}>
        {t("Search any player. If they are not on the market, the rule waits and bids only within your target value.")}
      </FieldDescription>
      <Input id={`${ids}-q`} type="search" autoComplete="off" value={query} aria-describedby={`${ids}-hint`}
        placeholder={t("Player name")} onChange={(event) => setQuery(event.target.value)} />
      {needle.length >= MIN_QUERY ? (
        results.length > 0 ? (
          <ul className="auto-market-players" aria-label={t("Search results")}>
            {results.map(({ target, club }) => (
              <li key={target.playerId}>
                <button type="button" className="auto-market-player auto-market-result" onClick={() => { setQuery(""); onPick(target); }}>
                  {target.photoUrl ? <img className="auto-market-photo" src={target.photoUrl} alt="" /> : <span className="auto-market-photo" aria-hidden="true" />}
                  <span className="auto-market-player-name">{target.name}</span>
                  <span className="auto-market-player-meta">
                    {target.teamBadgeUrl ? <img className="auto-market-badge" src={target.teamBadgeUrl} alt="" /> : null}
                    {club ? <span>{club}</span> : null}
                    <span>{formatEuro(target.marketValue)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p role="status" className="auto-market-empty">{catalog.isLoading ? t("Loading players…") : t("No players match.")}</p>
      ) : null}
    </Field>
  );
}
