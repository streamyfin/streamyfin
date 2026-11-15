import type * as ImageColorsType from "react-native-image-colors";
import { extractImageColor } from "./imageColors";

// The library decodes the image in native code; this spec gives it the answer each platform would.
jest.mock("react-native-image-colors", () => ({
  __esModule: true,
  getColors: jest.fn(),
}));

const getColors = jest.mocked(
  (require("react-native-image-colors") as typeof ImageColorsType).getColors,
);

const POSTER = "https://jellyfin.example/Items/1/Images/Primary";

beforeEach(() => {
  getColors.mockReset();
});

describe("extractImageColor", () => {
  test("the extraction sends the custom headers", async () => {
    getColors.mockResolvedValue({
      platform: "ios",
      background: "#111111",
      primary: "#222222",
      secondary: "#333333",
      detail: "#5AA2C4",
      quality: "low",
    });
    const headers = { "X-Gateway-Token": "bench" };

    await expect(extractImageColor(POSTER, headers)).resolves.toBe("#5AA2C4");
    expect(getColors).toHaveBeenCalledWith(POSTER, {
      fallback: "#fff",
      cache: false,
      headers,
    });
  });

  test("with no custom headers the request grows no headers key", async () => {
    getColors.mockResolvedValue({
      platform: "android",
      dominant: "#D9822B",
      average: "#000000",
      vibrant: "#000000",
      darkVibrant: "#000000",
      lightVibrant: "#000000",
      darkMuted: "#000000",
      lightMuted: "#000000",
      muted: "#000000",
    });

    await expect(extractImageColor(POSTER, {})).resolves.toBe("#D9822B");
    expect(getColors).toHaveBeenCalledWith(POSTER, {
      fallback: "#fff",
      cache: false,
    });
  });
});
