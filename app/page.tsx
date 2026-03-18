import { Suspense } from 'react';
import Sidebar from '../components/Sidebar';

export default function Home() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <Suspense fallback={<div>Loading...</div>}>
        <TripDetails />
      </Suspense>
    </div>
  );
}
