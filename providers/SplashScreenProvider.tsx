import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import * as SplashScreen from "expo-splash-screen";

type SplashScreenContextValue = {
  registerLoadingComponent: () => () => void;
  splashScreenVisible: boolean;
};

const SplashScreenContext = createContext<SplashScreenContextValue | undefined>(
  undefined
);

// Prevent splash screen from auto-hiding
void SplashScreen.preventAutoHideAsync();

export const SplashScreenProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [splashScreenVisible, setSplashScreenVisible] = useState(true);
  const loadingComponentsCount = useRef(0);
  const isHidingRef = useRef(false);

  const hideScreenIfNoLoadingComponents = async () => {
    if (loadingComponentsCount.current === 0 && !isHidingRef.current) {
      try {
        isHidingRef.current = true;
        await SplashScreen.hideAsync();
        setSplashScreenVisible(false);
      } catch (error) {
        console.warn("Failed to hide splash screen:", error);
      } finally {
        isHidingRef.current = false;
      }
    }
  };

  const registerLoadingComponent = () => {
    loadingComponentsCount.current += 1;

    return () => {
      loadingComponentsCount.current -= 1;
      void hideScreenIfNoLoadingComponents();
    };
  };

  const contextValue: SplashScreenContextValue = {
    registerLoadingComponent,
    splashScreenVisible,
  };

  return (
    <SplashScreenContext.Provider value={contextValue}>
      {children}
    </SplashScreenContext.Provider>
  );
};

/**
 * Show the Splash Screen until component is ready to be displayed.
 *
 * @param isLoading The loading state of the component
 *
 * ## Usage
 * ```
 * const isLoading = loadSomething()
 * useSplashScreenLoading(isLoading)    // splash screen visible until isLoading is false
 * ```
 */
export function useSplashScreenLoading(isLoading: boolean) {
  const context = useContext(SplashScreenContext);
  if (!context) {
    throw new Error(
      "useSplashScreenLoading must be used within a SplashScreenProvider"
    );
  }

  useEffect(() => {
    if (isLoading) {
      return context.registerLoadingComponent();
    }
  }, [isLoading]);
}

/**
 * Get the visibility of the Splash Screen.
 * @returns the visibility of the Splash Screen
 */
export function useSplashScreenVisible() {
  const context = useContext(SplashScreenContext);
  if (!context) {
    throw new Error(
      "useSplashScreenVisible must be used within a SplashScreenProvider"
    );
  }
  return context.splashScreenVisible;
}
