import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  analyticsPageForPath,
  capturePublicPageView,
} from '../lib/analytics';
import { scheduleIdleWork } from '../lib/scheduleIdleWork';

export default function AnalyticsPageView() {
  const { pathname } = useLocation();
  const lastPage = useRef<string | null>(null);

  useEffect(() => {
    const page = analyticsPageForPath(pathname);
    if (!page || lastPage.current === pathname) return;
    lastPage.current = pathname;
    return scheduleIdleWork(() => capturePublicPageView(page), {
      timeout: 2_000,
      fallbackDelay: 750,
    });
  }, [pathname]);

  return null;
}
