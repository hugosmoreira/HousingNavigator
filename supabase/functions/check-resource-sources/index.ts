/// <reference lib="deno.ns" />
// @ts-expect-error Deno resolves npm specifiers.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchPublicHttpText } from '../_shared/checkerSecurity.ts';
import {
  buildSourcePlan, canReuseSourceAnalysis, findingFingerprint, retryDelayMs,
  SOURCE_FIELDS, SOURCE_CHECK_POLICY_VERSION, sourceDigest, sourcePageText,
} from '../_shared/resourceSourceChecks.ts';
import { compareResourceSource } from '../_shared/resourceSourceExtractor.ts';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {
  status, headers: { ...headers, 'Content-Type': 'application/json' },
});

// Admin button only: a caller supplies ONE existing ID, never a URL or public patch.
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' },405);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!url || !serviceKey || !apiKey) return json({ error: 'Source checks are not configured.' },503);
  const admin = createClient(url,serviceKey,{ auth: { persistSession:false,autoRefreshToken:false } });
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i,'');
  const { data: user, error: userError } = await admin.auth.getUser(token);
  if (userError || !user?.user) return json({ error:'Sign in required.' },401);
  const { data: member,error: memberError } = await admin.from('admin_users').select('user_id')
    .eq('user_id',user.user.id).maybeSingle();
  if (memberError) return json({ error:'Admin access could not be checked.' },503);
  if (!member) return json({ error:'Admin access required.' },403);
  let id: string;
  try {
    const body = await request.json();
    if (Object.keys(body).some((key) => key !== 'resource_id')) throw new Error();
    id = body.resource_id;
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error();
  } catch { return json({ error:'Supply one valid resource_id.' },400); }

  const { data: resource,error: resourceError } = await admin.from('resources')
    .select('id,name,category,description,who_qualifies,cost_details,public_notes,phone,application_method,referral_required,source_url,website,updated_at,published')
    .eq('id',id).maybeSingle();
  if (resourceError) return json({ error:'Resource lookup failed.' },500);
  if (!resource) return json({ error:'Resource not found.' },404);
  const { data: areas,error: areaError } = await admin.from('resource_service_areas')
    .select('state,county').eq('resource_id',id).order('sort_order');
  if (areaError) return json({ error:'Service-area lookup failed.' },500);
  const { data: previous,error: stateError } = await admin.from('resource_source_states')
    .select('*').eq('resource_id',id).maybeSingle();
  if (stateError) return json({ error:'Source-check history unavailable.' },500);
  const { data: lease,error: leaseError } = await admin.rpc('claim_resource_source_check',{ p_resource_id:id });
  if (leaseError) return json({ error:'Could not start source check.' },500);
  if (!lease) return json({ status:'deferred',message:'Already being checked or waiting before retrying.',retry_after:previous?.retry_after });
  let result: Record<string,unknown>;
  try {
    const sourceUrl = resource.source_url || resource.website;
    if (!sourceUrl) throw new Error('missing_source');
    const fetched = await fetchPublicHttpText(sourceUrl,{
      signal:AbortSignal.timeout(15_000),
      headers:{ 'User-Agent':'HousingNavigatorSourceCheck/1.0 (+https://housingnavigator.us; admin-requested)',
        Accept:'text/html,application/xhtml+xml' },
    });
    const page = sourcePageText(fetched.text);
    if (page.length<250 || page.length>45_000 ||
        /verify you are human|enable javascript and cookies to continue|checking your browser/i.test(page)) {
      throw new Error('unreadable_source');
    }
    const comparison: Record<string,unknown> = { name:resource.name,category:resource.category };
    for (const field of SOURCE_FIELDS) comparison[field] = field === 'service_area' ? areas : resource[field];
    comparison.source_url=sourceUrl;
    const hash=await sourceDigest(page);
    const signature=await sourceDigest(JSON.stringify([SOURCE_CHECK_POLICY_VERSION,comparison]));
    const metadata={ source_hash:hash,resource_signature:signature,source_url:fetched.finalUrl };
    if (canReuseSourceAnalysis(previous,hash,signature)) {
      // No LLM call, no new finding, no public verification-date change.
      result={ ...metadata,status:previous.last_status };
    } else {
      const assessment=await compareResourceSource(apiKey,
        Deno.env.get('RESOURCE_SOURCE_MODEL') ?? Deno.env.get('RESOURCE_CURATION_MODEL') ??
        Deno.env.get('CLAUDE_MODEL') ?? 'claude-opus-4-8',comparison,page);
      const plan=buildSourcePlan(comparison,assessment,page);
      result={ ...metadata,status:plan.status,kind:plan.kind,review_only:plan.reviewOnly,
        summary:plan.summary,before_fields:comparison,proposed_fields:plan.patch,evidence:plan.evidence };
      if (plan.status!=='unchanged') result.fingerprint=await findingFingerprint(fetched.finalUrl,plan,comparison,hash);
    }
  } catch {
    // Avoid exposing DNS/private-address details or treating a fetch failure as closure.
    result={ status:'unreadable',
      error:'Could not read or compare this source. Existing information is unchanged; retry is delayed.',
      retry_after:new Date(Date.now()+retryDelayMs((previous?.failure_count ?? 0)+1)).toISOString() };
  }
  const { data: status,error: saveError }=await admin.rpc('complete_resource_source_check',{
    p_resource_id:id,p_lease_token:lease,p_expected_updated_at:resource.updated_at,p_result:result,
  });
  if (saveError) return json({ error:'Could not save the check. No public content was changed.' },500);
  return json({ status,resource_id:id,message:result.error ?? result.summary ?? 'Source check recorded.' });
});
