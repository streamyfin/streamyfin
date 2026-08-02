// Web shim: @bottom-tabs/react-navigation binds to the platform's native tab
// bar (UITabBarController / BottomNavigationView), which does not exist in a
// browser. `createNativeBottomTabNavigator()` runs at module scope in
// app/(auth)/(tabs)/_layout.tsx, so it has to import cleanly on web — but the
// navigator it returns is never rendered there: that file branches to
// WebTabLayout, which uses expo-router's JS <Tabs> instead.

const NeverRendered = () => null;

export const createNativeBottomTabNavigator = () => ({
  Navigator: NeverRendered,
  Screen: NeverRendered,
  Group: NeverRendered,
});

export default createNativeBottomTabNavigator;
