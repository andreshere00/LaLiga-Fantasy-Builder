import { z } from "zod";

const idValueSchema = z.union([z.string(), z.number()]);
const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
const dynamicObjectSchema = z.record(z.string(), jsonValueSchema);

function snakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function addCamelAliases(value: unknown, schema: z.ZodType, context: z.RefinementCtx): unknown {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return addCamelAliases(value, schema.unwrap() as z.ZodType, context);
  }
  if (schema instanceof z.ZodArray) {
    return Array.isArray(value)
      ? value.map((item) => addCamelAliases(item, schema.element as z.ZodType, context))
      : value;
  }
  if (schema instanceof z.ZodRecord || schema instanceof z.ZodUnion || schema instanceof z.ZodLazy) {
    return value;
  }
  if (schema instanceof z.ZodObject && typeof value === "object" && value !== null) {
    const source = value as Record<string, unknown>;
    const output = { ...source };
    for (const [fieldName, fieldSchema] of Object.entries(schema.shape)) {
      const wireName = snakeCase(fieldName);
      if (wireName !== fieldName && fieldName in source && wireName in source) {
        context.addIssue({ code: "custom", message: "Ambiguous response field aliases" });
      }
      const sourceName = fieldName in source ? fieldName : wireName in source ? wireName : null;
      if (sourceName !== null) {
        output[fieldName] = addCamelAliases(source[sourceName], fieldSchema, context);
        if (wireName !== fieldName) delete output[wireName];
      }
    }
    return output;
  }
  return value;
}

function responseSchema<T extends z.ZodType>(shape: T, allowEmpty = false) {
  const checked = shape.superRefine((value, context) => {
    const objectShapes: z.ZodObject[] = [];
    if (shape instanceof z.ZodObject) objectShapes.push(shape);
    if (shape instanceof z.ZodArray && shape.element instanceof z.ZodObject) {
      objectShapes.push(shape.element);
    }
    if (objectShapes.length === 0) return;

    const objects = Array.isArray(value) ? value : [value];
    for (const item of objects) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
      if (allowEmpty && Object.keys(item).length === 0) continue;
      const fields = objectShapes[0].shape;
      if (!Object.keys(fields).some((key) => key in item)) {
        context.addIssue({ code: "custom", message: "Expected a recognized response object" });
        return;
      }
    }
  });
  return z.preprocess((value, context) => addCamelAliases(value, shape, context), checked);
}

function requestSchema<T extends z.ZodType>(shape: T) {
  return shape;
}

const readObject = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough();
const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();
const nullableId = idValueSchema.nullable();
const stringList = z.array(z.string());

const standingClubSchema = readObject({
  id: z.number().int().positive(), name: z.string().min(1), badgeUrl: z.string().nullable(),
});
const standingMatchSchema = readObject({
  matchId: z.string().min(1), kickoffAt: z.string().datetime({ offset: true }),
  opponent: standingClubSchema, venue: z.enum(["home", "away"]),
  goalsFor: z.number().int().nonnegative(), goalsAgainst: z.number().int().nonnegative(),
  result: z.enum(["W", "D", "L"]),
}).superRefine((match, context) => {
  const expected = match.goalsFor > match.goalsAgainst ? "W" : match.goalsFor < match.goalsAgainst ? "L" : "D";
  if (match.result !== expected) context.addIssue({ code: "custom", message: "Result disagrees with score" });
});
const clubStandingSchema = readObject({
  team: standingClubSchema, position: z.number().int().positive(), points: z.number().int(),
  played: z.number().int().nonnegative(), won: z.number().int().nonnegative(),
  drawn: z.number().int().nonnegative(), lost: z.number().int().nonnegative(),
  goalsFor: z.number().int().nonnegative(), goalsAgainst: z.number().int().nonnegative(),
  goalDifference: z.number().int(), last5Matches: z.array(standingMatchSchema).max(5),
}).superRefine((row, context) => {
  const matches = row.last5Matches;
  if (row.played !== row.won + row.drawn + row.lost || row.goalDifference !== row.goalsFor - row.goalsAgainst) {
    context.addIssue({ code: "custom", message: "Inconsistent standings totals" });
  }
  if (matches.length !== Math.min(5, row.played) || new Set(matches.map((match) => match.matchId)).size !== matches.length) {
    context.addIssue({ code: "custom", message: "Incomplete or duplicate form history" });
  }
  if (matches.some((match, index) => match.opponent.id === row.team.id
    || (index > 0 && Date.parse(match.kickoffAt) < Date.parse(matches[index - 1].kickoffAt)))) {
    context.addIssue({ code: "custom", message: "Invalid form history" });
  }
});
export const competitionStandingsSchema = responseSchema(readObject({
  competition: readObject({ id: z.number().int().positive(), name: z.string().min(1) }),
  season: z.number().int().min(2000).max(2100), mode: z.enum(["live", "completed"]),
  rows: z.array(clubStandingSchema).length(20), source: z.enum(["api-football", "laliga-fixtures"]),
  fetchedAt: z.string().datetime({ offset: true }), sourceUpdatedAt: z.string().datetime({ offset: true }).nullable(),
  generatedAt: z.string().datetime({ offset: true }), cached: z.boolean(), isProvisional: z.boolean(),
  liveAvailable: z.literal(false).default(false),
}).superRefine((table, context) => {
  if (new Set(table.rows.map((row) => row.team.id)).size !== table.rows.length
    || table.rows.some((row, index) => row.position !== index + 1)) {
    context.addIssue({ code: "custom", message: "Incomplete or duplicate standings positions/clubs" });
  }
}));
export const standingsQuerySchema = z.object({
  season: z.number().int().min(2000).max(2100).optional(),
  mode: z.enum(["live", "completed"]).optional(),
}).strict();
export type CompetitionStandingsDto = z.infer<typeof competitionStandingsSchema>;

export const errorResponseSchema = responseSchema(
  readObject({ error: z.string(), detail: z.string(), diagnostics: z.array(readObject({ code: z.string().max(100), playerId: z.string().nullable() })).max(200).optional() }),
);

export const meResponseSchema = responseSchema(
  z.object({ userId: z.string(), email: z.string().nullable(), name: z.string().nullable() }).passthrough(),
);
export const credentialProbeResponseSchema = responseSchema(
  readObject({ userId: z.string(), hasBearer: z.boolean(), expiresAt: z.number().int() }),
);
export const leaguesProbeResponseSchema = responseSchema(
  readObject({
    ok: z.boolean(),
    leagueCount: z.number().int().nonnegative(),
    leagueIds: z.array(idValueSchema),
  }),
);

