import { createContext, type ReactNode, useContext } from "react";

const UNSET = Symbol("OfflineModeNotProvided");

const OfflineModeContext = createContext<boolean | typeof UNSET>(UNSET);

interface OfflineModeProviderProps {
  isOffline: boolean;
  children: ReactNode;
}

/**
 * Provides offline mode state to all child components.
 * Wrap pages that support offline mode with this provider.
 */
export function OfflineModeProvider({
  isOffline,
  children,
}: OfflineModeProviderProps) {
  return (
    <OfflineModeContext.Provider value={isOffline}>
      {children}
    </OfflineModeContext.Provider>
  );
}

/**
 * Returns whether the current view is in offline mode.
 * Must be used within an OfflineModeProvider (set at page level).
 */
export function useOfflineMode(): boolean {
  const context = useContext(OfflineModeContext);
  if (context === UNSET) {
    return false;
  }
  return context;
}
