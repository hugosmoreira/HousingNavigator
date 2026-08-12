import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/0020_affordable_properties.sql', import.meta.url),
  'utf8',
);

describe('affordable-property database contract', () => {
  it('keeps properties, resources, and waitlist status in separate structures', () => {
    expect(migration).toContain('create table if not exists public.affordable_properties');
    expect(migration).toContain('add column if not exists waitlist_type');
    expect(migration).toContain('add column if not exists affordable_property_id');
    expect(migration).toContain('waitlists_affordable_property_unique_idx');
  });

  it('restricts mutations and internal data to administrators', () => {
    expect(migration).toContain('affordable_properties_admin_insert');
    expect(migration).toContain('with check (public.is_admin())');
    expect(migration).toContain('affordable_properties_admin_delete');
    const publicStart = migration.indexOf('create or replace view public.affordable_properties_public');
    const adminStart = migration.indexOf('create or replace view public.affordable_properties_admin');
    expect(migration.slice(publicStart, adminStart)).not.toContain('internal_notes');
    expect(migration.slice(adminStart)).toContain('app_private.affordable_properties_admin_rows()');
  });

  it('uses a server-side admin check for atomic waitlist linking', () => {
    expect(migration).toContain('replace_affordable_property_waitlist');
    expect(migration).toContain("if not public.is_admin() then");
    expect(migration).toContain("set affordable_property_id = null");
    expect(migration).toContain("waitlist_type = 'affordable_property'");
  });
});