const prizeInformationSchema = readObject({
  title: nullableString.optional(),
  description: nullableString.optional(),
});
const leagueTypeSchema = readObject({
  id: nullableString.optional(),
  canBeDuplicated: z.boolean().nullable().optional(),
  sponsorId: nullableNumber.optional(),
  prizeInformation: prizeInformationSchema.nullable().optional(),
});
const leagueTeamSummarySchema = readObject({
  id: nullableId.optional(),
  money: nullableNumber.optional(),
  teamPoints: nullableNumber.optional(),
  playersNumber: nullableNumber.optional(),
  teamValue: nullableNumber.optional(),
  canPunctuate: z.boolean().nullable().optional(),
  position: nullableNumber.optional(),
  previousPosition: nullableNumber.optional(),
  isAdmin: z.boolean().nullable().optional(),
  manager: readObject({
    id: nullableId.optional(),
    managerName: nullableString.optional(),
    avatar: nullableString.optional(),
    profileImage: nullableString.optional(),
  }).nullable().optional(),
});
const leagueConfigSchema = readObject({
  features: readObject({ buyoutClause: z.boolean().nullable().optional() }).nullable().optional(),
  premiumFeatures: readObject({
    formations: z.boolean().nullable().optional(),
    captain: z.boolean().nullable().optional(),
    bench: z.boolean().nullable().optional(),
    loan: z.boolean().nullable().optional(),
    ideal: z.boolean().nullable().optional(),
    coach: z.boolean().nullable().optional(),
  }).nullable().optional(),
  premiumConfigurations: readObject({
    loan: readObject({
      duration: nullableNumber.optional(),
      maxLoans: nullableNumber.optional(),
      enableConclude: z.boolean().nullable().optional(),
      minPercentage: z.number().nullable().optional(),
    }).nullable().optional(),
    ideal: readObject({ reward: nullableNumber.optional() }).nullable().optional(),
  }).nullable().optional(),
});

export const fantasyLeagueSchema = readObject({
  id: nullableId.optional(),
  access: z.string().nullable().optional(),
  type: leagueTypeSchema.nullable().optional(),
  managersNumber: z.number().int().nullable().optional(),
  name: nullableString.optional(),
  config: leagueConfigSchema.nullable().optional(),
  isDuplicated: z.boolean().nullable().optional(),
  isSecondRound: z.boolean().nullable().optional(),
  token: nullableString.optional(),
  description: nullableString.optional(),
  premium: z.boolean().nullable().optional(),
  team: leagueTeamSummarySchema.nullable().optional(),
});
export const leaguesResponseSchema = responseSchema(z.array(fantasyLeagueSchema));

const managerSchema = readObject({
  id: nullableId.optional(),
  managerName: nullableString.optional(),
  avatar: nullableString.optional(),
  profileImage: nullableString.optional(),
});
const standingTeamSchema = readObject({
  id: nullableId.optional(),
  managerId: nullableId.optional(),
  banned: z.boolean().nullable().optional(),
  managerWarned: z.boolean().nullable().optional(),
  isAdmin: z.boolean().nullable().optional(),
  teamValue: nullableNumber.optional(),
  teamPoints: nullableNumber.optional(),
  teamMoney: nullableNumber.optional(),
  avatar: nullableString.optional(),
  manager: managerSchema.nullable().optional(),
});
export const standingRowSchema = readObject({
  position: nullableNumber.optional(),
  previousPosition: nullableNumber.optional(),
  points: nullableNumber.optional(),
  livePoints: nullableNumber.optional(),
  team: standingTeamSchema.nullable().optional(),
  manager: managerSchema.nullable().optional(),
  teamId: nullableId.optional(),
  name: nullableString.optional(),
});
export const standingResponseSchema = responseSchema(z.array(standingRowSchema));

export const activityItemSchema = readObject({
  id: nullableId.optional(),
  activityTypeId: nullableNumber.optional(),
  amount: nullableNumber.optional(),
  createdAt: z.string().nullable().optional(),
  playerMasterId: nullableId.optional(),
  user1Id: nullableId.optional(),
  user2Id: nullableId.optional(),
  weekNumber: nullableNumber.optional(),
  msg: nullableString.optional(),
  message: nullableString.optional(),
  description: nullableString.optional(),
});
export const activityResponseSchema = responseSchema(z.array(activityItemSchema));

const clubTeamSchema = readObject({
  id: nullableString.optional(), name: nullableString.optional(), slug: nullableString.optional(),
  assets: nullableString.optional(), badgeColor: nullableString.optional(), badgeWhite: nullableString.optional(),
});
const playerStatWeekSchema = readObject({
  weekNumber: nullableNumber.optional(), totalPoints: nullableNumber.optional(),
  isInIdealFormation: z.boolean().nullable().optional(), stats: dynamicObjectSchema.nullable().optional(),
});
const playerMarketSchema = readObject({
  id: nullableString.optional(), salePrice: nullableNumber.optional(), expirationDate: nullableString.optional(),
  numberOfOffers: nullableNumber.optional(), directOffer: z.boolean().nullable().optional(),
});
const playerMasterSchema = readObject({
  id: nullableId.optional(),
  name: nullableString.optional(),
  nickname: nullableString.optional(),
  slug: nullableString.optional(),
  points: nullableNumber.optional(),
  weekPoints: nullableNumber.optional(),
  marketValue: nullableNumber.optional(),
  positionId: nullableNumber.optional(),
  playerStatus: nullableString.optional(),
  teamId: nullableId.optional(),
  lastSeasonPoints: nullableNumber.optional(),
  averagePoints: nullableNumber.optional(),
  images: dynamicObjectSchema.nullable().optional(),
  lastStats: z.array(playerStatWeekSchema).nullable().optional(),
  team: clubTeamSchema.nullable().optional(),
});
const squadPlayerSchema = readObject({
  playerTeamId: nullableId.optional(),
  buyoutClause: nullableNumber.optional(),
  buyoutClauseLockedEndTime: nullableString.optional(),
  isShielded: z.boolean().nullable().optional(),
  managerId: nullableId.optional(),
  manager: managerSchema.nullable().optional(),
  playerMarket: playerMarketSchema.nullable().optional(),
  playerMaster: playerMasterSchema.nullable().optional(),
});

export const leagueTeamSchema = readObject({
  id: nullableId.optional(),
  managerId: nullableId.optional(),
  banned: z.boolean().nullable().optional(),
  position: nullableNumber.optional(),
  previousPosition: nullableNumber.optional(),
  fixturePoints: nullableNumber.optional(),
  startingWeek: nullableString.optional(),
  teamMoney: nullableNumber.optional(),
  teamPoints: nullableNumber.optional(),
  teamValue: nullableNumber.optional(),
  manager: managerSchema.nullable().optional(),
  players: z.array(squadPlayerSchema).nullable().optional(),
  loanedPlayers: z.array(jsonValueSchema).nullable().optional(),
});
export const leagueTeamsResponseSchema = responseSchema(z.array(leagueTeamSchema));

