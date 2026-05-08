import { useParams } from 'react-router-dom';
import WaitlistForm from '../components/WaitlistForm';

export default function AdminWaitlistEdit() {
  const { id } = useParams<{ id: string }>();
  return <WaitlistForm mode="edit" waitlistId={id} />;
}
