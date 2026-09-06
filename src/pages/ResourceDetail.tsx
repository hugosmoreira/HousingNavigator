import { useParams } from 'react-router-dom';
import ResourceDetailView from '../components/ResourceDetailView';
import { usePrograms } from '../hooks/usePrograms';
import { findResourceBySlug } from '../lib/entityRoutes';
import NotFound from './NotFound';

export default function ResourceDetail() {
  const { slug = '' } = useParams();
  const { programs, loading, error } = usePrograms();
  const program = findResourceBySlug(programs, slug);

  if (!program && loading) {
    return <p className="mx-auto max-w-6xl px-6 py-16 text-on-surface-variant">Loading resource…</p>;
  }
  if (!program) return <NotFound />;
  return <ResourceDetailView program={program} error={error} />;
}