export const teamDetailSchema = readObject({
  id: nullableId.optional(),
  managerId: nullableId.optional(),
  banned: z.boolean().nullable().optional(),
  position: nullableNumber.optional(),
  startingWeek: nullableString.optional(),
  teamMoney: nullableNumber.optional(),
  playersNumber: nullableNumber.optional(),
  teamValue: nullableNumber.optional(),
  teamPoints: nullableNumber.optional(),
  manager: managerSchema.nullable().optional(),
  players: z.array(squadPlayerSchema).nullable().optional(),
  loanedPlayers: z.array(jsonValueSchema).nullable().optional(),
});
export const teamDetailResponseSchema = responseSchema(teamDetailSchema);

export const teamMoneySchema = responseSchema(
  readObject({ teamMoney: nullableNumber.optional(), teamInvestment: nullableNumber.optional() }),
  true,
);

const lineupFormationSchema = readObject({
  goalkeeper: z.array(jsonValueSchema).nullable().optional(),
  defender: z.array(jsonValueSchema).nullable().optional(),
  midfield: z.array(jsonValueSchema).nullable().optional(),
  striker: z.array(jsonValueSchema).nullable().optional(),
  coach: z.array(jsonValueSchema).nullable().optional(),
  captain: nullableId.optional(),
  bench: z.union([dynamicObjectSchema, z.array(jsonValueSchema)]).nullable().optional(),
  tacticalFormation: z.array(z.number().int()).nullable().optional(),
});
const teamLineupShape = readObject({
  formation: lineupFormationSchema.nullable().optional(),
  teamId: nullableId.optional(),
  weekNumber: nullableNumber.optional(),
});
export const teamLineupSchema = responseSchema(teamLineupShape);
const lineupMutationResponseSchema = responseSchema(teamLineupShape, true);

export const currentWeekSchema = responseSchema(
  readObject({
    isLive: z.boolean().nullable().optional(),
    nextWeek: nullableNumber.optional(),
    previousWeek: nullableNumber.optional(),
    weekNumber: nullableNumber.optional(),
    openingWeekDate: nullableString.optional(),
    closingWeekDate: nullableString.optional(),
  }),
);
export const fixtureSchema = readObject({
  id: nullableId.optional(),
  matchDate: nullableString.optional(),
  date: nullableString.optional(),
  time: nullableString.optional(),
  localId: nullableNumber.optional(),
  visitorId: nullableNumber.optional(),
  matchState: nullableNumber.optional(),
  localScore: nullableNumber.optional(),
  visitorScore: nullableNumber.optional(),
  featured: z.boolean().nullable().optional(),
});
export const fixturesResponseSchema = responseSchema(z.array(fixtureSchema));

const matchPlayerSchema = readObject({
  id: nullableNumber.optional(),
  images: dynamicObjectSchema.nullable().optional(),
  name: nullableString.optional(),
  nickname: nullableString.optional(),
  positionId: nullableNumber.optional(),
  teamId: nullableNumber.optional(),
  weekPoints: nullableNumber.optional(),
});
const matchSideSchema = readObject({
  id: nullableNumber.optional(),
  badgeColor: nullableString.optional(),
  mainName: nullableString.optional(),
  players: z.array(matchPlayerSchema).nullable().optional(),
});
export const matchStatsSchema = readObject({
  id: nullableNumber.optional(),
  date: nullableString.optional(),
  local: matchSideSchema.nullable().optional(),
  visitor: matchSideSchema.nullable().optional(),
  matchState: nullableNumber.optional(),
  localScore: nullableNumber.optional(),
  visitorScore: nullableNumber.optional(),
});
export const matchStatsResponseSchema = responseSchema(z.array(matchStatsSchema));

export const catalogPlayerSchema = readObject({
  id: nullableId.optional(),
  nickname: nullableString.optional(),
  name: nullableString.optional(),
  slug: nullableString.optional(),
  positionId: nullableNumber.optional(),
  teamId: z.union([z.number().int(), z.string().regex(/^[0-9]+$/)]).nullable().optional(),
  team: dynamicObjectSchema.nullable().optional(),
  playerStatus: nullableString.optional(),
  points: nullableNumber.optional(),
  averagePoints: nullableNumber.optional(),
  weekPoints: jsonValueSchema.nullable().optional(),
  marketValue: nullableNumber.optional(),
  lastSeasonPoints: nullableNumber.optional(),
  images: dynamicObjectSchema.nullable().optional(),
  lastStats: z.array(jsonValueSchema).nullable().optional(),
});
export const catalogPlayersResponseSchema = responseSchema(z.array(catalogPlayerSchema));

export const marketValueSchema = readObject({ date: nullableString.optional(), marketValue: nullableNumber.optional() });
export const marketValuesResponseSchema = responseSchema(z.array(marketValueSchema));
export const leaguePlayerSchema = responseSchema(squadPlayerSchema);

const statsPlayerRefSchema = readObject({
  id: z.string(),
  name: nullableString.optional(),
  nickname: nullableString.optional(),
  slug: nullableString.optional(),
  teamId: nullableNumber.optional(),
  teamName: nullableString.optional(),
  positionId: nullableNumber.optional(),
});
const segmentWarningSchema = readObject({
  code: z.string(),
  source: nullableString.optional(),
  detail: nullableString.optional(),
});
const sourceStatusSchema = readObject({
  name: z.string(),
  status: z.string().optional(),
  cached: z.boolean().optional(),
  fetchedAt: z.string().nullable().optional(),
});
const segmentEnvelopeShape = {
  playerId: z.string(),
  player: statsPlayerRefSchema.nullable().optional(),
  season: z.string(),
  generatedAt: z.string(),
  sources: z.array(sourceStatusSchema).optional(),
  warnings: z.array(segmentWarningSchema).optional(),
};
export const playerStatsIndexSchema = responseSchema(
  readObject({
    player: statsPlayerRefSchema,
    season: z.string(),
    segments: z.array(
      readObject({
        name: z.string(),
        href: z.string(),
        auth: z.enum(["jwt", "public"]),
        sources: stringList,
        requiresScraper: z.boolean(),
        available: z.boolean(),
        query: stringList,
      }),
    ),
    generatedAt: z.string(),
  }),
);

