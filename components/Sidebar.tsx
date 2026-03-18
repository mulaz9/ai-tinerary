"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import trips from "../data/trips";
import { Trip } from "../types";
import SafeImage from "./SafeImage";

const Sidebar = () => {
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-80 shrink-0 overflow-y-auto border-r border-white/10 bg-[#141414]/90 p-6 backdrop-blur lg:block">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-white/50">AI-tinerary</p>
          <p className="text-lg font-semibold text-white">Itinerari</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/60">
          Demo
        </span>
      </div>

      <div className="mt-6">
        <Link
          href="/"
          className={`block rounded-xl px-3 py-2 text-sm font-medium transition ${
            pathname === "/" ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
          }`}
        >
          Home
        </Link>
      </div>

      <nav className="mt-5">
        <p className="px-3 text-xs font-semibold text-white/40">Viaggi</p>
        <ul className="mt-2 space-y-1">
          {trips.map((trip) => {
            const active = pathname?.startsWith(`/trip/${trip.id}`);
            return (
              <li key={trip.id}>
                <Link
                  href={`/trip/${trip.id}`}
                  onClick={() => setSelectedTrip(trip)}
                  className={`block rounded-xl px-3 py-2 transition ${
                    active || selectedTrip?.id === trip.id
                      ? "bg-white/10 text-white ring-1 ring-white/10"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {trip.coverImageUrl ? (
                      <SafeImage
                        src={trip.coverImageUrl}
                        alt={trip.name}
                        className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                        fallbackLabel={trip.name}
                      />
                    ) : (
                      <div className="h-9 w-9 shrink-0 rounded-lg bg-white/5 ring-1 ring-white/10" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{trip.name}</p>
                      <p className="truncate text-xs text-white/50">
                        {trip.startDate} → {trip.endDate}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;
