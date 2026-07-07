/**
 * Typed wrappers around Supabase tables that back the public dashboard.
 *
 * All calls are RLS-gated to the signed-in user (see migration 0004).
 * Wrappers throw on error so the caller (`UserDataContext`) can surface
 * a clean message instead of branching on `{ data, error }` everywhere.
 */

import { requireSupabase } from '../lib/supabaseClient';
import type { ResourceRow, WaitlistRow } from './data/dbTypes';

export interface SavedResourceRow {
  id: string;
  resource_id: string;
  created_at: string;
}

export interface WaitlistAlertRow {
  id: string;
  waitlist_id: string;
  notify_on_open: boolean;
  notify_on_status_change: boolean;
  created_at: string;
  updated_at: string;
}

// `email` is intentionally NOT writable here. It is mailed directly by the
// send-waitlist-alert Edge Function, so it must stay a verified address.
// Migration 0008 enforces this in the DB (column-level grant + auth.users
// sync trigger) — a PATCH including `email` is rejected, not silently
// dropped. Keep this type in sync with the granted columns.
export interface ProfilePatch {
  display_name?: string | null;
  home_county?: string | null;
  email_notifications_enabled?: boolean;
}

// ---------------------------------------------------------------------------
// saved_resources
// ---------------------------------------------------------------------------

export async function listSavedResources(): Promise<SavedResourceRow[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('saved_resources')
    .select('id, resource_id, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedResourceRow[];
}

export async function saveResource(userId: string, resourceId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('saved_resources')
    .insert({ user_id: userId, resource_id: resourceId });
  if (error) throw error;
}

export async function unsaveResource(resourceId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('saved_resources')
    .delete()
    .eq('resource_id', resourceId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// waitlist_alerts
// ---------------------------------------------------------------------------

export async function listWaitlistAlerts(): Promise<WaitlistAlertRow[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('waitlist_alerts')
    .select('id, waitlist_id, notify_on_open, notify_on_status_change, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as WaitlistAlertRow[];
}

export async function followWaitlist(
  userId: string,
  waitlistId: string,
  prefs: { notify_on_open?: boolean; notify_on_status_change?: boolean } = {},
): Promise<WaitlistAlertRow> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('waitlist_alerts')
    .insert({
      user_id: userId,
      waitlist_id: waitlistId,
      notify_on_open: prefs.notify_on_open ?? true,
      notify_on_status_change: prefs.notify_on_status_change ?? false,
    })
    .select('id, waitlist_id, notify_on_open, notify_on_status_change, created_at, updated_at')
    .single();
  if (error) throw error;
  return data as WaitlistAlertRow;
}

export async function unfollowWaitlist(waitlistId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('waitlist_alerts')
    .delete()
    .eq('waitlist_id', waitlistId);
  if (error) throw error;
}

export async function updateWaitlistAlertPrefs(
  waitlistId: string,
  prefs: { notify_on_open?: boolean; notify_on_status_change?: boolean },
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('waitlist_alerts')
    .update(prefs)
    .eq('waitlist_id', waitlistId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// profiles
// ---------------------------------------------------------------------------

export async function updateProfile(userId: string, patch: ProfilePatch): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('profiles')
    .update(patch)
    .eq('id', userId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// catalog reads (used by dashboard to hydrate saved IDs into displayable rows)
//
// RLS lets anyone read published rows, so these helpers do not gate on
// auth. If a saved row points at a now-unpublished resource we simply
// won't get it back — the dashboard treats that as "no longer
// available" rather than crashing.
//
// Read through the `*_public` views (migration 0007) so the admin-only
// `internal_notes` column is never delivered to the browser. The dashboard
// never renders it; the base tables stay reserved for the admin CMS.
// ---------------------------------------------------------------------------

export async function fetchResourcesByIds(ids: string[]): Promise<ResourceRow[]> {
  if (ids.length === 0) return [];
  const client = requireSupabase();
  const { data, error } = await client
    .from('resources_public')
    .select('*')
    .in('id', ids);
  if (error) throw error;
  return (data ?? []) as ResourceRow[];
}

export async function fetchWaitlistsByIds(ids: string[]): Promise<WaitlistRow[]> {
  if (ids.length === 0) return [];
  const client = requireSupabase();
  const { data, error } = await client
    .from('waitlists_public')
    .select('*')
    .in('id', ids);
  if (error) throw error;
  return (data ?? []) as WaitlistRow[];
}

// ---------------------------------------------------------------------------
// notification_events
//
// Read-side only. Inserts come from the `send-waitlist-alert` Edge Function
// using the service-role key (one row per successfully emailed recipient).
// RLS limits SELECT/UPDATE to rows where `user_id = auth.uid()`, and the
// column grant (migration 0010) makes `read` the only writable column, so
// these helpers do not need to pass the user id explicitly.
// ---------------------------------------------------------------------------

export interface NotificationEventRow {
  id: string;
  event_type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

export async function listNotificationEvents(): Promise<NotificationEventRow[]> {
  const client = requireSupabase();
  // Newest 50 is plenty for the dashboard panel; older history stays
  // queryable but never inflates this payload.
  const { data, error } = await client
    .from('notification_events')
    .select('id, event_type, title, body, read, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as NotificationEventRow[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('notification_events')
    .update({ read: true })
    .eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const client = requireSupabase();
  // RLS scopes the update to the caller's own rows.
  const { error } = await client
    .from('notification_events')
    .update({ read: true })
    .eq('read', false);
  if (error) throw error;
}

// Email delivery is implemented end-to-end: the `on_waitlist_status_change`
// trigger (migration 0009) or an admin's manual confirmation invokes the
// `send-waitlist-alert` Edge Function, which fans out via Resend and inserts
// the notification_events rows read above.
// Until that ships, the dashboard toggles only persist preferences.
