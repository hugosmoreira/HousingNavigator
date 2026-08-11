import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/0019_resource_service_areas.sql', import.meta.url),
  'utf8',
);

describe('resource service-area database contract', () => {
  it('uses a cascading normalized relation with indexed state/county lookup', () => {
    expect(migration).toContain('create table if not exists public.resource_service_areas');
    expect(migration).toContain('references public.resources(id) on delete cascade');
    expect(migration).toContain('resource_service_areas_lookup_idx');
  });

  it('keeps public reads published-only and mutations admin-only', () => {
    expect(migration).toContain('resource_service_areas_public_read');
    expect(migration).toMatch(/r\.published\s*=\s*true/);
    expect(migration).toContain('resource_service_areas_admin_insert');
    expect(migration).toContain('with check (public.is_admin())');
    expect(migration).toContain('resource_service_areas_admin_delete');
  });

  it('validates the full replacement before deleting existing areas', () => {
    const validation = migration.indexOf('unsupported Oregon or Washington service area');
    const deletion = migration.indexOf('delete from public.resource_service_areas');
    expect(validation).toBeGreaterThan(0);
    expect(deletion).toBeGreaterThan(validation);
    expect(migration).toContain('service areas must contain between 1 and 80 entries');
  });

  it('exposes aggregated service areas without exposing internal notes publicly', () => {
    const publicViewStart = migration.indexOf('create or replace view public.resources_public');
    const adminViewStart = migration.indexOf('create or replace view public.resources_admin');
    const publicView = migration.slice(publicViewStart, adminViewStart);
    expect(publicView).toContain("as service_areas");
    expect(publicView).not.toContain('internal_notes');
    expect(migration.slice(adminViewStart)).toContain('app_private.resources_admin_rows()');
  });
});
