import { useEffect, useRef } from "react";

/** The sign-in whose first Home already took the initial focus. */
let takenFor: string | null = null;

/**
 * Whether this Home may ask for the initial focus: only the first Home of a
 * sign-in, for the sign-in it was mounted with. Android TV's tab bar replaces
 * the route, so Home mounts again on every press of its tab, and asking again
 * then pulled the focus off the tab bar, which only the launch may do
 * (docs/conventions/tv.md). `sessionKey` changes with every sign-in, the same
 * user's included. A Home whose sign-in changes under it (an account switch
 * while Home stays mounted on tvOS) neither takes the focus for the new one nor
 * uses up its turn, and does not get it back if the first one returns. Covered
 * by useHomeInitialFocus.test.ts.
 */
export const useHomeInitialFocus = (
  sessionKey: string | undefined,
): boolean => {
  const mountedFor = useRef(sessionKey);
  // Decided once per mount, and claimed only once committed, so a render
  // that never commits does not use up the sign-in's turn.
  const decided = useRef<boolean | null>(null);
  if (decided.current === null) {
    decided.current = !!sessionKey && takenFor !== sessionKey;
  }
  // Lost for good once the sign-in changes: switching back to the account can
  // reuse its sign-in, and the old Home would get its permission back.
  const lost = useRef(false);
  if (sessionKey !== mountedFor.current) lost.current = true;
  const takes = decided.current && !lost.current;

  useEffect(() => {
    if (takes && sessionKey) takenFor = sessionKey;
  }, [takes, sessionKey]);

  return takes;
};

/** Forgets which sign-in took the focus; for tests. */
export const resetHomeInitialFocus = () => {
  takenFor = null;
};
