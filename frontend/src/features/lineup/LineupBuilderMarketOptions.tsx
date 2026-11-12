import { t, useTranslation } from "../../i18n";
import type { SquadCard } from "../../api/mappers";
import { Button } from "../../components/ui/Button";
import { SquadPlayerActions } from "./SquadPlayerActions";
import { useSquadSales } from "./useSquadSales";

/** Market options for a squad player already on the market: change the price or withdraw it. */
export function LineupBuilderMarketOptions({ player }: { player: SquadCard }) {
  useTranslation();
  const sales = useSquadSales();
  return <SquadPlayerActions player={player} sales={sales} cardMenu startView="choose">
    {(openOptions) => <Button size="sm" shape="square" variant="secondary"
      aria-label={t("{{0}} — Market options", { 0: player.name })}
      onClick={openOptions}>{t("Market options")}</Button>}
  </SquadPlayerActions>;
}
