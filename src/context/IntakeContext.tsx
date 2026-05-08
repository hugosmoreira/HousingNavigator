/**
 * IntakeContext — holds the user's Assessment answers so the Results
 * screen (and anything else downstream) can read them without prop
 * drilling.
 *
 * Persistence: sessionStorage under `hn.intake.v1`. Cleared when the
 * browser tab closes. Refresh-safe within a session.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { IntakeState } from '../types';

const STORAGE_KEY = 'hn.intake.v1';

const EMPTY_INTAKE: IntakeState = {
  county: null,
  situation: null,
  goal: null,
  householdType: null,
  urgentHelp: false,
};

interface IntakeContextValue {
  intake: IntakeState;
  setIntake: (next: IntakeState) => void;
  updateIntake: (partial: Partial<IntakeState>) => void;
  resetIntake: () => void;
  isComplete: boolean;
}

const IntakeContext = createContext<IntakeContextValue | undefined>(undefined);

function loadFromSession(): IntakeState {
  if (typeof window === 'undefined') return EMPTY_INTAKE;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_INTAKE;
    const parsed = JSON.parse(raw) as Partial<IntakeState>;
    return { ...EMPTY_INTAKE, ...parsed };
  } catch {
    return EMPTY_INTAKE;
  }
}

function saveToSession(intake: IntakeState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intake));
  } catch {
    // Ignore quota / privacy-mode errors — the in-memory copy is still valid.
  }
}

export function IntakeProvider({ children }: { children: ReactNode }) {
  const [intake, setIntakeState] = useState<IntakeState>(() => loadFromSession());

  useEffect(() => {
    saveToSession(intake);
  }, [intake]);

  const setIntake = useCallback((next: IntakeState) => {
    setIntakeState(next);
  }, []);

  const updateIntake = useCallback((partial: Partial<IntakeState>) => {
    setIntakeState((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetIntake = useCallback(() => {
    setIntakeState(EMPTY_INTAKE);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // noop
      }
    }
  }, []);

  const isComplete = useMemo(
    () =>
      intake.county !== null &&
      intake.situation !== null &&
      intake.goal !== null &&
      intake.householdType !== null,
    [intake],
  );

  const value = useMemo<IntakeContextValue>(
    () => ({ intake, setIntake, updateIntake, resetIntake, isComplete }),
    [intake, setIntake, updateIntake, resetIntake, isComplete],
  );

  return <IntakeContext.Provider value={value}>{children}</IntakeContext.Provider>;
}

export function useIntake(): IntakeContextValue {
  const ctx = useContext(IntakeContext);
  if (!ctx) {
    throw new Error('useIntake must be used within an IntakeProvider');
  }
  return ctx;
}
