import { Activity } from "../types";
import LocationCard from "./LocationCard";

interface ActivityCardProps {
  activity: Activity;
  checked?: boolean;
  onToggle?: (next: boolean) => void;
}

const ActivityCard = ({ activity, checked, onToggle }: ActivityCardProps) => {
  return (
    <LocationCard
      title={activity.title}
      time={activity.time}
      description={activity.description}
      location={activity.location}
      photoUrl={activity.photoUrl}
      mapsUrl={activity.mapsUrl}
      transport={activity.transport}
      checked={checked}
      onToggle={onToggle}
      meta={
        <>
          {typeof activity.durationMins === "number" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1">
              <span className="h-1 w-1 rounded-full bg-white/30" />
              {activity.durationMins} min
            </span>
          ) : null}
          {activity.tags?.length ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1">
              <span className="h-1 w-1 rounded-full bg-white/30" />
              {activity.tags.join(" · ")}
            </span>
          ) : null}
        </>
      }
    />
  );
};

export default ActivityCard;
