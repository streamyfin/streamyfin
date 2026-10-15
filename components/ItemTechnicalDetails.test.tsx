import type { MediaStream } from "@jellyfin/sdk/lib/generated-client";
import { render, screen } from "@testing-library/react-native";
import { ItemTechnicalDetails } from "./ItemTechnicalDetails";

// The sheet stays closed here: only the badge row on the item page is under
// test, and a closed sheet shows nothing.
jest.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: () => null,
  BottomSheetBackdrop: () => null,
  BottomSheetScrollView: () => null,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ callout: 18 }),
}));
jest.mock("./common/GlassSurface", () => ({
  GlassSurface: ({ children }: { children: React.ReactNode }) => children,
}));

const renderDetails = (videoStream: MediaStream) =>
  render(
    <ItemTechnicalDetails
      source={{ MediaStreams: [{ Type: "Video", ...videoStream }] }}
    />,
  );

describe("ItemTechnicalDetails frame rate badge", () => {
  // The badge read AverageFrameRate, which the server reports as 1000 for
  // some files while ReferenceFrameRate carries the real rate.
  test("shows the reference frame rate, not an unrealistic average", async () => {
    await renderDetails({ ReferenceFrameRate: 23.976, AverageFrameRate: 1000 });

    expect(screen.getByText("24 fps")).toBeTruthy();
    expect(screen.queryByText("1000 fps")).toBeNull();
  });

  test("shows the average frame rate on a server without a reference rate", async () => {
    await renderDetails({ AverageFrameRate: 25 });

    expect(screen.getByText("25 fps")).toBeTruthy();
  });

  test("shows no frame rate when the stream has none", async () => {
    await renderDetails({ AverageFrameRate: 0 });

    expect(screen.queryByText(/fps/)).toBeNull();
  });
});
