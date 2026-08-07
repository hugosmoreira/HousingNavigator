import { useEffect, useState } from 'react';
import { dataService } from '../services/data';
import { STATIC_WAITLISTS } from '../services/data/staticDataService';
import { scheduleIdleWork } from '../lib/scheduleIdleWork';
import type { WaitlistEntry } from '../types';

interface WaitlistsState {
  waitlists: WaitlistEntry[];
  loading: boolean;
  error: Error | null;
}

export function useWaitlists(): WaitlistsState {
  const [state, setState] = useState<WaitlistsState>({
    waitlists: STATIC_WAITLISTS,
    loading: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const cancelIdleWork = scheduleIdleWork(() => {
      dataService
        .getWaitlists()
        .then((waitlists) => {
          if (!cancelled) setState({ waitlists, loading: false, error: null });
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
