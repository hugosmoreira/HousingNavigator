import { useEffect, useState } from 'react';
import { dataService } from '../services/data';
import { STATIC_PROGRAMS } from '../services/data/staticDataService';
import { scheduleIdleWork } from '../lib/scheduleIdleWork';
import type { Program } from '../types';

interface ProgramsState {
  programs: Program[];
  loading: boolean;
  error: Error | null;
}

export function usePrograms(): ProgramsState {
  const [state, setState] = useState<ProgramsState>({
    programs: STATIC_PROGRAMS,
    loading: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const cancelIdleWork = scheduleIdleWork(() => {
      dataService
        .getPrograms()
        .then((programs) => {
          if (!cancelled) setState({ programs, loading: false, error: null });
        })
        .catch((error: Error) => {
          if (!cancelled) {
            setState((current) => ({ ...current, loading: false, error }));
          }
        });
    });
    return () => {
      cancelled = true;
      cancelIdleWork();
    };
  }, []);

  return state;
}
