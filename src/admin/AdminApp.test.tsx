import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import AdminApp from './AdminApp';

describe('deferred admin routing', () => {
  it('matches the admin login route inside the outer admin wildcard', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/admin/login']}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
        </Routes>
      </MemoryRouter>,
    );

    // AdminLogin is lazy, so renderToString emits the Suspense fallback. An
    // empty string means the descendant route table failed to match at all.
    expect(html).toContain('Loading');
  });
});