const statValueSchema = readObject({
  count: nullableNumber.optional(),
  fantasyPoints: nullableNumber.optional(),
  daznPoints: nullableNumber.optional(),
  source: z.string().optional(),
});
const fixtureStatsSchema = readObject({
  minutesPlayed: statValueSchema.optional(),
  goals: statValueSchema.optional(),
  assists: statValueSchema.optional(),
  bigChancesCreated: statValueSchema.optional(),
  ballsIntoBox: statValueSchema.optional(),
  penaltiesCommitted: statValueSchema.optional(),
  penaltiesWon: statValueSchema.optional(),
  penaltiesSaved: statValueSchema.optional(),
  saves: statValueSchema.optional(),
  clearances: statValueSchema.optional(),
  penaltiesMissed: statValueSchema.optional(),
  ownGoals: statValueSchema.optional(),
  goalsConceded: statValueSchema.optional(),
  yellowCards: statValueSchema.optional(),
  redCard: statValueSchema.optional(),
  shots: statValueSchema.optional(),
  successfulDribbles: statValueSchema.optional(),
  recoveries: statValueSchema.optional(),
  ballsLost: statValueSchema.optional(),
  daznPoints: statValueSchema.optional(),
});
const competitionSchema = z.enum([
  "laliga",
  "conference_league",
  "europa_league",
  "champions_league",
  "copa_del_rey",
  "supercopa",
  "other",
]);
const fixtureRefSchema = readObject({
  date: z.string().nullable().optional(),
  competition: competitionSchema,
  competitionLabel: nullableString.optional(),
  matchweek: nullableNumber.optional(),
  homeTeam: nullableString.optional(),
  awayTeam: nullableString.optional(),
  isHome: z.boolean().nullable().optional(),
  opponent: nullableString.optional(),
  homeScore: nullableNumber.optional(),
  awayScore: nullableNumber.optional(),
  result: z.enum(["W", "D", "L"]).nullable().optional(),
});
const fixtureStatsRowSchema = readObject({
  fixture: fixtureRefSchema,
  minutesPlayed: nullableNumber.optional(),
  fantasyPointsTotal: nullableNumber.optional(),
  stats: fixtureStatsSchema,
  warnings: z.array(segmentWarningSchema).optional(),
});
export const playerFixtureStatsSchema = responseSchema(
  readObject({ ...segmentEnvelopeShape, fixtures: z.array(fixtureStatsRowSchema) }),
);

const marketSeriesPointSchema = readObject({
  date: z.string(),
  value: z.number(),
  deltaAbs: nullableNumber.optional(),
  deltaRel: z.number().nullable().optional(),
  filled: z.boolean().optional(),
});
const marketWindowSchema = readObject({
  preset: z.enum(["season", "30d", "14d", "10d", "5d"]).nullable().optional(),
  from: z.string(),
  to: z.string(),
  days: z.number(),
  startValue: nullableNumber.optional(),
  endValue: nullableNumber.optional(),
  deltaAbs: nullableNumber.optional(),
  deltaRel: z.number().nullable().optional(),
  min: readObject({ date: z.string(), value: z.number() }).nullable().optional(),
  max: readObject({ date: z.string(), value: z.number() }).nullable().optional(),
  series: z.array(marketSeriesPointSchema),
});
export const playerMarketStatsSchema = responseSchema(
  readObject({
    ...segmentEnvelopeShape,
    window: marketWindowSchema,
    presets: z.array(
      readObject({
        preset: z.enum(["season", "30d", "14d", "10d", "5d"]),
        from: z.string(),
        to: z.string(),
        startValue: nullableNumber.optional(),
        endValue: nullableNumber.optional(),
        deltaAbs: nullableNumber.optional(),
        deltaRel: z.number().nullable().optional(),
      }),
    ),
    currentValue: nullableNumber.optional(),
    currency: z.literal("EUR").optional(),
  }),
);

const minutesPlayedSchema = readObject({
  minutes: nullableNumber.optional(),
  started: z.boolean().nullable().optional(),
  note: nullableString.optional(),
});
const recentMatchSchema = readObject({
  fixture: fixtureRefSchema,
  minutes: minutesPlayedSchema,
  fantasyPointsTotal: nullableNumber.optional(),
  stats: fixtureStatsSchema.nullable().optional(),
  warnings: z.array(segmentWarningSchema).optional(),
});
export const recentMatchesSchema = responseSchema(
  readObject({ ...segmentEnvelopeShape, matches: z.array(recentMatchSchema) }),
);

const venueSchema = readObject({
  clubKey: z.string(),
  stadium: nullableString.optional(),
  city: nullableString.optional(),
  lat: z.number(),
  lon: z.number(),
  country: nullableString.optional(),
});
const weatherSnapshotSchema = readObject({
  temperatureC: z.number(),
  feelsLikeC: z.number().nullable().optional(),
  humidityPct: nullableNumber.optional(),
  windSpeedMs: z.number().nullable().optional(),
  precipitationProbability: z.number().nullable().optional(),
  rainMm: z.number().nullable().optional(),
  condition: z.string(),
  conditionCode: nullableNumber.optional(),
  icon: nullableString.optional(),
  forecastFor: z.string(),
  granularity: z.enum(["3h", "daily"]).optional(),
  source: z.literal("openweather").optional(),
});
const upcomingMatchSchema = readObject({
  fixture: fixtureRefSchema,
  kickoff: z.string().nullable().optional(),
  weather: readObject({
    snapshot: weatherSnapshotSchema.nullable().optional(),
    reason: z.string().nullable().optional(),
    venue: venueSchema.nullable().optional(),
  }),
  travel: readObject({
    distanceKm: z.number().nullable().optional(),
    mode: z.literal("great_circle").optional(),
    fromVenue: venueSchema.nullable().optional(),
    toVenue: venueSchema.nullable().optional(),
    playerTeamTravels: z.boolean().nullable().optional(),
    reason: nullableString.optional(),
  }),
  warnings: z.array(segmentWarningSchema).optional(),
});
export const upcomingMatchesSchema = responseSchema(
  readObject({ ...segmentEnvelopeShape, matches: z.array(upcomingMatchSchema) }),
);

export const playerProfileSchema = responseSchema(
  readObject({
    ...segmentEnvelopeShape,
    injury: readObject({
      active: z.boolean().nullable().optional(),
      diagnosis: nullableString.optional(),
      since: z.string().nullable().optional(),
      expectedReturn: z.string().nullable().optional(),
      availabilityText: nullableString.optional(),
      fantasyStatus: nullableString.optional(),
    }),
    form: readObject({
      value: z.number().nullable().optional(),
      rating: z.enum(["very_bad", "bad", "mid", "good", "very_good"]).nullable().optional(),
      visualOnly: z.boolean().optional(),
    }).nullable().optional(),
    startProbability: readObject({
      matchweek: nullableNumber.optional(),
      percent: nullableNumber.optional(),
      raw: nullableString.optional(),
    }),
    injuryRisk: readObject({ level: z.enum(["low", "medium", "high", "unknown"]), raw: nullableString.optional() }),
    injuryHistory: z.array(
      readObject({
        start: z.string().nullable().optional(),
        end: z.string().nullable().optional(),
        ongoing: z.boolean().optional(),
        diagnosis: nullableString.optional(),
        durationDays: nullableNumber.optional(),
      }),
    ),
    maxProfitableBid: readObject({ amount: nullableNumber.optional(), profitable: z.boolean().nullable().optional(), raw: nullableString.optional() }),
    hierarchy: readObject({ label: nullableString.optional(), rank: nullableNumber.optional() }),
    news: z.array(
      readObject({ title: z.string(), url: z.string().nullable().optional(), publishedAt: z.string().nullable().optional(), source: nullableString.optional() }),
    ),
    averages: z.array(readObject({ code: z.string(), label: z.string(), value: z.number().nullable().optional() })),
  }),
);

