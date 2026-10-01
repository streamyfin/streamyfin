import { orderBy, uniqBy } from "lodash";
import { formatSeerrDate } from "./dates";
import type { PersonCreditCast, PersonDetails } from "./types";

/** A role's own key: TMDB numbers films and series apart. */
export const roleKey = (role: PersonCreditCast): string =>
  `${role.mediaType}-${role.id}`;

/**
 * The titles a person played in, as their page lists them, on the phone and
 * the TV alike: the best known first, each title once.
 */
export const personRoles = (
  cast: PersonCreditCast[] | undefined,
): PersonCreditCast[] =>
  uniqBy(orderBy(cast ?? [], ["voteCount", "voteAverage"], "desc"), roleKey);

/**
 * The line under a person's name, on the phone and the TV alike, as Seerr
 * writes it: "Born" and the date, then the place, each only when Seerr has
 * it. Undefined when it has neither.
 */
export const birthLine = (
  t: (key: string) => string,
  person: Pick<PersonDetails, "birthday" | "placeOfBirth"> | undefined,
  tag: string | undefined,
): string | undefined => {
  const birthday = formatSeerrDate(person?.birthday, tag);
  const parts = [
    birthday && `${t("seerr.born")} ${birthday}`,
    person?.placeOfBirth,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" | ") : undefined;
};
