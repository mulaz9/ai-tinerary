/**
 * Shared helpers to recognise restaurant / food activities.
 *
 * Used both on the client (to show the "Recensioni" link) and on the server
 * (to verify the place exists on OpenStreetMap and snap/replace it).
 */

/** Tags the AI is asked to attach to food/restaurant stops. */
export const FOOD_TAGS = [
  "cibo",
  "food",
  "ristorante",
  "trattoria",
  "osteria",
  "pizzeria",
  "pranzo",
  "cena",
  "colazione",
  "brunch",
  "aperitivo",
  "street food",
];

/** Title keywords that strongly imply a meal / eatery. */
const TITLE_FOOD_RE =
  /\b(ristorant|trattori|osteri|pizzeri|pranzo|cen[ae]|colazion|brunch|aperitiv|gelater|caff[eè]|bistro|tavern|enotec)/i;

/**
 * Returns true when an activity is a restaurant / food stop, based on its
 * tags first and a title heuristic as a fallback.
 */
export function isRestaurant(input: {
  tags?: string[];
  title?: string;
}): boolean {
  const tagHit = !!input.tags?.some((t) =>
    FOOD_TAGS.includes(t.trim().toLowerCase()),
  );
  if (tagHit) return true;
  return input.title ? TITLE_FOOD_RE.test(input.title) : false;
}
