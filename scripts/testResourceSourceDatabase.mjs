// Isolated real PostgreSQL (PGlite) tests. Never connects to Supabase.
// Install locally: npm install --prefix tmp/source-check-tests --no-save @electric-sql/pglite
import { PGlite } from '../tmp/source-check-tests/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
const read=(name)=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const adminId='10000000-0000-4000-8000-000000000001';
const userId='10000000-0000-4000-8000-000000000002';
const resourceId='20000000-0000-4000-8000-000000000001';
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const clearBackoff=()=>db.query('update resource_source_states set retry_after=null,lease_until=null where resource_id=$1',[resourceId]);
const version=()=>scalar('select updated_at::text from resources where id=$1',[resourceId]);
async function asRole(role,user,fn){
  await db.exec('set role '+role);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
  try{return await fn();}finally{await db.exec('reset role');}
}
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema app_private;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create table public.admin_users(user_id uuid primary key);
  create function public.is_admin() returns boolean language sql security definer set search_path='' as $$
    select exists(select 1 from public.admin_users where user_id=auth.uid()) $$;
  create function public.set_updated_at() returns trigger language plpgsql as $$
    begin new.updated_at=now();return new;end $$;
  grant usage on schema auth,public to anon,authenticated,service_role;
  grant usage on schema app_private to authenticated;
`);
const resourceDDL=read('0002_admin_catalog.sql').split('create table if not exists public.resources')[1].split('create index')[0];
await db.exec('create table if not exists public.resources'+resourceDDL);
await db.exec(`
  create trigger set_updated_at before update on public.resources for each row execute function public.set_updated_at();
  alter table public.resources enable row level security;
  create policy resource_read on public.resources for select using(published or public.is_admin());
  grant select(id,name,category,county,city,state,description,who_qualifies,who_it_helps,
    application_method,referral_required,phone,website,address,source_url,source_type,
    last_verified,public_notes,priority_score,published,created_at,updated_at) on resources to anon,authenticated;
  grant all on resources to service_role;
  create table public.resource_service_areas(
    id uuid primary key default gen_random_uuid(),resource_id uuid references resources(id),
    state text,county text,sort_order smallint);
  grant select on public.resource_service_areas to anon,authenticated;
  grant all on public.resource_service_areas to service_role;
  create function app_private.resources_admin_rows() returns setof public.resources
    language sql stable security definer set search_path='' as $$
    select r.* from public.resources r where public.is_admin() $$;
  grant execute on function app_private.resources_admin_rows() to authenticated;
