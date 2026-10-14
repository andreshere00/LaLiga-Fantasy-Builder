const MESSAGES: Record<string, string> = {
  market_route_unverified: "The listing's purchase route could not be verified.",
  market_seller_acceptance_required: "Buying this listing requires the seller to accept an offer; settlement before kickoff is not verified.",
  market_offer_type_unknown: "The listing does not say whether it is an auction or a seller offer.",
  market_listing_type_unknown: "The listing type is not a verified market auction.",
  market_expiry_unknown: "The listing has no verified expiry time with a timezone.",
  market_listing_expired: "The market listing has already expired.",
  market_settlement_after_kickoff: "The auction settles at or after the target round starts.",
  opponent_protection_unverified: "The opponent player's acquisition protection could not be verified.",
  opponent_buyouts_disabled: "Release-clause purchases are disabled in this league.",
  opponent_buyout_rules_unknown: "The league did not confirm whether release-clause purchases are enabled.",
  opponent_protection_expiry_unknown: "The opponent player's protection expiry is missing or has no verified timezone.",
  opponent_protection_expires_too_late: "Protection does not expire at least 48 hours before the target round starts.",
  opponent_clause_price_missing: "The opponent player has no verified positive release-clause price.",
  opponent_shield_active: "The opponent player has an active shield without a verified acquisition window.",
  opponent_shield_status_unknown: "The opponent player's shield status could not be verified.",
  opponent_acquisition_deadline_closed: "The release clause cannot be paid before the acquisition deadline.",
  unsupported_player_position: "This position is not supported in a footballer starting XI (for example, a coach).",
  player_identity_unavailable: "The player's identity, club, position or market value could not be verified.",
  player_unavailable: "The player is unavailable for the target round.",
  no_recent_appearance: "No played match was found among the recent LaLiga match slots.",
};

/** Explain source gates while retaining readable fallback text for future codes. */
export function builderDiagnosticMessage(code: string): string {
  return MESSAGES[code] ?? code.replaceAll("_", " ");
}
