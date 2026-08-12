import { useEffect, useState } from 'react';
import { dataService } from '../services/data';
import { STATIC_AFFORDABLE_PROPERTIES } from '../services/data/staticDataService';
import { scheduleIdleWork } from '../lib/scheduleIdleWork';
import type { AffordableProperty } from '../types';

interface AffordablePropertiesState {
  properties: AffordableProperty[];
  loading: boolean;
  error: Error | null;
}

export function useAffordableProperties(): AffordablePropertiesState {
  const [state, setState] = useState<AffordablePropertiesState>({
    properties: STATIC_AFFORDABLE_PROPERTIES,
    loading: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const cancelIdleWork = scheduleIdleWork(() => {
      dataService
        .getAffordableProperties()
        .then((properties) => {
          if (!cancelled) setState({ properties, loading: false, error: null });
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
