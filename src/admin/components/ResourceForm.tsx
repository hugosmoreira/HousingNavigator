import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { requireSupabase } from '../../lib/supabaseClient';
import { DIRECTORY_CATEGORIES, DIRECTORY_CATEGORY_LABELS } from '../../data/categoryMap';
import { normalizeServiceAreas } from '../../data/serviceAreas';
import type { ResourceRow } from '../../services/data/dbTypes';
import type { ApplicationMethod, DirectoryCategory, ServiceArea } from '../../types';
import { Field, Select, TextArea, TextInput, Toggle } from './FormField';
import ServiceAreaPicker from './ServiceAreaPicker';

const APPLICATION_METHODS: Array<{ value: ApplicationMethod; label: string }> = [
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'phone', label: 'Phone' },
  { value: 'online', label: 'Online' },
  { value: 'referral', label: 'Referral required' },
];

type ResourceBaseDraft = Omit<
  ResourceRow,
  'id' | 'created_at' | 'updated_at' | 'service_areas'
>;
type ResourceDraft = ResourceBaseDraft & { service_areas: ServiceArea[] };

const EMPTY: ResourceDraft = {
  name: '',
  category: 'rent_assistance' as DirectoryCategory,
  county: 'Multnomah',
  city: '',
  state: 'OR',
  service_areas: [{ state: 'OR', county: 'Multnomah' }],
  description: '',
  who_qualifies: '',
  who_it_helps: [],
  application_method: 'walk_in',
  referral_required: false,
  phone: '',
  website: '',
  address: '',
  source_url: '',
  source_type: '',
  last_verified: null,
  public_notes: '',
  internal_notes: '',
  priority_score: 0,
  published: false,
};

export interface ResourceFormProps {
  mode: 'new' | 'edit';
  resourceId?: string;
}

