import { useEffect, useRef } from "react";

/** The session whose first Home already took the initial focus. */
let takenFor: string | null = null;

/**
 * Whether this Home may ask for the initial focus: only the first Home of a
 * session. Android TV's tab bar replaces the route, so Home mounts again on
 * every press of its tab, and clearing the cache remounts it on tvOS; asking
 * again then pulled the focus off the tab bar, which only the launch may do
 * (docs/conventions/tv.md). Covered by useHomeInitialFocus.test.ts.
 */
export const useHomeInitialFocus = (
  sessionKey: string | undefined,
): boolean => {
  // Decided once per mount, and claimed only once committed, so a render
  // that never commits does not use up the session's turn.
  const decided = useRef<boolean | null>(null);
  if (decided.current === null) {
    decided.current = !!sessionKey && takenFor !== sessionKey;
  }

  useEffect(() => {
    if (decided.current && sessionKey) takenFor = sessionKey;
  }, [sessionKey]);

  return decided.current;
};

/** Forgets which session took the focus; for tests. */
export const resetHomeInitialFocus = () => {
  takenFor = null;
};
