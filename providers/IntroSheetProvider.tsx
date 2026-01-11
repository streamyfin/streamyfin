import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
} from "react";
import { IntroSheet, type IntroSheetRef } from "@/components/IntroSheet";

interface IntroSheetContextType {
  showIntro: () => void;
  hideIntro: () => void;
}

const IntroSheetContext = createContext<IntroSheetContextType | undefined>(
  undefined,
);

export const useIntroSheet = () => {
  const context = useContext(IntroSheetContext);
  if (!context) {
    throw new Error("useIntroSheet must be used within IntroSheetProvider");
  }
  return context;
};

interface IntroSheetProviderProps {
  children: ReactNode;
}

export const IntroSheetProvider: React.FC<IntroSheetProviderProps> = ({
  children,
}) => {
  const sheetRef = useRef<IntroSheetRef>(null);

  const showIntro = useCallback(() => {
    sheetRef.current?.present();
  }, []);

  const hideIntro = useCallback(() => {
    sheetRef.current?.dismiss();
  }, []);

  const value = {
    showIntro,
    hideIntro,
  };

  return (
    <IntroSheetContext.Provider value={value}>
      {children}
      <IntroSheet ref={sheetRef} />
    </IntroSheetContext.Provider>
  );
};
