import { useParams } from 'react-router-dom';
import ResourceForm from '../components/ResourceForm';

export default function AdminResourceEdit() {
  const { id } = useParams<{ id: string }>();
  return <ResourceForm mode="edit" resourceId={id} />;
}
