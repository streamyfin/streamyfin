import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * The types of the views Jellyfin 12 gives new ids once, when the server
 * upgrades (jellyfin/jellyfin#17714). Being the only view of its type is what
 * lets a vanished id be matched to its new one, and an admin can create a
 * library of type boxsets, so only a type listed once counts.
 */
const SINGLETON_VIEW_TYPES = new Set(["livetv", "boxsets", "playlists"]);

/** The collection type of each hidden singleton view, by `originKey`. */
export type HiddenViewOrigins = Record<string, string>;

/**
 * Keyed by server and user as well as id: before Jellyfin 12 these ids are
 * derived from names, so two servers can share one and only one of them
 * upgrades, and the Playlists view of each user has an id of its own.
 */
export const originKey = (serverId: string, userId: string, id: string) =>
  `${serverId}\u0000${userId}\u0000${id}`;

export interface HiddenLibraries {
  hidden: string[];
  origins: HiddenViewOrigins;
}

/**
 * Carries the hidden libraries over to the ids the server reports now.
 *
 * A hidden singleton view that is listed has its type recorded, and a shown
 * one has it dropped. One that is gone and was recorded for this server and
 * user has the current view of that type hidden as well. The old id stays:
 * the hidden list is shared by every server, and another one may still list
 * it. Anything else is left alone: a regular library can come back, and
 * nothing says which other library it would be.
 */
export function remapHiddenLibraries(
  hidden: readonly string[],
  knownOrigins: Readonly<HiddenViewOrigins>,
  views: readonly Pick<BaseItemDto, "Id" | "CollectionType" | "ServerId">[],
  userId: string,
): HiddenLibraries {
  // Every view in one answer comes from the server that gave it.
  const serverId = views.find((view) => view.ServerId)?.ServerId;
  if (!serverId) return { hidden: [...hidden], origins: { ...knownOrigins } };
  const keyOf = (id: string) => originKey(serverId, userId, id);

  const listed = new Set<string>();
  // null once a second view of the type turns up.
  const idByType = new Map<string, string | null>();
  for (const { Id, CollectionType } of views) {
    if (!Id) continue;
    listed.add(Id);
    if (CollectionType && SINGLETON_VIEW_TYPES.has(CollectionType)) {
      idByType.set(CollectionType, idByType.has(CollectionType) ? null : Id);
    }
  }

  const origins: HiddenViewOrigins = { ...knownOrigins };
  for (const [type, id] of idByType) {
    if (!id) continue;
    if (hidden.includes(id)) origins[keyOf(id)] = type;
    else delete origins[keyOf(id)];
  }

  const result = new Set(hidden);
  for (const id of hidden) {
    if (listed.has(id)) continue;
    const type = knownOrigins[keyOf(id)];
    const current = type ? idByType.get(type) : undefined;
    if (!current) continue;
    result.add(current);
    origins[keyOf(current)] = type;
    // Carried over once: the user can show the view again under its new id.
    // The hidden list is the device's, so every profile on this server that
    // recorded the old id is done with it too.
    for (const known of Object.keys(origins)) {
      if (
        known.startsWith(`${serverId}\u0000`) &&
        known.endsWith(`\u0000${id}`)
      ) {
        delete origins[known];
      }
    }
  }

  return { hidden: [...result], origins };
}
