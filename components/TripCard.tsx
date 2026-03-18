import { useState } from 'react';
import DayTimeline from '../DayTimeline';

interface TripProps {
  tripId: string;
}

const trips: { [key: string]: any } = {
  '1': {
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
  '2': {
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
};

const TripCard = ({ tripId }: TripProps) => {
  const trip = trips[tripId];

  return (
    <div className="bg-white p-4 rounded-lg shadow-md mb-4">
      <h2 className="text-xl font-bold mb-2">{trip.name}</h2>
      <DayTimeline days={trip.days} />
    </div>
  );
};

export default TripCard;
