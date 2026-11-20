import { Stack } from "expo-router";
import { act, renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";
import useRouter from "@/hooks/useAppRouter";
import { nowPlayingScreen } from "./nowPlayingScreen";

// The unit config maps expo-router to a stub with no navigators, and this
// spec renders real routes: it takes the package itself, which loads in Jest.
jest.mock("expo-router", () => jest.requireActual("expo-router/build/index"));

type RouteState = { name: string; state?: { routes: RouteState[] } };

const routeNames = (routes: RouteState[]): string[] =>
  routes.flatMap((route) => [
    route.name,
    ...routeNames(route.state?.routes ?? []),
  ]);

// The mini player opens the player from a screen; the music provider pushes it
// again from the root layout when a cast starts or resumes on the TV, or when
// the notification is tapped, with the player already on screen.
let mockOpenFromScreen = () => {};
let mockOpenFromProvider = () => {};
function Home() {
  const router = useRouter();
  mockOpenFromScreen = () => router.push("/(auth)/now-playing");
  return <Text>Home</Text>;
}
function ProviderStandIn() {
  const router = useRouter();
  mockOpenFromProvider = () => router.push("/(auth)/now-playing");
  return null;
}

it("opens one music player over the one on screen", async () => {
  const router = await renderRouter({
    _layout: () => (
      <>
        <Stack>
          <Stack.Screen {...nowPlayingScreen} />
        </Stack>
        <ProviderStandIn />
      </>
    ),
    index: Home,
    "(auth)/now-playing": () => <Text>Now Playing</Text>,
  });

  await act(async () => mockOpenFromScreen());
  await act(async () => mockOpenFromProvider());

  const names = routeNames(router.getRouterState()?.routes ?? []);
  expect(names.filter((name) => name === "(auth)/now-playing")).toHaveLength(1);
  expect(screen.getByText("Now Playing")).toBeTruthy();
});
