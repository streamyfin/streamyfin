import { render } from "@testing-library/react-native";
import { ArtworkImage } from "./ArtworkImage";

// The real image resolves auth headers through the provider tree; the double
// keeps the props each render hands it.
const mockImageProps: Record<string, unknown>[] = [];
jest.mock("@/components/common/ServerImage", () => ({
  Image: (props: Record<string, unknown>) => {
    mockImageProps.push(props);
    return null;
  },
}));

// The mini player and an album page kept the previous album's artwork for one
// that has none, the new source failing (seen on an Android emulator,
// 2026-11-03).
test("keys its view to its source, so a new one starts from blank", async () => {
  const view = await render(
    <ArtworkImage source={{ uri: "http://server/a.jpg" }} />,
  );
  expect(mockImageProps.at(-1)?.recyclingKey).toBe("http://server/a.jpg");

  await view.rerender(<ArtworkImage source={{ uri: "http://server/b.jpg" }} />);
  expect(mockImageProps.at(-1)?.recyclingKey).toBe("http://server/b.jpg");
});

test("keeps a key its caller sets", async () => {
  await render(
    <ArtworkImage
      source={{ uri: "http://server/a.jpg" }}
      recyclingKey='row-1'
    />,
  );
  expect(mockImageProps.at(-1)?.recyclingKey).toBe("row-1");
});
