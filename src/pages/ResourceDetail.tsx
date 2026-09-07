import { useLocation, useParams } from 'react-router-dom';
import ResourceDetailView from '../components/ResourceDetailView';
import { usePrograms } from '../hooks/usePrograms';
import { findResourceBySlug } from '../lib/entityRoutes';
import NotFound from './NotFound';
import { useClientReady } from '../hooks/useClientReady';
import { readDirectoryReturn } from '../utils/resourceDirectoryState';

export default function ResourceDetail() {
  const { slug = '' } = useParams();
  const location = useLocation();
  const clientReady = useClientReady();
  const returnTo = clientReady ? readDirectoryReturn(location.state?.resourceDirectory) : undefined;
  const { programs, loading, error } = usePrograms();
  const program = findResourceBySlug(programs, slug);

  if (!program && loading) {
    return <p className="mx-auto max-w-6xl px-6 py-16 text-on-surface-variant">Loading resource…</p>;
  }
  if (!program) return <NotFound />;
  return <ResourceDetailView program={program} error={error} returnTo={returnTo} />;
}
