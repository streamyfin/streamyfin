import type { UserDto } from "@jellyfin/sdk/lib/generated-client";

/**
 * Whether Jellyfin lets this user write an item's user data (played state,
 * resume position) through POST /UserItems/:id/UserData. The route answers
 * 403 to anyone but an administrator whose policy has
 * EnableUserPreferenceAccess off. Playback reports and the played and
 * unplayed routes do not carry that check.
 *
 * A user whose policy has not loaded is let through: the server has the last
 * word either way.
 */
export const canUpdateUserData = (
  user: UserDto | null | undefined,
): boolean => {
  const policy = user?.Policy;
  if (!policy) return true;
  return (
    policy.IsAdministrator === true ||
    policy.EnableUserPreferenceAccess !== false
  );
};
