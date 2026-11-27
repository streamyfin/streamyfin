import type { Api } from "@jellyfin/sdk";
import { render } from "@testing-library/react-native";
import type { TestInstance } from "test-renderer";
import { TVChannelCard } from "./TVChannelCard";

// The hook only drives the focus scale; its import drags in the provider graph.
jest.mock("@/components/tv/hooks/useTVFocusAnimation", () => ({
  useTVFocusAnimation: () => ({
    focused: false,
    handleFocus: jest.fn(),
    handleBlur: jest.fn(),
    animatedStyle: {},
  }),
}));

const api = { basePath: "https://jellyfin.example" } as Api;

const imageIds = (root: TestInstance | null) =>
  root!
    .queryAll((node) => String(node.props.testID ?? "").startsWith("image "))
    .map((node) => node.props.testID);

describe("TVChannelCard", () => {
  // The channel logo is a server image: it goes through ServerImage so the
  // user's custom proxy headers are attached.
  test("loads a tagged channel logo through the ServerImage", async () => {
    const { root } = await render(
      <TVChannelCard
        api={api}
        onPress={jest.fn()}
        channel={{
          Id: "channel-1",
          Name: "News",
          ImageTags: { Primary: "logo-tag" },
        }}
      />,
    );

    // Web: 5
    expect(imageIds(root)).toEqual([
      "image https://jellyfin.example/Items/channel-1/Images/Primary?fillWidth=200&quality=90&tag=logo-tag",
    ]);
  });

  test("shows the channel number, not an untagged URL, without a logo", async () => {
    const { root } = await render(
      <TVChannelCard
        api={api}
        onPress={jest.fn()}
        channel={{ Id: "channel-1", Name: "News", ChannelNumber: "7" }}
      />,
    );

    expect(imageIds(root)).toEqual([]);
  });
});
