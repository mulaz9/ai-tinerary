export interface Trip {
  id: string;
  name: string;
  days: Day[];
}

export interface Day {
  day: number;
  activities: Activity[];
}

export interface Activity {
  time: string;
  title: string;
  description: string;
  location: string;
}
