import { useCallback,useEffect,useRef,useState } from 'react';
import { Link } from 'react-router-dom';
import { requireSupabase } from '../../lib/supabaseClient';
import type { ResourceRow } from '../../services/data/dbTypes';
import {
  checkResourceSource,resolveSourceFinding,formatSourceValue,SOURCE_FIELD_LABELS,
  SOURCE_CHECK_PILOT_IDS,type SourceFinding,type SourceState,
} from '../resourceSourceChecks';

interface Props { resources:ResourceRow[]; onResourcesChanged:()=>Promise<unknown> }
const date=(value:string|null)=>value?new Date(value).toLocaleString():'Not yet';
const safeSource=(value:string)=>/^https?:\/\//i.test(value)?value:undefined;

export default function ResourceSourceCheckPanel({resources,onResourcesChanged}:Props) {
  const [findings,setFindings]=useState<SourceFinding[]>([]);
  const [states,setStates]=useState<SourceState[]>([]);
  const [target,setTarget]=useState('pilot');
  const [running,setRunning]=useState(false);
  const [busy,setBusy]=useState<string|null>(null);
  const [confirmation,setConfirmation]=useState<{id:string;action:'accept'|'dismiss'|'reviewed'}|null>(null);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState<string|null>(null);
  const mounted=useRef(true);
  const stop=useRef(false);
  const load=useCallback(async()=>{
    const client=await requireSupabase();
    const [reviewResult,stateResult]=await Promise.all([
      client.from('resource_source_findings').select('*').eq('resolution','pending')
        .order('created_at',{ascending:false}).limit(201),
      client.from('resource_source_states').select('resource_id,last_attempted_at,last_success_at,last_confirmed_at,last_status,last_error,retry_after')
        .order('last_attempted_at',{ascending:false,nullsFirst:false}).limit(100),
    ]);
    if(reviewResult.error||stateResult.error) throw new Error('Source-check history is unavailable. Check that migration 0026 is deployed.');
    if(mounted.current){setFindings(reviewResult.data as SourceFinding[]);setStates(stateResult.data as SourceState[]);}
  },[]);
  useEffect(()=>{
    mounted.current=true;
    load().catch((failure)=>{if(mounted.current)setError(failure.message);});
    return()=>{mounted.current=false;stop.current=true;};
  },[load]);

  async function run() {
    const ids=target==='pilot'?SOURCE_CHECK_PILOT_IDS.filter((id)=>resources.some((r)=>r.id===id)):[target];
    if(!ids.length){setError('The six pilot resources are not loaded yet. Select an existing resource or deploy the pilot batch.');return;}
    setRunning(true);stop.current=false;setError(null);
    const totals:Record<string,number>={};
    try{
      for(let i=0;i<ids.length;i++){
        if(stop.current||!mounted.current)break;
        setNotice('Checking '+(i+1)+' of '+ids.length+'… Public information is not being changed.');
        const result=await checkResourceSource(ids[i]);
        totals[result.status]=(totals[result.status]??0)+1;
      }
      if(!mounted.current)return;
      setNotice((stop.current?'Stopped. ':'Finished. ')+Object.entries(totals).map(([key,count])=>count+' '+key.replaceAll('_',' ')).join(' · '));
      await load();
    }catch(failure){
      if(mounted.current)setError(failure instanceof Error?failure.message:'Source check failed.');
      await load().catch(()=>undefined);
    }finally{if(mounted.current)setRunning(false);}
  }
  async function resolve(finding:SourceFinding,action:'accept'|'dismiss'|'reviewed'){
    setBusy(finding.id);setError(null);
    try{await resolveSourceFinding(finding.id,action,finding.proposed_fields);await Promise.all([load(),onResourcesChanged()]);}
    catch(failure){setError(failure instanceof Error?failure.message:'Could not resolve finding.');}
    finally{setBusy(null);setConfirmation(null);}
  }

  return <section className="mb-4 rounded-2xl border border-surface-container-highest bg-surface-container-lowest p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-xl">
        <h2 className="text-lg font-bold">Check for resource updates</h2>
        <p className="mt-1 text-sm text-on-surface-variant">Compare existing information with its official source. Only meaningful differences go to review. No schedule, automatic edits or new-resource discovery.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm">
          <span className="sr-only">Resources to check</span>
          <select value={target} onChange={(e)=>setTarget(e.target.value)} disabled={running}
            className="max-w-64 rounded-lg border border-surface-container-highest bg-surface px-3 py-2">
            <option value="pilot">Six moving and move-in resources</option>
            {resources.map((resource)=><option key={resource.id} value={resource.id}>{resource.name}{resource.published?'':' (draft)'}</option>)}
          </select>
        </label>
        <button type="button" onClick={run} disabled={running||Boolean(busy)}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50">
          {running?'Checking…':'Check for updates'}
        </button>
        {running&&<button type="button" className="text-sm text-primary" onClick={()=>{stop.current=true;setNotice('Stopping after the current check…');}}>Stop</button>}
      </div>
    </div>
    {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-3 rounded-lg bg-error/5 p-3 text-sm text-error">{error}</p>}
    <div className="mt-4">
      <h3 className="font-semibold text-sm">{findings.length? 'Changes to review ('+Math.min(findings.length,200)+')':'No pending source-change findings'}</h3>
      {findings.length>200&&<p className="text-sm">Showing the first 200. Resolve findings to load more.</p>}
      {findings.slice(0,200).map((finding)=><details key={finding.id} className="mt-2 rounded-xl border border-surface-container-highest p-3">
        <summary className="cursor-pointer font-medium text-sm">{finding.kind==='closure'?'Priority — possible service pause: ':''}{finding.resource_name}</summary>
        <p className="mt-3 text-sm">{finding.summary}</p>
        <a href={safeSource(finding.source_url)} target="_blank" rel="noreferrer noopener" className="mt-2 inline-block text-sm font-semibold text-primary">Read the official source ↗</a>
        {finding.evidence.closure&&<blockquote className="mt-3 border-l-2 border-amber-500 pl-3 text-sm">{finding.evidence.closure}</blockquote>}
        <div className="mt-3 space-y-3">
          {Object.entries(finding.proposed_fields).map(([field,value])=><div key={field} className="rounded-lg bg-surface p-3 text-sm">
            <h4 className="font-semibold">{SOURCE_FIELD_LABELS[field]??field}</h4>
            <dl className="mt-2 grid gap-3 sm:grid-cols-2">
              <div><dt className="font-medium text-on-surface-variant">Current</dt><dd className="mt-1 whitespace-pre-wrap break-words">{formatSourceValue(finding.before_fields[field])}</dd></div>
              <div><dt className="font-medium text-primary">Proposed</dt><dd className="mt-1 whitespace-pre-wrap break-words">{formatSourceValue(value)}</dd></div>
            </dl>
            <blockquote className="mt-3 border-l-2 border-primary/30 pl-3 text-on-surface-variant">{finding.evidence[field]}</blockquote>
          </div>)}
        </div>
        <p className="mt-3 text-xs text-on-surface-variant">A successful page check does not confirm current funding. Approving fields does not refresh the whole listing's verification date.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {!finding.review_only&&<button type="button" disabled={Boolean(busy)||running} onClick={()=>setConfirmation({id:finding.id,action:'accept'})} className="rounded-full bg-primary px-3 py-2 font-semibold text-on-primary disabled:opacity-50">Approve changes</button>}
          <Link to={'/admin/resources/'+finding.resource_id+'/edit'} className="font-semibold text-primary">Edit listing</Link>
          <button type="button" disabled={Boolean(busy)||running} onClick={()=>setConfirmation({id:finding.id,action:'reviewed'})} className="font-semibold text-primary disabled:opacity-50">Reviewed manually</button>
          <button type="button" disabled={Boolean(busy)||running} onClick={()=>setConfirmation({id:finding.id,action:'dismiss'})} className="text-on-surface-variant disabled:opacity-50">Dismiss</button>
        </div>
        {confirmation?.id===finding.id&&<div role="group" aria-label="Confirm finding resolution" className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <p>{confirmation.action==='accept'
            ?'Apply these proposed fields after reviewing the source evidence? Other fields and publication stay unchanged.'
            :confirmation.action==='reviewed'
              ?'Have you reviewed the source and made any needed manual edits? This closes the finding without editing the listing.'
              :'Dismiss this finding? The same evidence will remain dismissed on future checks.'}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" disabled={Boolean(busy)||running} onClick={()=>resolve(finding,confirmation.action)} className="rounded-full bg-primary px-3 py-2 font-semibold text-on-primary disabled:opacity-50">
              {busy?'Saving…':confirmation.action==='accept'?'Confirm approval':confirmation.action==='dismiss'?'Confirm dismissal':'Confirm manual review'}
            </button>
            <button type="button" autoFocus disabled={Boolean(busy)} onClick={()=>setConfirmation(null)} className="px-3 py-2 font-semibold">Cancel</button>
          </div>
        </div>}
      </details>)}
    </div>
    <details className="mt-4 border-t border-surface-container-highest pt-3">
      <summary className="cursor-pointer text-sm font-semibold">Recent checks and source-access issues</summary>
      <p className="mt-2 text-xs text-on-surface-variant">Fetch/comparison attempts are separate from human confirmation. Blocked sources are retried only after a delay and another button click. Up to 100 recent resources shown.</p>
      {!states.length&&<p className="mt-2 text-sm">No source checks have run yet.</p>}
      {states.map((state)=><div key={state.resource_id} className="mt-3 border-t border-surface-container-highest pt-2 text-xs">
        <Link to={'/admin/resources/'+state.resource_id+'/edit'} className="font-semibold text-primary">{resources.find((r)=>r.id===state.resource_id)?.name??'View resource'}</Link>
        <p className="mt-1">{state.last_status.replaceAll('_',' ')} · Last attempt: {date(state.last_attempted_at)}</p>
        <p>Last readable comparison: {date(state.last_success_at)} · Last admin confirmation: {date(state.last_confirmed_at)}</p>
        {state.last_error&&<p className="mt-1 text-amber-800">{state.last_error} Retry after: {date(state.retry_after)}</p>}
      </div>)}
    </details>
  </section>;
}