export const playerDetailSchema = responseSchema(
  readObject({
    playerId: z.string(),
    player: statsPlayerRefSchema,
    season: z.string(),
    generatedAt: z.string(),
    fixtures: playerFixtureStatsSchema.nullable().optional(),
    market: playerMarketStatsSchema.nullable().optional(),
    recent: recentMatchesSchema.nullable().optional(),
    upcoming: upcomingMatchesSchema.nullable().optional(),
    profile: playerProfileSchema.nullable().optional(),
    segmentErrors: z.array(readObject({ segment: z.string(), code: z.string(), detail: z.string() })),
  }),
);

const marketBidSchema = readObject({
  id: nullableId.optional(),
  money: nullableNumber.optional(),
  status: nullableString.optional(),
  createdAt: nullableString.optional(),
  updatedAt: nullableString.optional(),
});
const marketListingSchema = readObject({
  id: nullableId.optional(),
  leagueId: nullableId.optional(),
  leagueType: z.union([z.string(), z.number()]).nullable().optional(),
  directOffer: z.boolean().nullable().optional(),
  discr: nullableString.optional(),
  expirationDate: nullableString.optional(),
  numberOfBids: nullableNumber.optional(),
  numberOfOffers: nullableNumber.optional(),
  bid: marketBidSchema.nullable().optional(),
  playerMaster: playerMasterSchema.nullable().optional(),
});
export const marketSnapshotSchema = responseSchema(
  readObject({ marketPlayers: z.array(marketListingSchema).optional(), userBids: z.array(marketBidSchema).optional() }),
);
export const marketHistorySchema = responseSchema(
  z.array(readObject({ id: nullableId.optional() })),
);
export const playerTeamOffersSchema = responseSchema(
  readObject({
    offers: z.array(readObject({
      id: nullableId.optional(), money: nullableNumber.optional(), status: nullableString.optional(),
      bidderId: nullableId.optional(), bidderName: nullableString.optional(),
      marketId: nullableId.optional(), expirationDate: nullableString.optional(),
      createdAt: nullableString.optional(), updatedAt: nullableString.optional(),
      isFromMarket: z.boolean().nullable().optional(),
    })).optional(),
    bids: z.array(marketBidSchema).optional(),
  }),
  true,
);
export const marketMutationResultSchema = responseSchema(
  readObject({
    ok: z.boolean().optional(),
    id: nullableId.optional(),
    status: nullableString.optional(),
    message: nullableString.optional(),
    marketId: nullableId.optional(),
    bidId: nullableId.optional(),
    offerId: nullableId.optional(),
    sold: z.boolean().optional(),
  }),
  true,
);
export const shieldStatusSchema = responseSchema(
  readObject({ isShielded: z.boolean().nullable().optional() }),
);
export const buyoutMutationResultSchema = responseSchema(
  readObject({ ok: z.boolean().optional(), message: nullableString.optional() }),
  true,
);
export const healthResponseSchema = responseSchema(readObject({ status: z.string() }));

export const lineupWriteDtoSchema = z
  .object({
    goalkeeper: idValueSchema,
    defender: z.array(idValueSchema),
    midfield: z.array(idValueSchema),
    striker: z.array(idValueSchema),
    tacticalFormation: z.array(z.number().int()),
    coach: idValueSchema.nullable().optional(),
    captain: idValueSchema.nullable().optional(),
    bench: dynamicObjectSchema.nullable().optional(),
  })
  .strict();
export type LineupWriteDto = z.infer<typeof lineupWriteDtoSchema>;

export const lineupWriteSchema = requestSchema(lineupWriteDtoSchema);
export const bidWriteSchema = requestSchema(
  z.object({ money: z.number().int().positive() }).strict(),
);
export const listingWriteSchema = requestSchema(
  z.object({ playerId: idValueSchema, salePrice: z.number().int().positive().max(999_999_999) }).strict(),
);
export const directOfferWriteSchema = requestSchema(
  z.object({ playerId: idValueSchema, money: z.number().int().positive() }).strict(),
);
export const immediateSaleWriteSchema = requestSchema(z.object({ playerId: idValueSchema }).strict());
export const acceptOfferWriteSchema = requestSchema(
  z.object({ offerMoney: z.number().int().positive() }).strict(),
);
export const payBuyoutWriteSchema = requestSchema(
  z.object({ buyoutClauseToPay: z.number().int().positive() }).strict(),
);
export const increaseBuyoutWriteSchema = requestSchema(
  z.object({ buyoutClause: z.number().int().positive() }).strict(),
);
export const shieldWriteSchema = requestSchema(
  z.object({ playerId: idValueSchema, rewardedAdType: z.string().min(1), rewardedAd: z.number().int() }).strict(),
);

const marketQueryShape = {
  preset: z.enum(["season", "30d", "14d", "10d", "5d"]).optional(),
  from: z.string().date().optional(), to: z.string().date().optional(),
};
function validateMarketWindow(
  value: { preset?: string; from?: string; to?: string }, context: z.RefinementCtx,
) {
  if (value.preset && (value.from || value.to)) context.addIssue({ code: "custom", message: "Preset excludes dates" });
  if (value.to && !value.from) context.addIssue({ code: "custom", message: "From is required" });
  if (value.from && value.to) {
    const days = (Date.parse(value.to) - Date.parse(value.from)) / 86400000;
    if (days < 0 || days > 400) context.addIssue({ code: "custom", message: "Invalid date window" });
  }
}
export const fixturesQuerySchema = z.object({
  last: z.number().int().min(1).max(60).optional(), competition: z.array(competitionSchema).optional(),
}).strict();
export const marketQuerySchema = z.object(marketQueryShape).strict().superRefine(validateMarketWindow);
export const recentQuerySchema = z.object({
  limit: z.number().int().min(1).max(5).optional(), includeStats: z.boolean().optional(),
}).strict();
export const upcomingQuerySchema = z.object({
  limit: z.number().int().min(1).max(5).optional(), includeWeather: z.boolean().optional(),
}).strict();
export const playerStatsDetailQuerySchema = z.object({
  ...marketQueryShape,
  last: z.number().int().min(1).max(60).optional(), competition: z.array(competitionSchema).optional(),
  limit: z.number().int().min(1).max(5).optional(),
  includeWeather: z.boolean().optional(), includeStats: z.boolean().optional(),
  include: z.array(z.enum(["fixtures", "market", "recent", "upcoming", "profile"])).optional(),
}).strict().superRefine(validateMarketWindow);

