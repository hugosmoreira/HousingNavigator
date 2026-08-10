import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { requireSupabase } from '../../lib/supabaseClient';
import {
  curateResourceBatch,
  partitionResourceCurationChecks,
  type ResourceCurationCheck,
  type ResourceCurationRun,
} from '../curateResources';

interface Props {
  onResourcesChanged: () => Promise<unknown>;
}

function runSummary(run: ResourceCurationRun): string {
  if (run.target_count === 0) return 'No published resources are missing core information.';
  if (run.status === 'running') {
    return `Processed ${run.processed_count} of ${run.target_count} resources.`;
  }
  return `${run.updated_count} updated, ${run.needs_review_count} need review, ${run.failed_count} could not be read.`;
}

export default function ResourceCurationPanel({ onResourcesChanged }: Props) {
  const [latestRun, setLatestRun] = useState<ResourceCurationRun | null>(null);
  const [checks, setChecks] = useState<ResourceCurationCheck[]>([]);
  const [updatedChecks, setUpdatedChecks] = useState<ResourceCurationCheck[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const loadHistory = useCallback(async () => {
    const client = await requireSupabase();
    const { data: runData, error: runError } = await client
      .from('resource_curation_runs')
      .select(
        'id,status,target_count,processed_count,updated_count,needs_review_count,failed_count,started_at,finished_at,error',
      )
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (runError) throw runError;

    const run = (runData ?? null) as ResourceCurationRun | null;
    let recentChecks: ResourceCurationCheck[] = [];
    if (run) {
      const { data: checkData, error: checkError } = await client
        .from('resource_curation_checks')
        .select('id,resource_id,resource_name,action,applied_fields,notes,error,checked_at')
        .eq('run_id', run.id)
        .order('checked_at', { ascending: false })
        .limit(100);
      if (checkError) throw checkError;
      const allChecks = (checkData ?? []) as ResourceCurationCheck[];
      const partitioned = partitionResourceCurationChecks(allChecks);
      recentChecks = partitioned.unresolved;
      if (mounted.current) {
        setUpdatedChecks(partitioned.updated);
      }
    } else if (mounted.current) {
      setUpdatedChecks([]);
    }
    if (mounted.current) {
      setLatestRun(run);
      setChecks(recentChecks);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadHistory()
      .catch((loadError) => {
        if (mounted.current) {
          setError(
            loadError instanceof Error
              ? `Curation history is unavailable: ${loadError.message}`
              : 'Curation history is unavailable.',
          );
        }
      })
      .finally(() => {
        if (mounted.current) setLoadingHistory(false);
      });
    return () => {
      // An in-flight server batch is allowed to finish, but this prevents the
      // component from sending another batch after the administrator leaves.
      mounted.current = false;
    };
  }, [loadHistory]);

  async function handleCurate() {
    const resuming = latestRun?.status === 'running';
    if (
      !window.confirm(
        resuming
          ? 'Resume the unfinished resource curation run?'
          : 'Curate published resources that are missing required public information? Completed records will be skipped and existing content will not be overwritten.',
      )
    ) {
      return;
    }

    setRunning(true);
    setError(null);
    setNotice(null);
    let runId = resuming ? latestRun.id : undefined;
    let previousProcessed = resuming ? latestRun.processed_count : 0;
    let batches = 0;
    try {
      while (mounted.current) {
        batches += 1;
        if (batches > 100) {
          throw new Error('Curation stopped after 100 batches. Resume it after reviewing the latest results.');
        }
        const response = await curateResourceBatch(runId);
        runId = response.run.id;
        if (!mounted.current) return;
        setLatestRun(response.run);
        setNotice(runSummary(response.run));
        if (response.remaining === 0) break;
        if (response.run.processed_count <= previousProcessed) {
          throw new Error(
            'Curation made no progress in the last batch. It was stopped to avoid repeating the same resources.',
          );
        }
        previousProcessed = response.run.processed_count;
      }
      if (!mounted.current) return;
      await Promise.all([onResourcesChanged(), loadHistory()]);
    } catch (curationError) {
      if (mounted.current) {
        setError(
          curationError instanceof Error
            ? curationError.message
            : 'Resource curation failed.',
        );
        await loadHistory().catch(() => undefined);
      }
    } finally {
      if (mounted.current) setRunning(false);
    }
  }

  const hasUnfinishedRun = latestRun?.status === 'running';

  return (
    <section className="mb-6 rounded-2xl border border-surface-container-highest bg-surface-container-lowest p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="font-headline font-bold text-lg">Resource curation</h2>
          </div>
          <p className="mt-1 text-sm text-on-surface-variant">
            Checks published resources missing a description, required eligibility, or
            a usable official page. It fills supported blank fields only; completed
            records are skipped and nothing runs automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCurate}
          disabled={running || loadingHistory}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
          {running
            ? latestRun
              ? `Curating ${latestRun.processed_count}/${latestRun.target_count}`
              : 'Starting…'
            : hasUnfinishedRun
              ? 'Resume curation'
              : 'Curate resources'}
        </button>
      </div>

      {latestRun && !running && (
        <div className="mt-4 flex items-start gap-2 text-sm text-on-surface-variant">
          {latestRun.status === 'completed' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          ) : (
            <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          )}
          <span>
            Last run: {runSummary(latestRun)}{' '}
            <span className="whitespace-nowrap">
              ({new Date(latestRun.started_at).toLocaleString()})
            </span>
          </span>
        </div>
      )}

      {notice && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          {notice}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {updatedChecks.length > 0 && (
        <div className="mt-4 border-t border-surface-container-highest pt-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-on-surface">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            Changes from the last run
          </div>
          <ul className="space-y-2 text-sm">
            {updatedChecks.map((check) => (
              <li key={check.id} className="flex items-start justify-between gap-3">
                <div>
                  <span className="font-medium text-on-surface">{check.resource_name}</span>
                  <span className="ml-2 text-on-surface-variant">
                    Filled {check.applied_fields.map((field) => field.replaceAll('_', ' ')).join(', ')}
                  </span>
                </div>
                <Link
                  to={`/admin/resources/${check.resource_id}/edit`}
                  className="shrink-0 font-semibold text-primary hover:underline"
                >
                  View
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {checks.length > 0 && (
        <div className="mt-4 border-t border-surface-container-highest pt-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-on-surface">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Unresolved items from the last run
          </div>
          <ul className="space-y-2 text-sm">
            {checks.map((check) => (
              <li key={check.id} className="flex items-start justify-between gap-3">
                <div>
                  <span className="font-medium text-on-surface">{check.resource_name}</span>
                  <span className="ml-2 text-on-surface-variant">
                    {check.action === 'updated' && check.applied_fields.length > 0
                      ? `Filled ${check.applied_fields.map((field) => field.replaceAll('_', ' ')).join(', ')}; ${check.notes || 'still requires review'}`
                      : check.error || check.notes || check.action.replaceAll('_', ' ')}
                  </span>
                </div>
                <Link
                  to={`/admin/resources/${check.resource_id}/edit`}
                  className="shrink-0 font-semibold text-primary hover:underline"
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
