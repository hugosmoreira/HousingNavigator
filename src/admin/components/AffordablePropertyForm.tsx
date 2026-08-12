import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AFFORDABLE_PROPERTY_TYPES,
  AFFORDABLE_PROPERTY_TYPE_LABELS,
  AMI_LEVELS,
  BEDROOM_LABELS,
  BEDROOM_TYPES,
  PROPERTY_AUDIENCE_LABELS,
  PROPERTY_AUDIENCES,
} from '../../data/affordableHousing';
import { COUNTIES_BY_STATE, SUPPORTED_STATES } from '../../data/serviceAreas';
import { requireSupabase } from '../../lib/supabaseClient';
import type { AffordablePropertyRow, WaitlistRow } from '../../services/data/dbTypes';
import type { BedroomType, PropertyAudience, SupportedState } from '../../types';
import { Field, Select, TextArea, TextInput, Toggle } from './FormField';

type PropertyDraft = Omit<
  AffordablePropertyRow,
  'id' | 'created_at' | 'updated_at' | 'waitlist_id' | 'waitlist_status' |
  'waitlist_last_checked' | 'waitlist_application_link' | 'linked_waitlist_id'
> & { linked_waitlist_id: string | null };

const EMPTY: PropertyDraft = {
  name: '',
  owner_organization: '',
  management_company: '',
  property_type: 'affordable_apartments',
  address: '',
  city: '',
  county: 'Multnomah',
  state: 'OR',
  postal_code: '',
  description: '',
  eligibility_summary: '',
  ami_levels: [],
  bedroom_types: [],
  audiences: ['general'],
  total_units: null,
  accessibility_notes: '',
  phone: '',
  website: '',
  application_url: '',
  source_url: '',
  source_type: 'Official owner or manager website',
  last_verified: null,
  public_notes: '',
  internal_notes: '',
  priority_score: 0,
  published: false,
  linked_waitlist_id: null,
};