export const pathSegmentSchema = z.string().min(1).refine((value) => value !== "." && value !== "..");
export const positivePathNumberSchema = z.number().int().min(1);

export type PlayerStatsDetailQuery = z.infer<typeof playerStatsDetailQuerySchema>;
export type MeResponseDto = z.infer<typeof meResponseSchema>;
export type CredentialProbeResponseDto = z.infer<typeof credentialProbeResponseSchema>;
export type LeaguesProbeResponseDto = z.infer<typeof leaguesProbeResponseSchema>;
export type ErrorResponseDto = z.infer<typeof errorResponseSchema>;
export type HealthResponseDto = z.infer<typeof healthResponseSchema>;
export type FantasyLeagueDto = z.infer<typeof fantasyLeagueSchema>;
export type ManagerDto = z.infer<typeof managerSchema>;
export type StandingRowDto = z.infer<typeof standingRowSchema>;
export type ActivityItemDto = z.infer<typeof activityItemSchema>;
export type LeagueTeamDto = z.infer<typeof leagueTeamSchema>;
export type TeamDetailDto = z.infer<typeof teamDetailSchema>;
export type TeamMoneyDto = z.infer<typeof teamMoneySchema>;
export type TeamLineupDto = z.infer<typeof teamLineupSchema>;
export type CurrentWeekDto = z.infer<typeof currentWeekSchema>;
export type FixtureDto = z.infer<typeof fixtureSchema>;
export type MatchStatsDto = z.infer<typeof matchStatsSchema>;
export type CatalogPlayerDto = z.infer<typeof catalogPlayerSchema>;
export type MarketValueDto = z.infer<typeof marketValueSchema>;
export type LeaguePlayerDto = z.infer<typeof leaguePlayerSchema>;
export type PlayerStatsIndexDto = z.infer<typeof playerStatsIndexSchema>;
export type PlayerFixtureStatsDto = z.infer<typeof playerFixtureStatsSchema>;
export type PlayerMarketStatsDto = z.infer<typeof playerMarketStatsSchema>;
export type RecentMatchesDto = z.infer<typeof recentMatchesSchema>;
export type UpcomingMatchesDto = z.infer<typeof upcomingMatchesSchema>;
export type PlayerProfileDto = z.infer<typeof playerProfileSchema>;
export type PlayerDetailDto = z.infer<typeof playerDetailSchema>;
export type MarketSnapshotDto = z.infer<typeof marketSnapshotSchema>;
export type MarketHistoryDto = z.infer<typeof marketHistorySchema>;
export type PlayerTeamOffersDto = z.infer<typeof playerTeamOffersSchema>;
export type MarketMutationResultDto = z.infer<typeof marketMutationResultSchema>;
export type ShieldStatusDto = z.infer<typeof shieldStatusSchema>;
export type BuyoutMutationResultDto = z.infer<typeof buyoutMutationResultSchema>;
export type BidWriteDto = z.infer<typeof bidWriteSchema>;
export type ListingWriteDto = z.infer<typeof listingWriteSchema>;
export type DirectOfferWriteDto = z.infer<typeof directOfferWriteSchema>;
export type ImmediateSaleWriteDto = z.infer<typeof immediateSaleWriteSchema>;
export type AcceptOfferWriteDto = z.infer<typeof acceptOfferWriteSchema>;
export type PayBuyoutWriteDto = z.infer<typeof payBuyoutWriteSchema>;
export type IncreaseBuyoutWriteDto = z.infer<typeof increaseBuyoutWriteSchema>;
export type ShieldWriteDto = z.infer<typeof shieldWriteSchema>;

const scoreNumber = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]).transform(Number);
const builderCriterionSchema = readObject({
  ruleId: z.string(), source: z.string(), observed: z.string(),
  lineup: scoreNumber.nullable(), trading: scoreNumber.nullable(),
  lineupLower: scoreNumber, lineupUpper: scoreNumber,
  tradingLower: scoreNumber, tradingUpper: scoreNumber,
});
const builderSectionSchema = readObject({
  section: z.string(), criteria: z.array(builderCriterionSchema),
  lineupRaw: scoreNumber, tradingRaw: scoreNumber, lineupLower: scoreNumber,
  lineupUpper: scoreNumber, tradingLower: scoreNumber, tradingUpper: scoreNumber,
  lineupNormalized: scoreNumber, tradingNormalized: scoreNumber, effectiveWeight: scoreNumber,
});
const builderPlayerSchema = readObject({
  playerId: z.string().min(1), name: z.string(), position: z.number().int().min(1).max(4),
  clubId: z.number().int(), source: z.enum(["owned", "market", "opponents"]),
  playerTeamId: z.string().nullable(), marketValue: z.number().int().nonnegative(),
  lineupScore: scoreNumber, tradingScore: scoreNumber, combinedScore: scoreNumber,
  sections: z.array(builderSectionSchema), omissions: z.array(z.string()),
  protectionAdvice: z.boolean(), acquisitionMethod: z.enum(["bid", "clause"]).nullable(),
  settlementAt: z.string().nullable(), clausePrice: z.number().nullable(),
  saleSettlementAt: z.string().nullable(),
});
export const builderCandidateSchema = readObject({
  candidateId: z.string(), formation: z.string(), resourceGroup: z.enum(["owned", "external"]),
  starters: z.array(builderPlayerSchema).length(11), totalLineupScore: scoreNumber,
  tieBreak: z.number(), tradingPlan: readObject({
    acquisitions: z.array(builderPlayerSchema), tradingPurchases: z.array(builderPlayerSchema),
    sales: z.array(builderPlayerSchema), steps: z.array(readObject({
      action: z.enum(["sell", "buy"]), playerId: z.string(), method: z.string(),
      estimate: z.number().int(), settlementAt: z.string(), cashAfter: z.number().int(),
      squadValueAfter: z.number().int(), squadCountAfter: z.number().int(),
      debtLimit: z.number().int(), conditions: z.array(z.string()),
    })), retainedPlayerIds: z.array(z.string()), resultingPlayerIds: z.array(z.string()),
    projectedCash: z.number().int().nonnegative(), squadValue: z.number().int().nonnegative(),
    squadCount: z.number().int().max(24), reservedSquadSlots: z.number().int().nonnegative().default(0),
  }),
});
export const lineupBuildResponseSchema = responseSchema(readObject({
  buildId: z.string(), rulesVersion: z.string(), generatedAt: z.string(),
  leagueId: z.string(), teamId: z.string(), target: readObject({
    week: z.number().int().positive(), firstKickoff: z.string(), salesDeadline: z.string(),
    clausesDeadline: z.string(), protectionDeadline: z.string(),
  }), randomSeed: z.number().int(), searchComplete: z.boolean(),
  searchLimitReason: z.string().nullable(), evaluatedStates: z.number().int(),
  evaluatedPlayers: z.number().int(), candidates: z.array(builderCandidateSchema),
  diagnostics: z.array(readObject({ code: z.string(), playerId: z.string().nullable() })),
  explanationStatus: z.string(), explanations: z.record(z.string(), z.string()),
}));
export const lineupBuildRequestSchema = z.object({
  sources: z.array(z.enum(["owned", "market", "opponents"])).min(1).max(3),
  mandatoryPlayerIds: z.array(z.string().trim().min(1)).max(11), formations: z.array(z.string()),
  allowBuying: z.boolean(), allowSelling: z.boolean(), includeTradingPurchases: z.boolean(),
  maxCandidates: z.number().int().min(1).max(20),
  explanation: z.object({ enabled: z.boolean(), reasoningEffort: z.enum(["low", "medium", "high"]).optional() }).strict(),
}).strict().superRefine((value, ctx) => {
  for (const choices of [value.sources, value.mandatoryPlayerIds, value.formations]) {
    if (new Set(choices).size !== choices.length) ctx.addIssue({ code: "custom", message: "Duplicate choices" });
  }
  if (value.includeTradingPurchases && !value.allowBuying) ctx.addIssue({ code: "custom", message: "Buying permission required" });
});
export type LineupBuildDto = z.infer<typeof lineupBuildResponseSchema>;
export type BuilderCandidate = z.infer<typeof builderCandidateSchema>;
export type LineupBuildRequest = z.infer<typeof lineupBuildRequestSchema>;

