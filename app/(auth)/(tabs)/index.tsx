import { Redirect } from "expo-router";

// "/" matches this route. Native tabs never render it, the tabs layout
// redirects instead; the Android TV stack does render it.
export default function Index() {
  return <Redirect href='/(auth)/(tabs)/(home)' />;
}
