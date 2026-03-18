import { useParams } from 'next/navigation';
import TripCard from '../components/TripCard';

export default function TripDetails() {
  const { id } = useParams();
  return (
    <div className="flex-1 p-4">
      <TripCard tripId={id} />
    </div>
  );
}