export default function ResourceForm({ mode, resourceId }: ResourceFormProps) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ResourceDraft>(EMPTY);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'edit' || !resourceId) return;
    let active = true;
    (async () => {
      try {
        const client = await requireSupabase();
        // Read via resources_admin (migration 0010): internal_notes is no
        // longer selectable from the base table by the authenticated role.
        // Writes below still target the base table (unchanged grants + RLS).
        const { data, error: err } = await client
          .from('resources_admin')
          .select('*')
          .eq('id', resourceId)
          .maybeSingle();
        if (err) throw err;
        if (!data) throw new Error('Resource not found');
        if (!active) return;
        const row = data as ResourceRow;
        setDraft({
          name: row.name,
          category: row.category,
          county: row.county,
          city: row.city ?? '',
          state: row.state ?? '',
          service_areas: normalizeServiceAreas(row.service_areas, {
            state: row.state,
            county: row.county,
          }),
          description: row.description ?? '',
          who_qualifies: row.who_qualifies ?? '',
          who_it_helps: row.who_it_helps ?? [],
          application_method: row.application_method,
          referral_required: row.referral_required,
          phone: row.phone ?? '',
          website: row.website ?? '',
          address: row.address ?? '',
          source_url: row.source_url ?? '',
          source_type: row.source_type ?? '',
          last_verified: row.last_verified ?? null,
          public_notes: row.public_notes ?? '',
          internal_notes: row.internal_notes ?? '',
          priority_score: row.priority_score,
          published: row.published,
        });
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [mode, resourceId]);

  function update<K extends keyof ResourceDraft>(key: K, value: ResourceDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (draft.service_areas.length === 0) {
      setError('Add at least one county or statewide service area.');
      return;
    }
    setSaving(true);
    try {
      const client = await requireSupabase();
      const payload = sanitize(draft);
      if (mode === 'new') {
        const publishAfterAreaSave = payload.published;
        const { data, error: err } = await client
          .from('resources')
          // Keep a partially created row private if the service-area RPC fails.
          .insert({ ...payload, published: false })
          .select('id')
          .single();
        if (err) throw err;
        const id = (data as { id: string }).id;
        const { error: areaError } = await client.rpc('replace_resource_service_areas', {
          p_resource_id: id,
          p_service_areas: draft.service_areas,
        });
        if (areaError) throw areaError;
        if (publishAfterAreaSave) {
          const { error: publishError } = await client
            .from('resources')
            .update({ published: true })
            .eq('id', id);
          if (publishError) throw publishError;
        }
        navigate(`/admin/resources/${id}/edit`, { replace: true });
      } else if (resourceId) {
        const { error: err } = await client
          .from('resources')
          .update(payload)
          .eq('id', resourceId);
        if (err) throw err;
        const { error: areaError } = await client.rpc('replace_resource_service_areas', {
          p_resource_id: resourceId,
          p_service_areas: draft.service_areas,
        });
        if (areaError) throw areaError;
        navigate('/admin/resources');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!resourceId) return;
    if (!window.confirm('Delete this resource? This cannot be undone.')) return;
    setSaving(true);
    try {
      const client = await requireSupabase();
      const { error: err } = await client.from('resources').delete().eq('id', resourceId);
      if (err) throw err;
      navigate('/admin/resources');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center text-on-surface-variant">
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 lg:px-10 py-10">
      <Link
        to="/admin/resources"
        className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to resources
      </Link>

      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <h1 className="text-2xl font-headline font-bold tracking-tight">
          {mode === 'new' ? 'New resource' : 'Edit resource'}
        </h1>
        <Toggle
          label={draft.published ? 'Published' : 'Draft'}
          hint={
            draft.published
              ? 'Visible on the public directory.'
              : 'Hidden from the public site until you publish.'
          }
          checked={draft.published}
          onChange={(value) => update('published', value)}
        />
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <Section title="Basics">
          <Field label="Name" required>
            <TextInput
              value={draft.name}
              onChange={(e) => update('name', e.target.value)}
              required
            />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Category" required>
              <Select
                value={draft.category}
                onChange={(e) => update('category', e.target.value)}
              >
                {DIRECTORY_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {DIRECTORY_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority score" hint="Higher scores rank above lower ones.">
              <TextInput
                type="number"
                value={draft.priority_score}
                onChange={(e) => update('priority_score', Number(e.target.value) || 0)}
              />
            </Field>
          </div>
          <Field
            label="Description"
            hint="One or two sentences about what the program offers."
          >
            <TextArea
              value={draft.description ?? ''}
              onChange={(e) => update('description', e.target.value)}
            />
          </Field>
          <Field label="Who qualifies" hint="Plain-language eligibility summary.">
            <TextArea
              value={draft.who_qualifies ?? ''}
              onChange={(e) => update('who_qualifies', e.target.value)}
            />
          </Field>
        </Section>

        <Section title="Service area and location">
          <ServiceAreaPicker
            value={draft.service_areas}
            onChange={(value) => update('service_areas', value)}
            disabled={saving}
          />
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="City">
              <TextInput
                value={draft.city ?? ''}
                onChange={(e) => update('city', e.target.value)}
              />
            </Field>
            <Field label="Street address" hint="Provider office or intake location, if applicable.">
              <TextInput
                value={draft.address ?? ''}
                onChange={(e) => update('address', e.target.value)}
              />
            </Field>
          </div>
        </Section>

        <Section title="Apply">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Application method" required>
              <Select
                value={draft.application_method}
                onChange={(e) =>
                  update('application_method', e.target.value as ApplicationMethod)
                }
              >
                {APPLICATION_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Referral required?">
              <Toggle
                label="Yes, a partner agency must refer applicants"
                checked={draft.referral_required}
                onChange={(value) => update('referral_required', value)}
              />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Phone">
              <TextInput
                value={draft.phone ?? ''}
                onChange={(e) => update('phone', e.target.value)}
              />
            </Field>
            <Field label="Website">
              <TextInput
                type="url"
                value={draft.website ?? ''}
                onChange={(e) => update('website', e.target.value)}
              />
            </Field>
          </div>
        </Section>

        <Section title="Sourcing">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Source URL" hint="Where you confirmed this listing.">
              <TextInput
                type="url"
                value={draft.source_url ?? ''}
                onChange={(e) => update('source_url', e.target.value)}
              />
            </Field>
            <Field label="Source type" hint="e.g. Government, Nonprofit, Email">
              <TextInput
                value={draft.source_type ?? ''}
                onChange={(e) => update('source_type', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Last verified">
            <TextInput
              type="date"
              value={draft.last_verified ?? ''}
              onChange={(e) => update('last_verified', e.target.value || null)}
            />
          </Field>
        </Section>

        <Section title="Notes">
          <Field
            label="Public notes"
            hint="Visible on the public card. Keep neutral and current."
          >
            <TextArea
              value={draft.public_notes ?? ''}
              onChange={(e) => update('public_notes', e.target.value)}
            />
          </Field>
          <Field label="Internal notes" hint="Admin-only; never shown publicly.">
            <TextArea
              value={draft.internal_notes ?? ''}
              onChange={(e) => update('internal_notes', e.target.value)}
            />
          </Field>
        </Section>

        <div className="flex items-center justify-between gap-4 flex-wrap pt-4 border-t border-surface-container-highest">
          {mode === 'edit' ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="text-sm font-semibold text-error hover:underline disabled:opacity-60"
            >
              Delete resource
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <Link
              to="/admin/resources"
              className="text-sm font-semibold text-on-surface-variant hover:text-on-surface px-4 py-2"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-primary text-on-primary font-semibold text-sm px-5 py-2 hover:bg-primary-dim disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : mode === 'new' ? 'Create resource' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant">
        {title}
      </h2>
      {children}
    </section>
  );
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function sanitize(draft: ResourceDraft): ResourceBaseDraft {
  const primaryArea = draft.service_areas[0];
  return {
    name: draft.name.trim(),
    category: draft.category,
    county: primaryArea?.county ?? 'Other',
    state: primaryArea?.state ?? null,
    city: emptyToNull(draft.city),
    description: emptyToNull(draft.description),
    who_qualifies: emptyToNull(draft.who_qualifies),
    who_it_helps: draft.who_it_helps,
    application_method: draft.application_method,
    referral_required: draft.referral_required,
    phone: emptyToNull(draft.phone),
    website: emptyToNull(draft.website),
    address: emptyToNull(draft.address),
    source_url: emptyToNull(draft.source_url),
    source_type: emptyToNull(draft.source_type),
    public_notes: emptyToNull(draft.public_notes),
    internal_notes: emptyToNull(draft.internal_notes),
    last_verified: draft.last_verified || null,
    priority_score: draft.priority_score,
    published: draft.published,
  };
}
