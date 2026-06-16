import { useTranslations } from "next-intl";
import { Activity } from "../types";
import LocationCard from "./LocationCard";
import { buildReviewsUrl } from "../lib/maps";
import { isRestaurant } from "../lib/restaurant";

interface ActivityCardProps {
  activity: Activity;
  /** Trip destination, used to disambiguate the reviews link. */
  destination?: string;
  checked?: boolean;
  onToggle?: (next: boolean) => void;
  onRemove?: () => void;
  /** Opens an editor for this activity's start time. */
  onEditTime?: () => void;
  /** Scrolls to the trip map and highlights this activity. */
  onShowOnMap?: () => void;
}

const ActivityCard = ({
  activity,
  destination,
  checked,
  onToggle,
  onRemove,
  onEditTime,
  onShowOnMap,
}: ActivityCardProps) => {
  const t = useTranslations("locationCard");
  const reviewsUrl = isRestaurant({
    tags: activity.tags,
    title: activity.title,
  })
    ? buildReviewsUrl(activity.location, destination)
    : undefined;

  return (
    <LocationCard
      title={activity.title}
      time={activity.time}
      description={activity.description}
      location={activity.location}
      photoUrl={activity.photoUrl}
      mapsUrl={activity.mapsUrl}
      reviewsUrl={reviewsUrl}
      onShowOnMap={onShowOnMap}
      transport={activity.transport}
      checked={checked}
      onToggle={onToggle}
      onRemove={onRemove}
      onEditTime={onEditTime}
      meta={
        <>
          {typeof activity.durationMins === "number" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1">
              <span className="h-1 w-1 rounded-full bg-white/30" />
              {t("minutes", { count: activity.durationMins })}
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
