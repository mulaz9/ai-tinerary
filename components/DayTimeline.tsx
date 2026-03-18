import { Day } from '../types';

interface DayTimelineProps {
  days: Day[];
}

const DayTimeline = ({ days }: DayTimelineProps) => {
  return (
    <div className="mt-4">
      {days.map((day, index) => (
        <div key={index} className="mb-2">
          <h3 className="text-lg font-bold">Day {day.day}</h3>
          <ul>
            {day.activities.map((activity, activityIndex) => (
              <li key={activityIndex} className="flex items-center space-x-2">
                <span>{activity.time}</span>
                <div className="border-l-4 pl-2">
                  <h4 className="font-bold">{activity.title}</h4>
                  <p>{activity.description}</p>
                  <p>{activity.location}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default DayTimeline;
