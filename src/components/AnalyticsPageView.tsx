import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  PUBLIC_ANALYTICS_PAGES,
  capturePublicPageView,
} from '../lib/analytics';

export default function AnalyticsPageView() {
  const { pathname } = useLocation();
  const lastPage = useRef<string | null>(null);

  useEffect(() => {
    const page = PUBLIC_ANALYTICS_PAGES[pathname as keyof typeof PUBLIC_ANALYTICS_PAGES];
    if (!page || lastPage.current === pathname) return;
    lastPage.current = pathname;
    capturePublicPageView(page);
  }, [pathname]);

  return null;
}
