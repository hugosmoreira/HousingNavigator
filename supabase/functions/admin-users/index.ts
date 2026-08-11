// Supabase Edge Function — `admin-users`
//
// Auth user administration must never run in the browser because the Auth
// Admin API requires the service-role key. This function validates the caller's
// JWT, confirms membership in public.admin_users, then exposes a deliberately
// small action surface for the Housing Navigator admin dashboard.
//
// Deploy with JWT verification disabled because the function explicitly calls
// auth.getUser(token) before authorizing any operation:
//   supabase functions deploy admin-users --no-verify-jwt

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference lib="deno.ns" />

// @ts-expect-error — npm imports are resolved by the Supabase Deno runtime.
import { createClient } from 'npm:@supabase/supabase-js@2';
// @ts-expect-error — Deno standard library import.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  adminDeleteConfirmationMatches,
  countAdminRowsByUser,
  normalizeAdminEmail,
  normalizeAdminUserPage,
  validAdminEmail,
  validAdminUserId,
} from '../_shared/adminUserManagement.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BODY_BYTES = 8_192;

type Action = 'list' | 'invite' | 'block' | 'unblock' | 'delete';

interface RequestBody {
  action?: Action;
  page?: number;
  perPage?: number;
  email?: string;
  userId?: string;
  confirmEmail?: string;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  home_county: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

async function parseBody(req: Request): Promise<RequestBody> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new Error('request body is too large');
  }
  return (await req.json()) as RequestBody;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'server misconfigured (missing Supabase environment)' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'missing bearer token' }, 401);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: 'unauthorized' }, 401);

  const actorId = userData.user.id;
  const { data: actorAdmin, error: actorError } = await admin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', actorId)
    .maybeSingle();
  if (actorError) return json({ error: 'admin authorization lookup failed' }, 500);
  if (!actorAdmin) return json({ error: 'not admin' }, 403);

  let body: RequestBody;
  try {
    body = await parseBody(req);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'invalid JSON body' }, 400);
  }

  const action = body.action;
  if (!action || !['list', 'invite', 'block', 'unblock', 'delete'].includes(action)) {
    return json({ error: 'unsupported action' }, 400);
  }

  if (action === 'list') {
    const { page, perPage } = normalizeAdminUserPage(body.page, body.perPage);
    const { data: authPage, error: listError } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (listError) return json({ error: 'could not list users' }, 500);

    const ids = authPage.users.map((user) => user.id);
    if (ids.length === 0) {
      return json({ users: [], page, perPage, total: authPage.total ?? 0 });
    }

    const [profilesResult, savedResult, alertsResult, adminsResult] = await Promise.all([
      admin.from('profiles').select('id, display_name, home_county').in('id', ids),
      admin.from('saved_resources').select('user_id').in('user_id', ids),
      admin.from('waitlist_alerts').select('user_id').in('user_id', ids),
      admin.from('admin_users').select('user_id').in('user_id', ids),
    ]);
    const enrichmentError =
      profilesResult.error ?? savedResult.error ?? alertsResult.error ?? adminsResult.error;
    if (enrichmentError) return json({ error: 'could not load user account details' }, 500);

    const profiles = new Map(
      ((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
    );
    const savedCounts = countAdminRowsByUser(savedResult.data ?? []);
    const alertCounts = countAdminRowsByUser(alertsResult.data ?? []);
    const adminIds = new Set((adminsResult.data ?? []).map((row) => row.user_id));

    return json({
      users: authPage.users.map((user) => {
        const profile = profiles.get(user.id);
        return {
          id: user.id,
          email: user.email ?? '',
          display_name: profile?.display_name ?? null,
          home_county: profile?.home_county ?? null,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at ?? null,
          email_confirmed_at: user.email_confirmed_at ?? null,
          banned_until: user.banned_until ?? null,
          is_admin: adminIds.has(user.id),
          saved_resource_count: savedCounts.get(user.id) ?? 0,
          waitlist_alert_count: alertCounts.get(user.id) ?? 0,
        };
      }),
      page,
      perPage,
      total: authPage.total ?? authPage.users.length,
    });
  }

  if (action === 'invite') {
    const email = normalizeAdminEmail(body.email);
    if (!validAdminEmail(email)) {
      return json({ error: 'enter a valid email address' }, 400);
    }
    const siteUrl = (Deno.env.get('APP_URL') ?? 'https://housingnavigator.us').replace(/\/$/, '');
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/reset-password`,
    });
    if (error || !data.user) {
      const duplicate = /already|registered|exists/i.test(error?.message ?? '');
      return json(
        { error: duplicate ? 'An account already exists for this email.' : 'Could not send the invitation.' },
        duplicate ? 409 : 500,
      );
    }
    const { error: auditError } = await admin.from('admin_user_actions').insert({
      actor_user_id: actorId,
      target_user_id: data.user.id,
      target_email: email,
      action: 'invite',
    });
    if (auditError) console.error('admin user invite audit failed', auditError.message);
    return json({ message: `Invitation sent to ${email}.` });
  }

  if (!validAdminUserId(body.userId)) return json({ error: 'invalid user id' }, 400);
  const targetId = body.userId;
  if (targetId === actorId) {
    return json({ error: 'You cannot block or delete your own administrator account.' }, 409);
  }

  const [targetResult, targetAdminResult] = await Promise.all([
    admin.auth.admin.getUserById(targetId),
    admin.from('admin_users').select('user_id').eq('user_id', targetId).maybeSingle(),
  ]);
  const { data: targetData, error: targetError } = targetResult;
  if (targetError || !targetData.user) return json({ error: 'user not found' }, 404);
  if (targetAdminResult.error) return json({ error: 'administrator protection lookup failed' }, 500);
  if (targetAdminResult.data) {
    return json(
      { error: 'Administrator accounts are protected and must be managed outside this screen.' },
      409,
    );
  }

  const targetEmail = normalizeAdminEmail(targetData.user.email);
  if (action === 'block' || action === 'unblock') {
    const { error } = await admin.auth.admin.updateUserById(targetId, {
      ban_duration: action === 'block' ? '876000h' : 'none',
    });
    if (error) return json({ error: `Could not ${action} this account.` }, 500);
    const { error: auditError } = await admin.from('admin_user_actions').insert({
      actor_user_id: actorId,
      target_user_id: targetId,
      target_email: targetEmail,
      action,
    });
    if (auditError) console.error(`admin user ${action} audit failed`, auditError.message);
    return json({ message: action === 'block' ? 'Account blocked.' : 'Account unblocked.' });
  }

  if (!adminDeleteConfirmationMatches(targetEmail, body.confirmEmail)) {
    return json({ error: 'The confirmation email does not match this account.' }, 400);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(targetId, false);
  if (deleteError) return json({ error: 'Could not permanently delete this account.' }, 500);
  const { error: auditError } = await admin.from('admin_user_actions').insert({
    actor_user_id: actorId,
    target_user_id: targetId,
    target_email: targetEmail,
    action: 'delete',
  });
  if (auditError) console.error('admin user delete audit failed', auditError.message);
  return json({ message: 'Account permanently deleted.' });
});
