import { useState } from 'react';
import { Trip } from '../types';

const trips: Trip[] = [
  {
    id: '1',
    name: 'Trip to Paris',
    days: [
      {
        day: 1,
        activities: [
          { time: '9:00', title: 'Check-in at Hotel', description: '', location: 'Hotel' },
          { time: '10:00', title: 'Visit Eiffel Tower', description: '', location: 'Eiffel Tower' },
          // Add more activities
        ],
      },
      // Add more days
    ],
  },
  {
    id: '2',
    name: 'Trip to New York',
    days: [
      {
        day: 1,
        activities: [
          { time: '9:00', title: 'Check-in at Hotel', description: '', location: 'Hotel' },
          { time: '10:00', title: 'Visit Statue of Liberty', description: '', location: 'Statue of Liberty' },
          // Add more activities
        ],
      },
      // Add more days
    ],
  },
];

const Sidebar = () => {
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);

  return (
    <div className="w-64 bg-gray-100 p-4">
      <h2 className="text-lg font-bold">Trips</h2>
      <ul>
        {trips.map((trip) => (
          <li
            key={trip.id}
            onClick={() => setSelectedTrip(trip)}
            className={`cursor-pointer py-2 px-3 hover:bg-gray-200 ${selectedTrip?.id === trip.id ? 'bg-gray-200' : ''}`}
          >
            {trip.name}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Sidebar;