export default function AffordablePropertyForm({
  mode,
  propertyId,
}: {
  mode: 'new' | 'edit';
  propertyId?: string;
}) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<PropertyDraft>(EMPTY);
  const [waitlists, setWaitlists] = useState<WaitlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const client = await requireSupabase();
        const propertyRequest = mode === 'edit' && propertyId
          ? client.from('affordable_properties_admin').select('*').eq('id', propertyId).maybeSingle()
          : Promise.resolve({ data: null, error: null });
        const [propertyResult, waitlistResult] = await Promise.all([
          propertyRequest,
          client.from('waitlists_admin').select('*').order('housing_authority'),
        ]);
        if (propertyResult.error) throw propertyResult.error;
        if (waitlistResult.error) throw waitlistResult.error;
        if (!active) return;
        setWaitlists((waitlistResult.data ?? []) as WaitlistRow[]);
        if (mode === 'edit') {
          if (!propertyResult.data) throw new Error('Affordable property not found');
          const row = propertyResult.data as AffordablePropertyRow;
          setDraft({
            name: row.name,
            owner_organization: row.owner_organization ?? '',
            management_company: row.management_company ?? '',
            property_type: row.property_type,
            address: row.address ?? '',
            city: row.city,
            county: row.county,
            state: row.state,
            postal_code: row.postal_code ?? '',
            description: row.description ?? '',
            eligibility_summary: row.eligibility_summary ?? '',
            ami_levels: row.ami_levels ?? [],
            bedroom_types: row.bedroom_types ?? [],
            audiences: row.audiences ?? [],
            total_units: row.total_units,
            accessibility_notes: row.accessibility_notes ?? '',
            phone: row.phone ?? '',
            website: row.website ?? '',
            application_url: row.application_url ?? '',
            source_url: row.source_url ?? '',
            source_type: row.source_type ?? '',
            last_verified: row.last_verified,
            public_notes: row.public_notes ?? '',
            internal_notes: row.internal_notes ?? '',
            priority_score: row.priority_score,
            published: row.published,
            linked_waitlist_id: row.linked_waitlist_id ?? null,
          });
        }
      } catch (err) {
        if (active) setError(messageFor(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [mode, propertyId]);

  const availableWaitlists = useMemo(
    () => waitlists.filter((row) => !row.affordable_property_id || row.affordable_property_id === propertyId),
    [waitlists, propertyId],
  );

  function update<K extends keyof PropertyDraft>(key: K, value: PropertyDraft[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  function changeState(state: SupportedState) {
    update('state', state);
    if (!COUNTIES_BY_STATE[state].includes(draft.county)) {
      update('county', COUNTIES_BY_STATE[state][0]);
    }
  }

  function toggleArray<T extends string>(values: T[], value: T): T[] {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const client = await requireSupabase();
      const payload = sanitize(draft);
      let id = propertyId;
      if (mode === 'new') {
        const shouldPublish = payload.published;
        const { linked_waitlist_id: _linked, ...insertPayload } = payload;
        const { data, error: insertError } = await client
          .from('affordable_properties')
          .insert({ ...insertPayload, published: false })
          .select('id')
          .single();
        if (insertError) throw insertError;
        id = (data as { id: string }).id;
        await replaceWaitlist(client, id, payload.linked_waitlist_id);
        if (shouldPublish) {
          const { error: publishError } = await client
            .from('affordable_properties')
            .update({ published: true })
            .eq('id', id);
          if (publishError) throw publishError;
        }
      } else if (id) {
        const { linked_waitlist_id, ...updatePayload } = payload;
        const { error: updateError } = await client
          .from('affordable_properties')
          .update(updatePayload)
          .eq('id', id);
        if (updateError) throw updateError;
        await replaceWaitlist(client, id, linked_waitlist_id);
      }
      navigate(mode === 'new' && id ? `/admin/properties/${id}/edit` : '/admin/properties', { replace: true });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!propertyId || !window.confirm('Delete this affordable property? This cannot be undone.')) return;
    setSaving(true);
    try {
      const client = await requireSupabase();
      const { error: deleteError } = await client.from('affordable_properties').delete().eq('id', propertyId);
      if (deleteError) throw deleteError;
      navigate('/admin/properties');
    } catch (err) {
      setError(messageFor(err));
      setSaving(false);
    }
  }

  if (loading) return <p className="mx-auto max-w-4xl px-6 py-16 text-on-surface-variant">Loading…</p>;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10">
      <Link to="/admin/properties" className="mb-6 inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
        <ArrowLeft className="h-4 w-4" /> Back to affordable housing
      </Link>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-bold tracking-tight">{mode === 'new' ? 'New affordable property' : 'Edit affordable property'}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Physical apartment information only. Assistance programs stay under Resources.</p>
        </div>
        <Toggle label={draft.published ? 'Published' : 'Draft'} hint={draft.published ? 'Visible on the public site.' : 'Hidden until published.'} checked={draft.published} onChange={(value) => update('published', value)} />
      </div>
      {error && <div className="mb-6 rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-9">
        <Section title="Identity">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Property name" required><TextInput value={draft.name} onChange={(e) => update('name', e.target.value)} required /></Field>
            <Field label="Housing type" required><Select value={draft.property_type} onChange={(e) => update('property_type', e.target.value as PropertyDraft['property_type'])}>{AFFORDABLE_PROPERTY_TYPES.map((type) => <option key={type} value={type}>{AFFORDABLE_PROPERTY_TYPE_LABELS[type]}</option>)}</Select></Field>
            <Field label="Owner organization"><TextInput value={draft.owner_organization ?? ''} onChange={(e) => update('owner_organization', e.target.value)} /></Field>
            <Field label="Management company"><TextInput value={draft.management_company ?? ''} onChange={(e) => update('management_company', e.target.value)} /></Field>
          </div>
        </Section>

        <Section title="Location">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Street address"><TextInput value={draft.address ?? ''} onChange={(e) => update('address', e.target.value)} /></Field>
            <Field label="City" required><TextInput value={draft.city} onChange={(e) => update('city', e.target.value)} required /></Field>
            <Field label="State" required><Select value={draft.state} onChange={(e) => changeState(e.target.value as SupportedState)}>{SUPPORTED_STATES.map((state) => <option key={state} value={state}>{state}</option>)}</Select></Field>
            <Field label="County" required><Select value={draft.county} onChange={(e) => update('county', e.target.value)}>{COUNTIES_BY_STATE[draft.state].map((county) => <option key={county} value={county}>{county}</option>)}</Select></Field>
            <Field label="ZIP code"><TextInput value={draft.postal_code ?? ''} onChange={(e) => update('postal_code', e.target.value)} /></Field>
            <Field label="Total apartments"><TextInput type="number" min={1} value={draft.total_units ?? ''} onChange={(e) => update('total_units', e.target.value ? Number(e.target.value) : null)} /></Field>
          </div>
        </Section>

        <Section title="Public information">
          <Field label="Description" hint="Plain language: what the property is, where it is, and what makes it useful." required><TextArea value={draft.description ?? ''} onChange={(e) => update('description', e.target.value)} required /></Field>
          <Field label="Who may qualify" hint="State only rules supported by an official source."><TextArea value={draft.eligibility_summary ?? ''} onChange={(e) => update('eligibility_summary', e.target.value)} /></Field>
          <Field label="Accessibility information"><TextArea value={draft.accessibility_notes ?? ''} onChange={(e) => update('accessibility_notes', e.target.value)} /></Field>
          <Field label="Before you apply"><TextArea value={draft.public_notes ?? ''} onChange={(e) => update('public_notes', e.target.value)} /></Field>
        </Section>

        <Section title="Apartment sizes and eligibility">
          <CheckboxGroup label="Bedrooms" values={BEDROOM_TYPES} selected={draft.bedroom_types} labelFor={(value) => BEDROOM_LABELS[value]} onToggle={(value) => update('bedroom_types', toggleArray(draft.bedroom_types, value))} />
          <CheckboxGroup label="Income limits (AMI)" values={[...AMI_LEVELS]} selected={draft.ami_levels} labelFor={(value) => `${value}% AMI`} onToggle={(value) => update('ami_levels', toggleNumber(draft.ami_levels, value))} />
          <CheckboxGroup label="Intended audiences" values={PROPERTY_AUDIENCES} selected={draft.audiences} labelFor={(value) => PROPERTY_AUDIENCE_LABELS[value]} onToggle={(value) => update('audiences', toggleArray(draft.audiences, value))} />
        </Section>

        <Section title="Contact and verification">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone"><TextInput type="tel" value={draft.phone ?? ''} onChange={(e) => update('phone', e.target.value)} /></Field>
            <Field label="Property website"><TextInput type="url" value={draft.website ?? ''} onChange={(e) => update('website', e.target.value)} /></Field>
            <Field label="Application or availability URL"><TextInput type="url" value={draft.application_url ?? ''} onChange={(e) => update('application_url', e.target.value)} /></Field>
            <Field label="Official source URL" required><TextInput type="url" value={draft.source_url ?? ''} onChange={(e) => update('source_url', e.target.value)} required /></Field>
            <Field label="Source type"><TextInput value={draft.source_type ?? ''} onChange={(e) => update('source_type', e.target.value)} /></Field>
            <Field label="Last verified"><TextInput type="date" value={draft.last_verified ?? ''} onChange={(e) => update('last_verified', e.target.value || null)} /></Field>
          </div>
          <Field label="Linked waitlist" hint="Optional. This supplies the current application status and alert page.">
            <Select value={draft.linked_waitlist_id ?? ''} onChange={(e) => update('linked_waitlist_id', e.target.value || null)}>
              <option value="">No linked waitlist</option>
              {availableWaitlists.map((row) => <option key={row.id} value={row.id}>{row.housing_authority}{row.program_name ? ` — ${row.program_name}` : ''} ({row.status})</option>)}
            </Select>
          </Field>
        </Section>

        <Section title="Administration">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Priority score"><TextInput type="number" value={draft.priority_score} onChange={(e) => update('priority_score', Number(e.target.value) || 0)} /></Field>
          </div>
          <Field label="Internal notes" hint="Administrator-only; never public."><TextArea value={draft.internal_notes ?? ''} onChange={(e) => update('internal_notes', e.target.value)} /></Field>
        </Section>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-surface-container-highest pt-5">
          {mode === 'edit' ? <button type="button" onClick={handleDelete} disabled={saving} className="text-sm font-semibold text-error hover:underline disabled:opacity-60">Delete property</button> : <span />}
          <div className="flex items-center gap-3">
            <Link to="/admin/properties" className="px-4 py-2 text-sm font-semibold text-on-surface-variant hover:text-on-surface">Cancel</Link>
            <button type="submit" disabled={saving} className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-dim disabled:opacity-60">{saving ? 'Saving…' : mode === 'new' ? 'Create property' : 'Save changes'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-4"><h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant">{title}</h2>{children}</section>;
}

function CheckboxGroup<T extends string | number>({ label, values, selected, labelFor, onToggle }: { label: string; values: T[]; selected: T[]; labelFor(value: T): string; onToggle(value: T): void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-on-surface">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => <label key={String(value)} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${selected.includes(value) ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-surface-container-highest text-on-surface-variant'}`}><input type="checkbox" className="sr-only" checked={selected.includes(value)} onChange={() => onToggle(value)} />{labelFor(value)}</label>)}
      </div>
    </fieldset>
  );
}

async function replaceWaitlist(client: Awaited<ReturnType<typeof requireSupabase>>, propertyId: string, waitlistId: string | null) {
  const { error } = await client.rpc('replace_affordable_property_waitlist', { p_property_id: propertyId, p_waitlist_id: waitlistId });
  if (error) throw error;
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function sanitize(draft: PropertyDraft): PropertyDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    city: draft.city.trim(),
    county: draft.county.trim(),
    owner_organization: emptyToNull(draft.owner_organization),
    management_company: emptyToNull(draft.management_company),
    address: emptyToNull(draft.address),
    postal_code: emptyToNull(draft.postal_code),
    description: emptyToNull(draft.description),
    eligibility_summary: emptyToNull(draft.eligibility_summary),
    accessibility_notes: emptyToNull(draft.accessibility_notes),
    phone: emptyToNull(draft.phone),
    website: emptyToNull(draft.website),
    application_url: emptyToNull(draft.application_url),
    source_url: emptyToNull(draft.source_url),
    source_type: emptyToNull(draft.source_type),
    public_notes: emptyToNull(draft.public_notes),
    internal_notes: emptyToNull(draft.internal_notes),
    last_verified: draft.last_verified || null,
  };
}

function toggleNumber(values: number[], value: number): number[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value].sort((a, b) => a - b);
}

function messageFor(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message;
  return 'The property could not be saved.';
}