`);
await db.exec(read('0024_resource_service_tags.sql'));
await test('migration applies against prior public/admin view column order',()=>db.exec(read('0026_resource_source_checks.sql')));
await db.query('insert into auth.users values($1),($2)',[adminId,userId]);
await db.query('insert into admin_users values($1)',[adminId]);
await db.query("insert into resources(id,name,category,county,state,cost_details,last_verified,published,internal_notes) values($1,'Example Furniture','supportive_services','Multnomah','OR','Fee $100','2026-09-01',true,'private')",[resourceId]);
const result=(fingerprint='fee150')=>({
  status:'changed',source_hash:'source-v1',resource_signature:'record-v1',source_url:'https://example.org/program',
  fingerprint,kind:'changes',review_only:false,before_fields:{cost_details:'Fee $100'},
  proposed_fields:{cost_details:'Fee $150'},evidence:{cost_details:'The fee is $150.'},summary:'Fee changed.',
});
async function complete(value=result(),expected){
  await clearBackoff();
  const token=await scalar('select claim_resource_source_check($1)',[resourceId]);
  return scalar('select complete_resource_source_check($1,$2,$3,$4::jsonb)',
    [resourceId,token,expected||await version(),JSON.stringify(value)]);
}
const latestId=()=>scalar("select id from resource_source_findings where resource_id=$1 and resolution='pending' order by created_at desc limit 1",[resourceId]);
const resolve=async(id,action,user=adminId)=>{
  const expected=await scalar('select proposed_fields from resource_source_findings where id=$1',[id]);
  return asRole('authenticated',user,()=>scalar('select resolve_resource_source_finding($1,$2,$3::jsonb)',[id,action,JSON.stringify(expected)]));
};

await test('two overlapping checks cannot claim the same resource',async()=>{
  assert.ok(await scalar('select claim_resource_source_check($1)',[resourceId]));
  assert.equal(await scalar('select claim_resource_source_check($1)',[resourceId]),null);
  await clearBackoff();
});
await test('a comparison writes one finding and no public edit',async()=>{
  assert.equal(await complete(),'needs_review');
  assert.equal(await scalar('select cost_details from resources where id=$1',[resourceId]),'Fee $100');
  assert.equal(await scalar('select count(*)::int from resource_source_findings'),1);
});
await test('non-admin users cannot resolve findings or read private check details',async()=>{
  const id=await latestId();
  await assert.rejects(()=>resolve(id,'accept',userId),/Admin access required/);
  await asRole('authenticated',userId,async()=>{
    assert.equal(await scalar('select count(*)::int from resource_source_findings'),0);
    assert.equal(await scalar('select count(*)::int from resource_source_states'),0);
    await assert.rejects(()=>db.query('select claim_resource_source_check($1)',[resourceId]),/permission denied/);
  });
  await asRole('anon',null,async()=>{
    await assert.rejects(()=>db.query('select * from resource_source_findings'),/permission denied/);
    await assert.rejects(()=>db.query('select internal_notes from resources'),/permission denied/);
    assert.equal(await scalar('select cost_details from resources where id=$1',[resourceId]),'Fee $100');
  });
});
await test('dismissed evidence stays dismissed on repeated checks',async()=>{
  await resolve(await latestId(),'dismiss');assert.equal(await complete(),'already_reviewed');
  assert.equal(await scalar('select count(*)::int from resource_source_findings'),1);
  assert.equal(await scalar("select count(*)::int from resource_source_findings where resolution='pending'"),0);
});
await test('new evidence opens one new finding and approval changes only allowed fields',async()=>{
  await complete(result('new-fee-evidence'));
  await resolve(await latestId(),'accept');
  const row=(await db.query('select cost_details,last_verified::text,published,internal_notes from resources where id=$1',[resourceId])).rows[0];
  assert.deepEqual(row,{cost_details:'Fee $150',last_verified:'2026-09-01',published:true,internal_notes:'private'});
  assert.ok(await scalar('select last_confirmed_at from resource_source_states where resource_id=$1',[resourceId]));
});
await test('a stale proposal cannot overwrite a manual edit',async()=>{
  await complete(result('new-proposal'));
  const id=await latestId();
  await db.query("update resources set cost_details='Manually confirmed fee' where id=$1",[resourceId]);
  await assert.rejects(()=>resolve(id,'accept'),/Resource changed since this check/);
  assert.equal(await scalar('select cost_details from resources where id=$1',[resourceId]),'Manually confirmed fee');
  await resolve(id,'reviewed');
});
await test('a concurrent edit during fetching creates no proposal',async()=>{
  const old=await version();
  await db.query("update resources set description='Edited while checking' where id=$1",[resourceId]);
  assert.equal(await complete(result('concurrent'),old),'edit_conflict');
  assert.equal(await scalar("select count(*)::int from resource_source_findings where fingerprint='concurrent'"),0);
});
await test('closure findings require manual editing and never unpublish',async()=>{
  await complete({...result('closure'),kind:'closure',review_only:true,proposed_fields:{},evidence:{closure:'Intake is paused.'}});
  const id=await latestId();
  await assert.rejects(()=>resolve(id,'accept'),/requires a manual edit/);
  assert.equal(await scalar('select published from resources where id=$1',[resourceId]),true);
  await resolve(id,'reviewed');
});
await test('a forged forbidden patch cannot pass the database approval gate',async()=>{
  await complete({...result('forbidden'),proposed_fields:{published:false},evidence:{published:'Closed.'}});
  await assert.rejects(()=>resolveWithLatest(),/Forbidden proposal field/);
});
async function resolveWithLatest(){return resolve(await latestId(),'accept');}
await test('unchanged checks create no findings and do not refresh public verification',async()=>{
  await complete({status:'unchanged',source_hash:'same',resource_signature:'same'});
  assert.equal(await scalar("select count(*)::int from resource_source_findings where resolution='pending'"),0);
  assert.equal(await scalar('select last_verified::text from resources where id=$1',[resourceId]),'2026-09-01');
});
await test('blocked sources retain information and defer retries',async()=>{
  await complete({status:'unreadable',retry_after:new Date(Date.now()+3600000).toISOString(),error:'Source could not be read.'});
  assert.equal(await scalar('select claim_resource_source_check($1)',[resourceId]),null);
  assert.equal(await scalar('select cost_details from resources where id=$1',[resourceId]),'Manually confirmed fee');
  assert.equal(await scalar('select failure_count from resource_source_states where resource_id=$1',[resourceId]),1);
});
await test('six pilot drafts insert once, retain fees, and never resurrect on replay',async()=>{
  const seed=read('0027_seed_move_in_support_pilot.sql');
  await db.exec(seed);await db.exec(seed);
  assert.equal(await scalar("select count(*)::int from resources where id::text like '66060904%'"),6);
  assert.equal(await scalar("select count(*)::int from resources where id::text like '66060904%' and published"),0);
  await db.exec("update resources set cost_details='Human edit' where id='66060904-0001-4000-8000-000000000001'");
  await db.exec(seed);
  assert.equal(await scalar("select cost_details from resources where id='66060904-0001-4000-8000-000000000001'"),'Human edit');
});
await test('hidden duplicates stop the entire seed batch',async()=>{
  await db.exec("insert into resources(name,category,county,website,published) values('Existing hidden CW','supportive_services','Multnomah','https://www.communitywarehouse.org/get-furniture/',false)");
  await assert.rejects(()=>db.exec(read('0027_seed_move_in_support_pilot.sql')),/Existing resource matches/);
  await db.exec('rollback');
});
console.log(passed+' PostgreSQL integration checks passed; no external database used.');
await db.close();
