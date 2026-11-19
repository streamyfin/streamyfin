import { Stack } from "expo-router";
import { act, renderRouter } from "expo-router/testing-library";
import { Text } from "react-native";
import useRouter from "@/hooks/useAppRouter";

// The unit config maps expo-router to a stub with no navigators, and this
// spec renders real routes: it takes the package itself, which loads in Jest.
jest.mock("expo-router", () => jest.requireActual("expo-router/build/index"));

let mockScreenRouter: ReturnType<typeof useRouter>;
function Home() {
  mockScreenRouter = useRouter();
  return <Text>Home</Text>;
}

// A provider in the root layout, above the stack: expo-router renders the
// layout inside its own root route, which never takes the focus again.
let mockRootRouter: ReturnType<typeof useRouter>;
function RootStandIn() {
  mockRootRouter = useRouter();
  return null;
}

const renderApp = () =>
  renderRouter({
    _layout: () => (
      <>
        <Stack />
        <RootStandIn />
      </>
    ),
    index: Home,
    "now-playing": () => <Text>Now Playing</Text>,
    album: () => <Text>Album</Text>,
  });

const stackRouteNames = (router: Awaited<ReturnType<typeof renderApp>>) =>
  (router.getRouterState()?.routes[0]?.state?.routes ?? []).map(
    (route) => route.name,
  );

describe("useAppRouter push guard", () => {
  it("drops a second push from a screen in the same press", async () => {
    const router = await renderApp();

    await act(async () => {
      mockScreenRouter.push("/now-playing");
      mockScreenRouter.push("/album");
    });

    expect(stackRouteNames(router)).toEqual(["index", "now-playing"]);
  });

  it("lets a screen push again once it has the focus back", async () => {
    const router = await renderApp();

    await act(async () => mockScreenRouter.push("/now-playing"));
    await act(async () => mockScreenRouter.back());
    await act(async () => mockScreenRouter.push("/album"));

    expect(router.getPathname()).toBe("/album");
  });

  // The intro sheet is mounted at the root: two taps on its settings button
  // in one press stacked two settings screens.
  it("drops a second push from the root layout in the same press", async () => {
    const router = await renderApp();

    await act(async () => {
      mockRootRouter.push("/now-playing");
      mockRootRouter.push("/album");
    });

    expect(stackRouteNames(router)).toEqual(["index", "now-playing"]);
  });

  it("pushes again from the root layout once the pushed screen is gone", async () => {
    const router = await renderApp();

    await act(async () => mockRootRouter.push("/now-playing"));
    await act(async () => mockRootRouter.back());
    expect(router.getPathname()).toBe("/");

    await act(async () => mockRootRouter.push("/now-playing"));
    expect(router.getPathname()).toBe("/now-playing");
  });
});
