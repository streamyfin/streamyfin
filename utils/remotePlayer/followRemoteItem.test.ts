import { NO_REMOTE_PLAYBACK } from "@/modules/mpv-player/src/cast/Cast.types";
import { followForeignMedia, followRemoteItem } from "./followRemoteItem";

const tv = (itemId: string | null) => ({
  ...NO_REMOTE_PLAYBACK,
  connected: true,
  phase: "playing" as const,
  itemId,
});
const sent = ["e1", "e2", "e3"];

describe("followRemoteItem", () => {
  test("the item the screen shows, or none yet, is the same", () => {
    expect(followRemoteItem("e1", tv("e1"), sent)).toBe("same");
    expect(followRemoteItem("e1", tv(null), sent)).toBe("same");
  });

  test("another item of the list the phone sent is sent", () => {
    expect(followRemoteItem("e1", tv("e2"), sent)).toBe("sent");
    expect(followRemoteItem(null, tv("e3"), sent)).toBe("sent");
  });

  test("an item the phone did not send is other", () => {
    expect(followRemoteItem("e1", tv("film"), sent)).toBe("other");
  });

  test("media without an item id is other", () => {
    expect(followRemoteItem("e1", { ...tv(null), foreign: true }, sent)).toBe(
      "other",
    );
  });
});

describe("followForeignMedia", () => {
  const shown = { itemId: null, title: "Clip", imageUrl: "https://a/1.jpg" };
  const media = (overrides: object) => ({
    ...tv(null),
    foreign: true,
    title: "Clip",
    imageUrl: "https://a/1.jpg",
    ...overrides,
  });

  test("the media shown, or nothing held, is the same", () => {
    expect(followForeignMedia(shown, media({}))).toBe("same");
    expect(followForeignMedia(shown, tv(null))).toBe("same");
  });

  test("another title, image or item id is other", () => {
    expect(followForeignMedia(shown, media({ title: "Next clip" }))).toBe(
      "other",
    );
    expect(
      followForeignMedia(shown, media({ imageUrl: "https://a/2.jpg" })),
    ).toBe("other");
    expect(
      followForeignMedia(shown, media({ foreign: false, itemId: "e1" })),
    ).toBe("other");
  });
});
