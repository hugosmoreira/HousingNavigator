import { requireSupabase } from '../lib/supabaseClient';
import { edgeFunctionError } from './curateResources';

export const SOURCE_CHECK_PILOT_IDS = [
  '66060904-0001-4000-8000-000000000001', '66060904-0002-4000-8000-000000000002',
  '66060904-0003-4000-8000-000000000003', '66060904-0004-4000-8000-000000000004',
  '66060904-0005-4000-8000-000000000005', '66060904-0006-4000-8000-000000000006',
];
export const SOURCE_FIELD_LABELS: Record<string,string> = {
  description:'Description',who_qualifies:'Who qualifies',cost_details:'Costs and fees',
  public_notes:'Public notes',phone:'Phone',application_method:'How to apply',
  referral_required:'Referral required',service_area:'Service area',
};
export interface SourceFinding {
  id:string; resource_id:string; resource_name:string; kind:'changes'|'closure'|'uncertain';
  resolution:string; review_only:boolean; source_url:string; summary:string;
  before_fields:Record<string,unknown>; proposed_fields:Record<string,unknown>;
  evidence:Record<string,string>; created_at:string;
}
export interface SourceState {
  resource_id:string; last_attempted_at:string|null; last_success_at:string|null;
  last_confirmed_at:string|null; last_status:string; last_error:string|null; retry_after:string|null;
}
export async function checkResourceSource(resourceId:string): Promise<{status:string;message:string}> {
  const client=await requireSupabase();
  const {data,error}=await client.functions.invoke('check-resource-sources',{body:{resource_id:resourceId}});
  if(error) throw await edgeFunctionError(error);
  if(!data) throw new Error('The source check returned no result.');
  return data;
}
export async function resolveSourceFinding(id:string,action:'accept'|'dismiss'|'reviewed',expected:Record<string,unknown>) {
  const client=await requireSupabase();
  const {error}=await client.rpc('resolve_resource_source_finding',{p_finding_id:id,p_action:action,p_expected_proposed_fields:expected});
  if(error) throw new Error(error.message);
}
export function formatSourceValue(value:unknown):string {
  if(value===null || value===undefined || value==='') return 'Not recorded';
  if(typeof value==='boolean') return value?'Yes':'No';
  if(Array.isArray(value)) return value.map((area)=>[area.county||'Statewide',area.state].join(', ')).join('; ');
  return String(value);
}
