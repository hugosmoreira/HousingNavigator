import { useParams } from 'react-router-dom';
import AffordablePropertyForm from '../components/AffordablePropertyForm';

export default function AdminAffordablePropertyEdit() {
  const { id } = useParams<{ id: string }>();
  return <AffordablePropertyForm mode="edit" propertyId={id} />;
}
