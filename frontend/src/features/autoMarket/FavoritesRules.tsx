import { useId, useMemo } from "react";
import type { SquadCard } from "../../api/mappers";
import { usePlayersCatalogQuery } from "../../api/queries";
import { Button } from "../../components/ui/Button";
import { Field, FieldDescription, FieldLabel } from "../../components/ui/Fields";
import { t, useTranslation } from "../../i18n";
import { useFavoritePlayerIds } from "../scouting/ScoutingProvider";
import { candidates } from "./AutoBuySearch";
import type { FavoriteCandidate, RuleSide } from "./autoRule";
import "./AutoMarket.css";

type Live = (playerId: string, side: RuleSide) => unknown;

/** Favorites you own can be sold and the rest bought; players with a live rule are left out. */
export function useFavoriteCandidates(open: boolean, squad: readonly SquadCard[], liveRuleFor: Live) {
  const favorites = useFavoritePlayerIds();
  const catalog = usePlayersCatalogQuery(open && favorites.size > 0);
  const known = useMemo(() => candidates(catalog.data), [catalog.data]);
  const sells: FavoriteCandidate[] = squad
    .filter((card) => card.masterPlayerId && card.marketValue != null && favorites.has(card.masterPlayerId)
      && !liveRuleFor(card.masterPlayerId, "sell"))
    .map((card) => ({
      playerId: card.masterPlayerId!, playerTeamId: card.id, name: card.name,
      photoUrl: card.photoUrl, teamBadgeUrl: card.teamBadgeUrl, marketValue: card.marketValue,
    }));
  const owned = new Set(squad.map((card) => card.masterPlayerId));
  const buys: FavoriteCandidate[] = known
    .filter(({ target }) => favorites.has(target.playerId) && !owned.has(target.playerId)
      && !liveRuleFor(target.playerId, "buy"))
    .map(({ target }) => ({
      playerId: target.playerId, playerTeamId: null, name: target.name,
      photoUrl: target.photoUrl, teamBadgeUrl: target.teamBadgeUrl, marketValue: target.marketValue,
    }));
  return { buys, sells, hasFavorites: favorites.size > 0 };
}

type FieldProps = {
  side: RuleSide;
  players: readonly FavoriteCandidate[];
  hasFavorites: boolean;
  onLaunch: () => void;
};

/** Entry point to arm auto-buy or auto-sell for several favorites at once. */
export function FavoritesField({ side, players, hasFavorites, onLaunch }: FieldProps) {
  useTranslation();
  const ids = useId();
  const count = players.length > 0 ? ` (${players.length})` : "";
  return (
    <Field>
      <FieldLabel id={`${ids}-favorites`}>{side === "buy" ? t("Buy my favorites") : t("Sell my favorites")}</FieldLabel>
      <FieldDescription>
        {hasFavorites
          ? t("Arm a rule for several favorites at once, at their market value or at an amount.")
          : t("Save players as favorites to arm rules for several of them at once.")}
      </FieldDescription>
      <div className="auto-market-actions" role="group" aria-labelledby={`${ids}-favorites`}>
        <Button variant="outline" shape="square" disabled={players.length === 0} onClick={onLaunch}>
          {side === "buy" ? t("Auto-buy favorites…") : t("Auto-sell favorites…")}{count}</Button>
      </div>
    </Field>
  );
}
