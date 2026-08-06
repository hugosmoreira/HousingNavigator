import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import App from './App';
import AnalyticsPageView from './components/AnalyticsPageView';
import { STATIC_PROGRAMS, STATIC_WAITLISTS } from './services/data/staticDataService';
import { resourcePath, waitlistPath } from './lib/entityRoutes';
import {
  INDEXABLE_PAGE_METADATA,
  resolvePageMetadata,
  type ResolvedPageMetadata,
} from './lib/pageMetadata';

export const prerenderRoutes = [
  ...Object.keys(INDEXABLE_PAGE_METADATA).map((path) =>
    path === '/' ? '/' : `${path}/`,
  ),
  ...STATIC_PROGRAMS.map(resourcePath),
  ...STATIC_WAITLISTS.map(waitlistPath),
];

export function render(url: string): string {
  return renderToString(
    <StrictMode>
      <StaticRouter location={url}>
        <AnalyticsPageView />
        <App />
      </StaticRouter>
    </StrictMode>,
  );
}

export function metadataFor(url: string): ResolvedPageMetadata {
  return resolvePageMetadata(url);
}
