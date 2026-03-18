import { Trip, Day, Activity } from '../types';

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

export default trips;
