import { useEffect, useState } from 'react';
import { dataService } from '../services/data';
import type { Program } from '../types';

interface ProgramsState {
  programs: Program[];
  loading: boolean;
  error: Error | null;
}

export function usePrograms(): ProgramsState {
  const [state, setState] = useState<ProgramsState>({
    programs: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    dataService
      .getPrograms()
      .then((programs) => {
        if (!cancelled) setState({ programs, loading: false, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ programs: [], loading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
