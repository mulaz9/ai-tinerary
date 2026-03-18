import { Activity } from '../types';

interface ActivityCardProps {
  activity: Activity;
}

const ActivityCard = ({ activity }: ActivityCardProps) => {
  return (
    <div className="border p-4 rounded-lg shadow-md">
      <h3 className="text-lg font-bold">{activity.title}</h3>
      <p>{activity.description}</p>
      <p>{activity.location}</p>
    </div>
  );
};

export default ActivityCard;
