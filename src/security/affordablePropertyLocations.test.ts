import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { insideLocationBounds } from '../../supabase/functions/_shared/addressGeocoding.ts';

// Windows checkouts with core.autocrlf get CRLF; the checks below expect LF.
const read = (name: string) =>
  readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const original = read('0020_affordable_properties.sql');
const migration = read('0029_affordable_property_locations.sql');
const DOLORES = 'dd2cd8f6-6bd1-46be-b3ad-a20c3725f155';

/** The select list of the public view, whitespace-normalized. */
function publicViewColumns(sql: string): string {
  const start = sql.indexOf('create or replace view public.affordable_properties_public');
  const select = sql.indexOf('select', start);
  const from = sql.indexOf('from public.affordable_properties p', select);
  return sql.slice(select + 'select'.length, from).replace(/\s+/g, ' ').trim();
}

describe('affordable-property location migration', () => {
  it('is additive and runs in one transaction', () => {
    expect(migration.trimStart()).toMatch(/^--/);
    expect(migration).toMatch(/\nbegin;\n/);
    expect(migration.trimEnd()).toMatch(/commit;$/);
    expect(migration).not.toMatch(/drop column|drop table|alter column/i);
  });

  it('grants visitors the location columns and nothing else', () => {
    const grants = migration.match(/grant select \([^)]*\)\s+on public\.affordable_properties to [^;]+;/g) ?? [];
    expect(grants).toHaveLength(1);
    expect(grants[0].replace(/\s+/g, ' ')).toBe(
      'grant select (latitude, longitude, location_source, location_checked_on) on public.affordable_properties to anon, authenticated;',
    );
    expect(migration).not.toMatch(/grant select on public\.affordable_properties\b(?!_)/);
    expect(publicViewColumns(migration)).not.toContain('internal_notes');
  });

  it('keeps the public view columns from 0020 in order and appends the location', () => {
    const before = publicViewColumns(original);
    const after = publicViewColumns(migration);
    expect(after.startsWith(before)).toBe(true);
    expect(after.slice(before.length).trim()).toBe(
      ', p.latitude, p.longitude, p.location_source, p.location_checked_on',
    );
  });

  it('rebuilds the admin view from the admin-only row function', () => {
    const adminStart = migration.indexOf('create view public.affordable_properties_admin');
    expect(adminStart).toBeGreaterThan(migration.indexOf('drop view public.affordable_properties_admin'));
    expect(migration.slice(adminStart)).toContain('from app_private.affordable_properties_admin_rows() p');
    expect(migration).toContain('grant select on public.affordable_properties_admin to authenticated;');
    expect(migration).not.toMatch(/grant select on public\.affordable_properties_admin to [^;]*anon/);
  });

  // The values came from src/data/affordablePropertyLocations.json, which was
  // removed once the records carried them; production matched it on 2026-10-30.
  it('copies 11 saved map coordinates, without Dolores Apartments, and never overwrites a pin', () => {
    const rows = [...migration.matchAll(/\('([0-9a-f-]{36})'::uuid, (-?[\d.]+), (-?[\d.]+), date '(\d{4}-\d{2}-\d{2})'\)/g)];
    const ids = rows.map(([, id]) => id);
    expect(rows).toHaveLength(11);
    expect(new Set(ids).size).toBe(11);
    expect(ids).not.toContain(DOLORES);
    for (const [, , lat, lng, checkedOn] of rows) {
      expect(insideLocationBounds(Number(lat), Number(lng))).toBe(true);
      expect(checkedOn).toBe('2026-10-27');
    }
    expect(migration).toMatch(/where p\.id = v\.id\s+and p\.latitude is null;/);
  });
});
