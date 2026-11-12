import type {
  BaseItemPerson,
  PersonKind,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

interface Options {
  /**
   * Keep only people credited as one of these kinds. Pass a constant
   * (`constants/CastCrew.ts`): a new array on every render gives a new answer.
   */
  kinds?: readonly PersonKind[];
  /**
   * A person with no role gets the name of their credit instead, in the
   * user's language. Left off, such a person has no role.
   */
  labelRoles?: boolean;
  /** Keep at most this many people, counted after the merge. */
  limit?: number;
}

/** A merged person: always has an `Id`, so it can be opened and keyed on. */
export type CastCrewPerson = BaseItemPerson & { Id: string };

/**
 * What one credit says about a person: the role when there is one, otherwise
 * the kind of credit. Crew members usually come without a role.
 */
const creditText = (
  person: BaseItemPerson,
  kindLabel: ((kind: string) => string) | undefined,
): string | undefined => {
  const role = person.Role?.trim();
  if (role) return role;
  if (!kindLabel || !person.Type || person.Type === "Unknown") return undefined;
  return kindLabel(person.Type).trim() || undefined;
};

/**
 * Collapses the credits of an item to one entry per person, in the order they
 * first appear. `Role` of the result lists everything the person is credited
 * for, each once, or is null when no credit says anything.
 *
 * Returns new objects: the input is the query's cached data.
 */
const mergePeopleById = (
  people: BaseItemPerson[] | null | undefined,
  kindLabel: ((kind: string) => string) | undefined,
): CastCrewPerson[] => {
  const merged = new Map<string, { person: BaseItemPerson; roles: string[] }>();

  for (const person of people ?? []) {
    if (!person.Id) continue;

    let entry = merged.get(person.Id);
    if (!entry) {
      entry = { person, roles: [] };
      merged.set(person.Id, entry);
    } else if (!entry.person.Name?.trim() && person.Name?.trim()) {
      // A later credit can carry the name the first one lacked.
      entry.person = { ...entry.person, Name: person.Name };
    }

    const text = creditText(person, kindLabel);
    if (text && !entry.roles.includes(text)) entry.roles.push(text);
  }

  return [...merged].map(([id, { person, roles }]) => ({
    ...person,
    Id: id,
    Role: roles.length > 0 ? roles.join(", ") : null,
  }));
};

/**
 * The people of an item, one entry per person in the order they first appear.
 * The server lists a person once per credit, so an actor with two roles
 * arrives twice under the same `Id`: merged, `Id` is safe to use as a list
 * key, and a cut of the result counts people.
 *
 * People without an `Id` are dropped: they cannot be opened.
 */
export const useCastCrew = (
  people: BaseItemPerson[] | null | undefined,
  { kinds, labelRoles = false, limit }: Options = {},
): CastCrewPerson[] => {
  const { t } = useTranslation();

  return useMemo(
    () =>
      mergePeopleById(
        kinds
          ? people?.filter((p) => !!p.Type && kinds.includes(p.Type))
          : people,
        // A missing kind label falls back to the server's own word for it,
        // which is what a kind newer than the catalogue shows as.
        labelRoles
          ? (k) => t(`item_card.person_kind.${k}`, { defaultValue: k })
          : undefined,
      ).slice(0, limit),
    [people, kinds, labelRoles, limit, t],
  );
};

/** Person kinds that get a labelled credits line, in the order the lines are drawn. */
const CREDIT_KINDS = [
  "Director",
  "Writer",
  "Creator",
  "Author",
  "Narrator",
] as const satisfies readonly PersonKind[];

type CreditKind = (typeof CREDIT_KINDS)[number];

interface CreditPerson {
  /** Missing when the server sent a bare name: shown, but not linked. */
  id?: string;
  name: string;
}

interface CreditLine {
  kind: CreditKind;
  people: CreditPerson[];
}

/**
 * The people of an item as labelled credits lines (directors, writers, ...),
 * one per kind in `CREDIT_KINDS`. A kind nobody is credited for gets no line.
 *
 * Dedupes apart from `useCastCrew` on purpose: by id or name within one kind,
 * keeping bare names. Sharing one merge would drop unlinked credits.
 */
export const useCreditLines = (
  people: BaseItemPerson[] | null | undefined,
): CreditLine[] =>
  useMemo(() => {
    const lines: CreditLine[] = [];

    for (const kind of CREDIT_KINDS) {
      // The server lists a person once per job, so someone credited for both
      // the story and the screenplay arrives as two writers.
      const seen = new Set<string>();
      const credited: CreditPerson[] = [];

      for (const person of people ?? []) {
        if (person.Type !== kind) continue;
        const name = person.Name?.trim();
        if (!name) continue;
        // An empty id is no id: keyed on it, every such person would collapse
        // into the first.
        const id = person.Id || undefined;
        const key = id ?? name;
        if (seen.has(key)) continue;
        seen.add(key);
        credited.push({ id, name });
      }

      if (credited.length > 0) lines.push({ kind, people: credited });
    }

    return lines;
  }, [people]);
