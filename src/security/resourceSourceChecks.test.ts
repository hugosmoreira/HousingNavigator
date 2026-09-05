import { readFileSync } from 'node:fs';
import { describe,it,expect } from 'vitest';
import {
  buildSourcePlan,sourcePageText,sourceDigest,findingFingerprint,canReuseSourceAnalysis,
  retryDelayMs,validSourceField,type SourceAssessment,
} from '../../supabase/functions/_shared/resourceSourceChecks';

const page='Community Furniture helps people furnish their homes. Furniture costs $150. Delivery costs $250. Agency referrals are accepted.';
const current={cost_details:'Furniture costs $100.',description:'Help furnishing a home.',published:true};
const assessment:SourceAssessment={
  identity_match:true,identity_evidence:'Community Furniture',confidence:0.95,
  outcome:'changed',closure_notice:'',summary:'Furniture fee changed.',
  changes:[{field:'cost_details',value:'Furniture costs $150.',evidence:'Furniture costs $150.',reason:'Fee changed.'}],
};
describe('evidence-backed source comparisons',()=>{
  it('proposes a real fee change without mutating the current record',()=>{
    const plan=buildSourcePlan(current,assessment,page);
    expect(plan.patch).toEqual({cost_details:'Furniture costs $150.'});
    expect(current.cost_details).toBe('Furniture costs $100.');
    expect(plan.reviewOnly).toBe(false);
  });
  it('records unchanged evidence without a patch or public verification date',()=>{
    const plan=buildSourcePlan(current,{...assessment,outcome:'unchanged',changes:[]},page);
    expect(plan.status).toBe('unchanged');expect(plan.patch).toEqual({});
    expect(plan).not.toHaveProperty('last_verified');
  });
  it.each([0,0.3,0.84,1.1,NaN])('rejects inadequate confidence %s',(confidence)=>{
    expect(buildSourcePlan(current,{...assessment,confidence},page).status).toBe('uncertain');
  });
  it('rejects an unrelated source identity',()=>{
    expect(buildSourcePlan(current,{...assessment,identity_evidence:'Another Furniture Provider'},page).patch).toEqual({});
  });
  it('rejects invented evidence and punctuation-only evidence',()=>{
    for(const evidence of ['Free furniture for everyone.','...','..............']){
      const plan=buildSourcePlan(current,{...assessment,changes:[{...assessment.changes[0],evidence}]},page);
      expect(plan.status).toBe('uncertain');expect(plan.patch).toEqual({});
    }
  });
  it.each(['published','last_verified','internal_notes','service_tags','source_url','__proto__'])('does not allow %s updates',(field)=>{
    expect(validSourceField(field,'new value')).toBe(false);
  });
  it('requires explicit boolean values and valid application methods',()=>{
    expect(validSourceField('referral_required','false')).toBe(false);
    expect(validSourceField('referral_required',false)).toBe(true);
    expect(validSourceField('application_method','online')).toBe(true);
    expect(validSourceField('application_method','send_password')).toBe(false);
  });
  it('rejects empty replacements, markup and duplicate field proposals',()=>{
    expect(validSourceField('description','')).toBe(false);
    expect(validSourceField('description','<script>')).toBe(false);
    expect(buildSourcePlan(current,{...assessment,changes:[...assessment.changes,...assessment.changes]},page).status).toBe('uncertain');
  });
  it('keeps geographic changes manual',()=>{
    const plan=buildSourcePlan(current,{...assessment,changes:[{
      field:'service_area',value:'Clark County, WA',evidence:'Serves Clark County, Washington.',reason:'Area changed.',
    }]},page+' Serves Clark County, Washington.');
    expect(plan.reviewOnly).toBe(true);
  });
  it('prioritizes a supported closure but never proposes publication or deletion',()=>{
    const plan=buildSourcePlan(current,{...assessment,changes:[],closure_notice:'Applications are paused until further notice.'},
      page+' Applications are paused until further notice.');
    expect(plan.kind).toBe('closure');expect(plan.reviewOnly).toBe(true);expect(plan.patch).toEqual({});
  });
  it('fails closed on contradictory or unsupported results',()=>{
    expect(buildSourcePlan(current,{...assessment,outcome:'unchanged'},page).status).toBe('uncertain');
    expect(buildSourcePlan(current,{...assessment,closure_notice:'We closed permanently.'},page).status).toBe('uncertain');
    expect(buildSourcePlan(current,{...assessment,changes:[]},page).status).toBe('uncertain');
  });
});
describe('quiet, bounded repeat checks',()=>{
  it('ignores menu/footer/script changes but retains body and header closure notices',async()=>{
    const a='<nav>Menu 1</nav><header>Applications are paused.</header><main>'+page+'</main><footer>Copyright 2025</footer>';
    const b='<nav>Menu 2</nav><header>Applications are paused.</header><main>'+page+'</main><footer>Copyright 2026</footer><script>alert(1)</script>';
    expect(await sourceDigest(sourcePageText(a))).toBe(await sourceDigest(sourcePageText(b)));
    expect(sourcePageText(a)).toContain('Applications are paused.');
  });
  it('reuses analysis only when both source content and resource facts are unchanged',()=>{
    const previous={source_hash:'hash',resource_signature:'version',last_status:'changed'};
    expect(canReuseSourceAnalysis(previous,'hash','version')).toBe(true);
    expect(canReuseSourceAnalysis(previous,'new','version')).toBe(false);
    expect(canReuseSourceAnalysis(previous,'hash','edited')).toBe(false);
    expect(canReuseSourceAnalysis({...previous,last_status:'unreadable'},'hash','version')).toBe(false);
  });
  it('identifies the same finding despite generated wording changes',async()=>{
    const a=buildSourcePlan(current,assessment,page);
    const b={...a,patch:{cost_details:'The furniture fee is $150.'},summary:'Another wording'};
    expect(await findingFingerprint('https://provider.org',a)).toBe(await findingFingerprint('https://provider.org',b));
    expect(await findingFingerprint('https://other.org',a)).not.toBe(await findingFingerprint('https://provider.org',a));
  });
  it('distinguishes a later change against a different confirmed value',async()=>{
    const plan=buildSourcePlan(current,assessment,page);
    expect(await findingFingerprint('https://provider.org',plan,{cost_details:'Fee $100'}))
      .not.toBe(await findingFingerprint('https://provider.org',plan,{cost_details:'Fee $200'}));
  });
  it('does not reopen resolved findings because an unrelated field changed',async()=>{
    const plan=buildSourcePlan(current,assessment,page);
    expect(await findingFingerprint('https://provider.org',plan,{cost_details:'Fee $100',phone:'111'}))
      .toBe(await findingFingerprint('https://provider.org',plan,{cost_details:'Fee $100',phone:'222'}));
  });
  it('uses increasing retries capped at one day',()=>{
    expect(retryDelayMs(1)).toBe(15*60_000);
    expect(retryDelayMs(2)).toBe(30*60_000);
    expect(retryDelayMs(1000)).toBe(24*60*60_000);
  });
});
describe('database and edge safeguards',()=>{
  const migration=readFileSync(new URL('../../supabase/migrations/0026_resource_source_checks.sql',import.meta.url),'utf8');
  const edge=readFileSync(new URL('../../supabase/functions/check-resource-sources/index.ts',import.meta.url),'utf8');
  it('does not create a schedule or update public resources from the checker',()=>{
    expect(migration).not.toMatch(/cron\.schedule|create trigger/i);
    expect(edge).not.toMatch(/\.update\(/);
    const complete=migration.split('create function public.complete_resource_source_check')[1].split('create function public.resolve_resource_source_finding')[0];
    expect(complete).not.toMatch(/update public.resources\s/i);
  });
  it('protects administration, approved fields and concurrent edits',()=>{
    expect(edge).toContain("admin.auth.getUser(token)");
    expect(edge).toContain(".from('admin_users')");
    expect(migration).toContain('if not public.is_admin()');
    expect(migration).toContain('v_resource.updated_at is distinct from v_finding.base_updated_at');
    expect(migration).toContain('unique(resource_id,fingerprint)');
    expect(migration).toContain('on conflict(resource_id,fingerprint) do update set');
    expect(migration).toContain('v_finding.proposed_fields is distinct from p_expected_proposed_fields');
  });
});
