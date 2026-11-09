import { t, useTranslation } from "../../i18n";
import type { ClubDossierDto } from "../../api/schemas";
import { ScrapedText } from "../translation/ScrapedText";
import { TeamMeter } from "./TeamMeter";
import { predictabilityLabel, rotationsLabel, substituteRiskLabel } from "./teamLineupLabels";

type Prediction = NonNullable<ClubDossierDto["prediction"]>;

/** Known wording is translated locally; only unknown free text uses the translation widget. */
function Published({ text, known, textId }: { text: string; known: string | null; textId: string }) {
  return known ? <span id={textId}>{known}</span> : <ScrapedText text={text} textId={textId} />;
}

/** The form arrow is a 1 to 5 scale on FutbolFantasy; five pips plus the number carry it. */
function FormScale({ value }: { value: number | null | undefined }) {
  if (value == null) return <>—</>;
  const level = Math.min(5, Math.max(0, Math.round(value)));
  return (
    <span className="team-pips">
      <span aria-hidden="true">
        {[1, 2, 3, 4, 5].map((step) => <i key={step} data-on={step <= level ? "true" : undefined} />)}
      </span>
      <span>{t("{{0}} of 5", { 0: level })}</span>
    </span>
  );
}

/** Coach report and XI averages in one card: how far the published XI can be trusted. */
export function LineupCoach({ prediction, heading, subtitle }: { prediction: Prediction; heading?: string; subtitle?: string }) {
  useTranslation();
  const { coach, summary } = prediction;
  const hasSummary = summary != null && (
    summary.averageProbability != null
    || summary.averageFormArrow != null
    || Boolean(summary.substituteRisk)
  );
  if (!coach && !hasSummary) return null;
  const predictability = predictabilityLabel(coach?.matchdayPredictability);
  const season = coach?.seasonPredictabilityPercent;
  return (
    <div className="team-coach-block">
      {heading ? <h3>{heading}</h3> : null}
      {subtitle ? <p className="team-note">{subtitle}</p> : null}
      <article className="team-coach">
      {coach ? (
        <>
          <header className="team-coach-head">
            {coach.photoUrl ? <img src={coach.photoUrl} alt="" /> : null}
            <div className="team-coach-body">
              <p className="team-coach-role">
                {t("Coach")}
                {prediction.matchday != null ? ` · ${t("Matchday {{0}}", { 0: prediction.matchday })}` : ""}
              </p>
              <h3>{coach.name}</h3>
            </div>
          </header>
          <dl className="team-coach-facts">
            <div className="is-lead">
              <dt>{t("Season predictability")}</dt>
              <dd className="is-figure">
                {season == null ? "—" : `${season}%`}
                <TeamMeter percent={season} />
              </dd>
            </div>
            <div>
              <dt>{t("Matchday predictability")}</dt>
              <dd>
                {coach.matchdayPredictability
                  ? predictability
                    ? <span className="team-chip" data-tone={predictability.tone}>{predictability.label}</span>
                    : <ScrapedText text={coach.matchdayPredictability} textId="club-predictability" />
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>{t("Rotations")}</dt>
              <dd>
                {coach.rotations
                  ? <Published text={coach.rotations} known={rotationsLabel(coach.rotations)} textId="club-rotations" />
                  : "—"}
              </dd>
            </div>
          </dl>
        </>
      ) : null}
      {hasSummary && summary ? (
        <dl className="team-coach-facts team-xi-summary">
          <div>
            <dt>{t("Average probability")}</dt>
            <dd className="is-figure">
              {summary.averageProbability == null ? "—" : `${summary.averageProbability}%`}
            </dd>
          </div>
          <div>
            <dt>{t("Average form")}</dt>
            <dd><FormScale value={summary.averageFormArrow} /></dd>
          </div>
          <div>
            <dt>{t("Substitute risk")}</dt>
            <dd>
              {summary.substituteRisk
                ? <Published
                    text={summary.substituteRisk}
                    known={substituteRiskLabel(summary.substituteRisk)}
                    textId="club-xi-risk"
                  />
                : "—"}
            </dd>
          </div>
        </dl>
      ) : null}
      </article>
    </div>
  );
}
