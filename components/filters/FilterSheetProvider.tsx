import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { type FilterConfig, SharedFilterSheet } from "./SharedFilterSheet";

interface FilterSheetContextType {
  openFilter: (config: FilterConfig) => void;
}

const FilterSheetContext = createContext<FilterSheetContextType | null>(null);

/**
 * Returns the shared-sheet controller, or null when rendered outside a
 * FilterSheetProvider — FilterButton then falls back to its own standalone
 * sheet (used by screens that don't host a provider, e.g. logs / discover).
 */
export const useFilterSheet = (): FilterSheetContextType | null =>
  useContext(FilterSheetContext);

/**
 * Hosts the single shared filter sheet for a screen. Every FilterButton under
 * it calls openFilter() to show its options in that one sheet — so two sheets
 * can never stack regardless of how fast the buttons are tapped. present() runs
 * synchronously from the button's press handler (the modal is always mounted).
 */
export const FilterSheetProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const modalRef = useRef<BottomSheetModal | null>(null);
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<FilterConfig | null>(null);

  // First-wins guard. With a single shared sheet there is exactly one source of
  // truth (this ref) reset on the one close path — so unlike a per-button guard
  // it can't get stuck on remounts or multiple instances. A second tap during
  // the first sheet's open animation is ignored; the first tapped filter wins.
  const openRef = useRef(false);

  const openFilter = useCallback((next: FilterConfig) => {
    if (openRef.current) return;
    openRef.current = true;
    setConfig(next);
    setOpen(true);
    modalRef.current?.present();
  }, []);

  // Single close path for every dismissal (select / swipe / backdrop) — frees
  // the guard reliably.
  const closeSheet = useCallback(() => {
    openRef.current = false;
    setOpen(false);
  }, []);

  const value = useMemo(() => ({ openFilter }), [openFilter]);

  return (
    <FilterSheetContext.Provider value={value}>
      {children}
      <SharedFilterSheet
        modalRef={modalRef}
        open={open}
        setOpen={closeSheet}
        config={config}
      />
    </FilterSheetContext.Provider>
  );
};