export type ApiResponseDto =
  | LineupBuildDto
  | CompetitionStandingsDto
  | MeResponseDto
  | CredentialProbeResponseDto
  | LeaguesProbeResponseDto
  | HealthResponseDto
  | z.infer<typeof leaguesResponseSchema>
  | z.infer<typeof standingResponseSchema>
  | z.infer<typeof activityResponseSchema>
  | z.infer<typeof leagueTeamsResponseSchema>
  | TeamDetailDto
  | TeamMoneyDto
  | TeamLineupDto
  | CurrentWeekDto
  | z.infer<typeof fixturesResponseSchema>
  | z.infer<typeof matchStatsResponseSchema>
  | z.infer<typeof catalogPlayersResponseSchema>
  | z.infer<typeof marketValuesResponseSchema>
  | LeaguePlayerDto
  | PlayerStatsIndexDto
  | PlayerFixtureStatsDto
  | PlayerMarketStatsDto
  | RecentMatchesDto
  | UpcomingMatchesDto
  | PlayerProfileDto
  | PlayerDetailDto
  | MarketSnapshotDto
  | MarketHistoryDto
  | PlayerTeamOffersDto
  | MarketMutationResultDto
  | ShieldStatusDto
  | BuyoutMutationResultDto;

const mutationResponseSchema = marketMutationResultSchema;
const endpointContracts: Array<{
  method: string;
  path: RegExp;
  response: z.ZodType<ApiResponseDto>;
  request?: z.ZodType;
  query?: z.ZodType;
}> = [
  { method: "POST", path: /^\/api\/lineup-builder\/leagues\/[^/]+\/build$/, response: lineupBuildResponseSchema, request: lineupBuildRequestSchema },
  { method: "GET", path: /^\/api\/competitions\/\d+\/standings$/, response: competitionStandingsSchema, query: standingsQuerySchema },
  { method: "GET", path: /^\/api\/leagues$/, response: leaguesResponseSchema },
  { method: "GET", path: /^\/api\/leagues\/[^/]+\/standing$/, response: standingResponseSchema },
  { method: "GET", path: /^\/api\/leagues\/[^/]+\/standing\/\d+$/, response: standingResponseSchema },
  { method: "GET", path: /^\/api\/leagues\/[^/]+\/activity\/\d+$/, response: activityResponseSchema },
  { method: "GET", path: /^\/api\/leagues\/[^/]+\/teams$/, response: leagueTeamsResponseSchema },
  { method: "GET", path: /^\/api\/leagues\/[^/]+\/teams\/[^/]+$/, response: teamDetailResponseSchema },
  { method: "GET", path: /^\/api\/teams\/[^/]+\/money$/, response: teamMoneySchema },
  { method: "GET", path: /^\/api\/teams\/[^/]+\/lineup$/, response: teamLineupSchema },
  { method: "PUT", path: /^\/api\/teams\/[^/]+\/lineup$/, response: lineupMutationResponseSchema, request: lineupWriteSchema },
  { method: "GET", path: /^\/api\/teams\/[^/]+\/lineup\/week\/\d+$/, response: teamLineupSchema },
  { method: "GET", path: /^\/api\/calendar\/current$/, response: currentWeekSchema },
  { method: "GET", path: /^\/api\/calendar\/weeks\/\d+$/, response: fixturesResponseSchema },
  { method: "GET", path: /^\/api\/calendar\/weeks\/\d+\/stats$/, response: matchStatsResponseSchema },
  { method: "GET", path: /^\/api\/players$/, response: catalogPlayersResponseSchema },
  { method: "GET", path: /^\/api\/players\/[^/]+\/market-value$/, response: marketValuesResponseSchema },
  { method: "GET", path: /^\/api\/players\/[^/]+\/league\/[^/]+$/, response: leaguePlayerSchema },
  { method: "GET", path: /^\/api\/players\/[^/]+\/stats$/, response: playerStatsIndexSchema },
  { method: "GET", path: /^\/api\/players\/[^/]+\/stats\/detail$/, response: playerDetailSchema, query: playerStatsDetailQuerySchema },
  { method: "GET", path: /^\/api\/players\/[^/]+\/stats\/fixtures$/, response: playerFixtureStatsSchema, query: fixturesQuerySchema },
  { method: "GET", path: /^\/api\/players\/[^/]+\/stats\/market$/, response: playerMarketStatsSchema, query: marketQuerySchema },
  { method: "GET", path: /^\/api\/players\/[^/]+\/stats\/matches\/recent$/, response: recentMatchesSchema, query: recentQuerySchema },
  { method: "GET", path: /^\/api\/players\/[^/]+\/stats\/matches\/upcoming$/, response: upcomingMatchesSchema, query: upcomingQuerySchema },
  { method: "GET", path: /^\/api\/players\/[^/]+\/stats\/profile$/, response: playerProfileSchema },
  { method: "GET", path: /^\/api\/market\/leagues\/[^/]+$/, response: marketSnapshotSchema },
  { method: "GET", path: /^\/api\/market\/leagues\/[^/]+\/history$/, response: marketHistorySchema },
  { method: "GET", path: /^\/api\/market\/leagues\/[^/]+\/player-teams\/[^/]+\/offers$/, response: playerTeamOffersSchema },
  { method: "POST", path: /^\/api\/market\/leagues\/[^/]+\/[^/]+\/bids$/, response: mutationResponseSchema, request: bidWriteSchema },
  { method: "PUT", path: /^\/api\/market\/leagues\/[^/]+\/[^/]+\/bids\/[^/]+$/, response: mutationResponseSchema, request: bidWriteSchema },
  { method: "DELETE", path: /^\/api\/market\/leagues\/[^/]+\/[^/]+\/bids\/[^/]+$/, response: mutationResponseSchema },
  { method: "POST", path: /^\/api\/market\/leagues\/[^/]+\/listings$/, response: mutationResponseSchema, request: listingWriteSchema },
  { method: "POST", path: /^\/api\/market\/leagues\/[^/]+\/immediate-sales$/, response: mutationResponseSchema, request: immediateSaleWriteSchema },
  { method: "DELETE", path: /^\/api\/market\/leagues\/[^/]+\/[^/]+$/, response: mutationResponseSchema },
  { method: "POST", path: /^\/api\/market\/leagues\/[^/]+\/[^/]+\/offers\/[^/]+\/accept$/, response: mutationResponseSchema, request: acceptOfferWriteSchema },
  { method: "POST", path: /^\/api\/market\/leagues\/[^/]+\/[^/]+\/offers\/[^/]+\/reject$/, response: mutationResponseSchema },
  { method: "POST", path: /^\/api\/market\/leagues\/[^/]+\/direct-offers$/, response: mutationResponseSchema, request: directOfferWriteSchema },
  { method: "DELETE", path: /^\/api\/market\/leagues\/[^/]+\/[^/]+\/offers\/[^/]+$/, response: mutationResponseSchema },
  { method: "GET", path: /^\/api\/buyout\/leagues\/[^/]+\/player-teams\/[^/]+\/shield$/, response: shieldStatusSchema },
  { method: "POST", path: /^\/api\/buyout\/leagues\/[^/]+\/player-teams\/[^/]+\/pay$/, response: buyoutMutationResultSchema, request: payBuyoutWriteSchema },
  { method: "POST", path: /^\/api\/buyout\/leagues\/[^/]+\/player-teams\/[^/]+\/increase$/, response: buyoutMutationResultSchema, request: increaseBuyoutWriteSchema },
  { method: "PUT", path: /^\/api\/buyout\/leagues\/[^/]+\/shield$/, response: buyoutMutationResultSchema, request: shieldWriteSchema },
  { method: "GET", path: /^\/api\/me$/, response: meResponseSchema },
  { method: "GET", path: /^\/api\/laliga\/credential-probe$/, response: credentialProbeResponseSchema },
  { method: "GET", path: /^\/api\/laliga\/leagues-probe$/, response: leaguesProbeResponseSchema },
  { method: "GET", path: /^\/api\/health$/, response: healthResponseSchema },
  { method: "GET", path: /^\/api\/health\/live$/, response: healthResponseSchema },
  { method: "GET", path: /^\/api\/health\/ready$/, response: healthResponseSchema },
];

