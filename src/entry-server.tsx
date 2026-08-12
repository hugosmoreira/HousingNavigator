import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import AppServer from './AppServer';
import AnalyticsPageView from './components/AnalyticsPageView';
import { STATIC_AFFORDABLE_PROPERTIES, STATIC_PROGRAMS, STATIC_WAITLISTS } from './services/data/staticDataService';
import { affordablePropertyPath, resourcePath, waitlistPath } from './lib/entityRoutes';
import {
  INDEXABLE_PAGE_METADATA,
  resolvePageMetadata,
  type ResolvedPageMetadata,
} from './lib/pageMetadata';
import {
  resolveStructuredData,
  type StructuredDataDocument,
} from './lib/structuredData';

export const prerenderRoutes = [
  ...Object.keys(INDEXABLE_PAGE_METADATA).map((path) =>
    path === '/' ? '/' : `${path}/`,
  ),
  ...STATIC_PROGRAMS.map(resourcePath),
  ...STATIC_WAITLISTS.map(waitlistPath),
  ...STATIC_AFFORDABLE_PROPERTIES.map(affordablePropertyPath),
];

export function render(url: string): string {
  return renderToString(
    <StrictMode>
      <StaticRouter location={url}>
        <AnalyticsPageView />
        <AppServer />
      </StaticRouter>
    </StrictMode>,
  );
}

export function metadataFor(url: string): ResolvedPageMetadata {
  return resolvePageMetadata(url);
}

export function structuredDataFor(url: string): StructuredDataDocument | null {
  return resolveStructuredData(url);
}
