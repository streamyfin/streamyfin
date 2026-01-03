import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type React from "react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

interface ModalOptions {
  enableDynamicSizing?: boolean;
  snapPoints?: (string | number)[];
  enablePanDownToClose?: boolean;
  backgroundStyle?: object;
  handleIndicatorStyle?: object;
}

interface GlobalModalState {
  content: ReactNode | null;
  options?: ModalOptions;
}

interface GlobalModalContextType {
  showModal: (content: ReactNode, options?: ModalOptions) => void;
  hideModal: () => void;
  isVisible: boolean;
  modalState: GlobalModalState;
  modalRef: React.RefObject<BottomSheetModal | null>;
}

const GlobalModalContext = createContext<GlobalModalContextType | undefined>(
  undefined,
);

export const useGlobalModal = () => {
  const context = useContext(GlobalModalContext);
  if (!context) {
    throw new Error("useGlobalModal must be used within GlobalModalProvider");
  }
  return context;
};

interface GlobalModalProviderProps {
  children: ReactNode;
}

export const GlobalModalProvider: React.FC<GlobalModalProviderProps> = ({
  children,
}) => {
  const [modalState, setModalState] = useState<GlobalModalState>({
    content: null,
    options: undefined,
  });
  const [isVisible, setIsVisible] = useState(false);
  const modalRef = useRef<BottomSheetModal>(null);

  const showModal = useCallback(
    (content: ReactNode, options?: ModalOptions) => {
      setModalState({ content, options });
      setIsVisible(true);
    },
    [],
  );

  const hideModal = useCallback(() => {
    modalRef.current?.dismiss();
    setIsVisible(false);
    // Clear content after dismiss animation completes
    requestAnimationFrame(() => {
      setModalState({ content: null, options: undefined });
    });
  }, []);

  const value = {
    showModal,
    hideModal,
    isVisible,
    modalState,
    modalRef,
  };

  return (
    <GlobalModalContext.Provider value={value}>
      {children}
    </GlobalModalContext.Provider>
  );
};

export type { GlobalModalContextType, ModalOptions };
