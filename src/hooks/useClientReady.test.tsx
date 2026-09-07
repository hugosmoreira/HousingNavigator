import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { useClientReady } from './useClientReady';

it('uses the stable prerender snapshot during server rendering', () => {
  function Probe() { return <span>{useClientReady() ? 'browser' : 'prerender'}</span>; }
  expect(renderToStaticMarkup(<Probe />)).toBe('<span>prerender</span>');
});
