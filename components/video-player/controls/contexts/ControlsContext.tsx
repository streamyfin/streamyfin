import { createContext, useContext } from "react";

interface ControlsContextProps {
  /**
   * Lets descendants (e.g. the settings popover) pause the controls auto-hide
   * while an interactive menu is open, so it can't be dismissed out from under
   * the user. Mirrors the `settingsMenuOpen` state owned by `Controls`.
   */
  setSettingsMenuOpen: (open: boolean) => void;
}

const ControlsContext = createContext<ControlsContextProps | undefined>(
  undefined,
);

export const ControlsProvider = ControlsContext.Provider;

export const useControlsContext = () => {
  const ctx = useContext(ControlsContext);
  if (!ctx) {
    throw new Error(
      "useControlsContext must be used within a ControlsProvider",
    );
  }
  return ctx;
};
