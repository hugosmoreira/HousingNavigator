/**
 * Deterministic recommendation engine for Housing Navigator.
 *
 * Given an intake answer set plus a program catalog and rule set,
 * return a prioritized list of programs plus the decision rule that
 * drove the ranking. Pure functions only — no I/O, no side effects.
 *
 * Data is injected by the caller (see `src/services/data`) so this
 * module is trivial to unit-test and is unaffected by the static-vs-
 * Supabase adapter swap.
 */

import type {
  DecisionRule,
  IntakeState,
  Program,
  ProgramCategory,
  Recommendation,
  RecommendationResult,
} from '../types';

const MAX_PRIMARY_RESULTS = 5;
const MAX_SECONDARY_RESULTS = 4;

/** Score bonuses/penalties — tuned together; see tests before changing. */
const SCORE = {
  PRIMARY_CATEGORY: 100,
  SECONDARY_CATEGORY: 50,
  HOUSEHOLD_MATCH: 10,
  LONG_TERM_WAITLIST_BOOST: 15,
  URGENT_OPEN_BOOST: 25,
  URGENT_CLOSED_PENALTY: -40,
  STATUS_UNKNOWN_PENALTY: -30,
  STATUS_CLOSED_PENALTY: -20,
} as const;

const LONG_TERM_BOOSTED_CATEGORIES: ProgramCategory[] = [
  'long_term_housing_waitlist',
  'transitional_housing',
];

const URGENT_BOOSTED_CATEGORIES: ProgramCategory[] = [
  'emergency_shelter',
  'comprehensive_support',
];

/**
 * Finds the decision rule for a given (situation, goal) pair.
 *
 * Throws if no rule matches — this indicates a data bug rather than a
 * user-facing error, since `intakeMapping.ts` is guaranteed to produce
 * pairs that exist in the rule set.
 */
export function resolveRule(intake: IntakeState, rules: DecisionRule[]): DecisionRule {
  if (!intake.situation || !intake.goal) {
    throw new Error('resolveRule: intake.situation and intake.goal are required');
  }
  const match = rules.find(
    (r) => r.intake_state === intake.situation && r.goal === intake.goal,
  );
  if (!match) {
    throw new Error(
      `resolveRule: no decision rule for situation="${intake.situation}" goal="${intake.goal}"`,
    );
  }
  return match;
}

function scoreProgram(
  program: Program,
  intake: IntakeState,
  rule: DecisionRule,
): Recommendation {
  let score = program.priority_score;
  let matchedCategory: Recommendation['matchedCategory'] = 'none';

  if (rule.priority_categories.includes(program.category)) {
    score += SCORE.PRIMARY_CATEGORY;
    matchedCategory = 'primary';
  } else if (rule.secondary_categories.includes(program.category)) {
    score += SCORE.SECONDARY_CATEGORY;
    matchedCategory = 'secondary';
  }

  if (intake.householdType && program.who_it_helps.includes(intake.householdType)) {
    score += SCORE.HOUSEHOLD_MATCH;
  }

  // Goal nudge: push waitlist/transitional programs up when the user's
  // goal is long-term housing, so they appear above short-term options.
  if (
    intake.goal === 'long_term_housing' &&
    LONG_TERM_BOOSTED_CATEGORIES.includes(program.category)
  ) {
    score += SCORE.LONG_TERM_WAITLIST_BOOST;
  }

  // Urgency nudge: when the user marked "need help today", surface
  // programs that can actually take them today and push closed/waitlist
  // options further down even if they would otherwise score well.
  if (intake.urgentHelp) {
    if (URGENT_BOOSTED_CATEGORIES.includes(program.category) && program.status === 'open') {
      score += SCORE.URGENT_OPEN_BOOST;
    }
    if (program.status === 'closed' || program.status === 'waitlist') {
      score += SCORE.URGENT_CLOSED_PENALTY;
    }
  }

  if (program.status === 'unknown') {
    score += SCORE.STATUS_UNKNOWN_PENALTY;
  } else if (program.status === 'closed') {
    score += SCORE.STATUS_CLOSED_PENALTY;
  }

  return { program, score, matchedCategory };
}

/**
 * Returns the top recommendations for an intake.
 *
 * Split into a primary list (category matches, capped at 5) and a
 * secondary list (useful-but-tangential matches) so the Results screen
 * can render them in separate sections.
 */
export function getRecommendations(
  intake: IntakeState,
  programs: Program[],
  rules: DecisionRule[],
): RecommendationResult {
  const rule = resolveRule(intake, rules);

  const countyFiltered =
    intake.county && intake.county !== 'Other'
      ? programs.filter((p) => p.county === intake.county)
      : programs;

  const scored = countyFiltered
    .map((p) => scoreProgram(p, intake, rule))
    .sort((a, b) => b.score - a.score);

  const primary = scored
    .filter((r) => r.matchedCategory === 'primary')
    .slice(0, MAX_PRIMARY_RESULTS);

  const secondary = scored
    .filter((r) => r.matchedCategory === 'secondary')
    .slice(0, MAX_SECONDARY_RESULTS);

  // Safety net: if a county has zero primary matches (sparse seed data),
  // fall back to the highest-scoring programs overall so the user always
  // sees something actionable.
  const recommendations =
    primary.length > 0 ? primary : scored.slice(0, MAX_PRIMARY_RESULTS);

  return {
    rule,
    recommendations,
    secondaryRecommendations: secondary,
  };
}