export function endpointResponseSchema(
  method: string,
  path: string,
): z.ZodType<ApiResponseDto> {
  const pathname = new URL(path, "http://localhost").pathname;
  const contract = endpointContracts.find(
    (candidate) => candidate.method === method && candidate.path.test(pathname),
  );
  if (!contract) throw new Error(`No response schema for ${method} ${pathname}`);
  return contract.response;
}

export function endpointRequestSchema(method: string, path: string): z.ZodType | null {
  const pathname = new URL(path, "http://localhost").pathname;
  const contract = endpointContracts.find(
    (candidate) => candidate.method === method && candidate.path.test(pathname),
  );
  if (!contract) throw new Error(`No endpoint schema for ${method} ${pathname}`);
  return contract.request ?? null;
}

export function serializeEndpointRequest(method: string, path: string, body: unknown): unknown {
  const checkedBody = endpointRequestSchema(method, path)?.parse(body);
  if (checkedBody === undefined) return undefined;

  const pathname = new URL(path, "http://localhost").pathname;
  if (method === "PUT" && /^\/api\/teams\/[^/]+\/lineup$/.test(pathname)) {
    const lineup = lineupWriteDtoSchema.parse(checkedBody);
    const { tacticalFormation, ...wireFields } = lineup;
    return { ...wireFields, tactical_formation: tacticalFormation };
  }
  if (method === "POST" && /^\/api\/lineup-builder\/leagues\/[^/]+\/build$/.test(pathname)) {
    const value = lineupBuildRequestSchema.parse(checkedBody);
    return { sources: value.sources, mandatory_player_ids: value.mandatoryPlayerIds,
      formations: value.formations, allow_buying: value.allowBuying, allow_selling: value.allowSelling,
      include_trading_purchases: value.includeTradingPurchases, max_candidates: value.maxCandidates,
      explanation: { enabled: value.explanation.enabled, reasoning_effort: value.explanation.reasoningEffort } };
  }
  return checkedBody;
}

const wireBooleanSchema = z.preprocess(
  (value) => typeof value === "string" ? value.toLowerCase() : value,
  z.enum(["true", "1", "y", "yes", "t", "on", "false", "0", "n", "no", "f", "off"])
    .transform((value) => ["true", "1", "y", "yes", "t", "on"].includes(value)),
);

/** Validate route, path and query before any network request. */
export function validateEndpointInput(method: string, path: string): void {
  if (!path.startsWith("/api/") || path.includes("#")) throw new Error("Invalid API path");
  const rawSegments = path.split("?")[0].split("/").slice(1);
  for (const part of rawSegments) pathSegmentSchema.parse(decodeURIComponent(part));
  const url = new URL(path, "http://localhost");
  const contract = endpointContracts.find((item) => item.method === method && item.path.test(url.pathname));
  if (!contract) throw new Error("Unregistered API endpoint");
  const week = url.pathname.match(/\/(?:standing|weeks|week)\/(\d+)(?:\/stats)?$/);
  if (week) positivePathNumberSchema.parse(Number(week[1]));
  const competition = url.pathname.match(/^\/api\/competitions\/(\d+)\/standings$/);
  if (competition) positivePathNumberSchema.parse(Number(competition[1]));
  const page = url.pathname.match(/\/activity\/(\d+)$/);
  if (page) z.number().int().nonnegative().parse(Number(page[1]));
  const query: Record<string, unknown> = {};
  const listFields = new Set(["competition", "include"]);
  for (const [wireKey, value] of url.searchParams) {
    if (wireKey === "includeStats" || wireKey === "includeWeather") throw new Error("Invalid wire query field");
    const key = wireKey.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    if (listFields.has(key)) {
      query[key] = [...(query[key] as string[] | undefined ?? []), value];
    } else {
      if (key in query) throw new Error("Duplicate query parameter");
      query[key] = ["last", "limit", "season"].includes(key) ? Number(value)
        : ["includeStats", "includeWeather"].includes(key)
          ? wireBooleanSchema.parse(value)
          : value;
    }
  }
  (contract.query ?? z.object({}).strict()).parse(query);
}
