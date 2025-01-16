import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import * as Crypto from 'expo-crypto';
import * as SplashScreen from "expo-splash-screen";

class ChangeListenerMap<K, V> extends Map<K, V> {
    constructor(private readonly onChange: (e: { self: ChangeListenerMap<K, V>, key: K, oldValue: V | undefined, newValue: V }) => void) {
        super()
    }

    public set(key: K, value: V): this {
        const oldValue = this.get(key);
        super.set(key, value);
        if(oldValue !== value) {
            this.onChange({ self: this, key, oldValue, newValue: value })
        }
        return this;
    }
}

type SplashScreenContextValue = {
    splashScreenVisible: boolean,
    componentLoaded: Map<string, boolean>
}

const SplashScreenContext = createContext<SplashScreenContextValue | undefined>(undefined)

SplashScreen.preventAutoHideAsync();

export const SplashScreenProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {

    const [splashScreenVisible, setSplashScreenVisible] = useState(true)

    const contextValue: SplashScreenContextValue = {
        splashScreenVisible,
        componentLoaded: new ChangeListenerMap(({ self }) => {
            for(const entry of self.entries()) {
                if(!entry[1]) {
                    // one component not loaded yet, not hiding splash screen
                    return
                }
            }
            SplashScreen.hideAsync()
            setSplashScreenVisible(false)
        })
    }

    return (
        <SplashScreenContext.Provider value={contextValue}>
            {children}
        </SplashScreenContext.Provider>
    )
}

/**
 * Show the Splash Screen until component is ready to be displayed.
 * 
 * This only has an effect when component is mounted before Splash Screen is hidden,
 * so it should only be used in components that show up on launch.
 * 
 * @param isLoading The loading state of the component
 * 
 * ## Usage
 * ```
 * // Example 1:
 * const isLoading = loadSomething()
 * useSplashScreenLoading(isLoading)    // splash screen visible until isLoading is false
 * ```
 * ```
 * 
 * // Example 2: multiple loading states
 * const isLoading1 = loadSomething()
 * useSplashScreenLoading(isLoading1)   // splash screen visible until isLoading1 and isLoading2 are false
 * 
 * // this could be in different component and still have the same effect
 * const isLoading2 = loadSomethingElse()
 * useSplashScreenLoading(isLoading2)
 * ```
 */
export function useSplashScreenLoading(isLoading: boolean) {
    const id = useMemo(() => Crypto.randomUUID(), []);

    const context = useContext(SplashScreenContext);
    if(!context) {
        throw new Error("useSplashScreenLoading must be used within a SplashScreenProvider");
    }

    useEffect(() => {
        // update the loading state of component
        context.componentLoaded.set(id, !isLoading)

        // cleanup when unmounting component
        return () => {
            context.componentLoaded.delete(id);
        };
    }, [isLoading])
}

/**
 * Get the visiblity of the Splash Screen.
 * @returns the visibility of the Splash Screen
 * 
 * ## Usage
 * ```
 * const splashScreenIsVisible = useSplashScreenVisible()
 * ```
 */
export function useSplashScreenVisible() {
    const context = useContext(SplashScreenContext);
    if(!context) {
        throw new Error("useSplashScreenVisible must be used within a SplashScreenProvider");
    }
    return context.splashScreenVisible
}