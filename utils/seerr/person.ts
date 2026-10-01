import { orderBy, uniqBy } from "lodash";
import type { PersonCreditCast } from "./types";

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
