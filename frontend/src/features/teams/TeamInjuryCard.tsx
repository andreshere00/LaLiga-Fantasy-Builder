import { Link } from "react-router-dom";
import { t, useTranslation } from "../../i18n";
import { Badge } from "../../components/ui/Badge";
import type { ClubDossierDto } from "../../api/schemas";
import { hierarchyPresentation } from "../players/hierarchy";
import { ProfilePhoto } from "../shell/ProfilePhoto";
import { ScrapedText } from "../translation/ScrapedText";
import { LineupFsyp } from "./LineupFsyp";
import {
  expectedReturnLabel, injuryDiagnosisLabel, injuryPhaseLabel, startedLabel,
} from "./teamInjuryLabels";

export type InjuryItem = NonNullable<NonNullable<ClubDossierDto["injuries"]>["items"][number]>;

/** Known wording is translated here; anything else goes through the translation widget. */
function Scraped({ text, label, id }: { text: string; label: string | null; id: string }) {
  return label !== null ? <span>{label}</span> : <ScrapedText text={text} textId={id} />;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

export function TeamInjuryCard({
  item, index, playerId, points, hierarchy, hierarchyLoading, returnTo,
}: {
  item: InjuryItem;
  index: number;
  playerId: string | null;
  points: number | null;
  hierarchy: string | null;
  hierarchyLoading: boolean;
  returnTo: string;
}) {
  useTranslation();
  const role = hierarchy ? hierarchyPresentation(hierarchy) : null;
  const id = `injury-${index}`;
  return (
    <li className="team-injury">
      <ProfilePhoto url={item.photoUrl ?? null} className="team-injury-photo"
        fallback={<span aria-hidden="true">{initials(item.name)}</span>} />
      <div className="team-injury-body">
        <div className="team-injury-head">
          {playerId ? (
            <Link className="team-player-link" to={`/players/${encodeURIComponent(playerId)}`}
              state={{ returnTo }}>{item.name}</Link>
          ) : <strong>{item.name}</strong>}
          <LineupFsyp points={points} />
        </div>
        <dl className="team-injury-facts">
          <div>
            <dt>{t("Hierarchy")}</dt>
            <dd>
              {role ? (
                <span className="team-hierarchy">
                  <img src={role.icon} alt="" className={role.neutral ? "is-neutral" : undefined} />
                  {t(role.label)}
                </span>
              ) : hierarchyLoading ? <span className="team-note">{t("Loading")}</span> : "—"}
            </dd>
          </div>
          <div>
            <dt>{t("Injury")}</dt>
            <dd>
              {item.diagnosis
                ? <Scraped text={item.diagnosis} label={injuryDiagnosisLabel(item.diagnosis)} id={`${id}-type`} />
                : "—"}
            </dd>
          </div>
          <div>
            <dt>{t("Injury status")}</dt>
            <dd>
              {item.status
                ? <Badge>{injuryPhaseLabel(item.status) ?? item.status}</Badge>
                : "—"}
            </dd>
          </div>
          <div>
            <dt>{t("Expected return")}</dt>
            <dd>
              {item.expectedReturn
                ? <Scraped text={item.expectedReturn} label={expectedReturnLabel(item.expectedReturn)} id={`${id}-return`} />
                : "—"}
            </dd>
          </div>
          <div>
            <dt>{t("Started")}</dt>
            <dd>
              {item.startedOn
                ? <time dateTime={item.startedOn}>{startedLabel(item.startedOn)}</time>
                : "—"}
            </dd>
          </div>
        </dl>
        {item.reportUrl ? (
          <a className="team-news-read" href={item.reportUrl} target="_blank" rel="noreferrer">
            {t("Medical report")}
            <span aria-hidden="true"> ↗</span>
            <span className="visually-hidden"> {t("Opens in a new tab.")}</span>
          </a>
        ) : null}
      </div>
    </li>
  );
}
