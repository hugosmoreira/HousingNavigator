import { useEffect, useState } from 'react';
import { dataService } from '../services/data';
import { getRecommendations } from '../utils/recommendationEngine';
import type { IntakeState, RecommendationResult } from '../types';

interface RecommendationState {
  result: RecommendationResult | null;
  loading: boolean;
  error: Error | null;
}

function isReady(intake: IntakeState): boolean {
  return (
    intake.county !== null &&
    intake.situation !== null &&
    intake.goal !== null &&
    intake.householdType !== null
  );
}

/**
 * Loads programs + decision rules and runs the recommendation engine
 * for the given intake. Returns `result: null` while data is loading or
 * if the intake is incomplete.
 */
export function useRecommendationResult(intake: IntakeState): RecommendationState {
  const [state, setState] = useState<RecommendationState>({
    result: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!isReady(intake)) {
      setState({ result: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    Promise.all([dataService.getPrograms(), dataService.getDecisionRules()])
      .then(([programs, rules]) => {
        if (cancelled) return;
        const result = getRecommendations(intake, programs, rules);
        setState({ result, loading: false, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ result: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, [intake]);

  return state;
}
