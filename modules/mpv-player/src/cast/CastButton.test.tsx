import { render } from "@testing-library/react-native";
import { type CastDoubleState, createCastDoubleState } from "@/test-utils/cast";
import { CastButton } from "./CastButton";

let mockCast: CastDoubleState = createCastDoubleState();
jest.mock("@/modules/mpv-player/src/cast/CastModule", () => ({
  __esModule: true,
  CastNative: require("@/test-utils/cast").castDoubleModule(() => mockCast),
}));

beforeEach(() => {
  mockCast = createCastDoubleState();
});

// A TV or a phone without Play Services has nothing to cast to; the header
// keeps its layout and the button simply is not there.
test("renders nothing when Cast is unavailable", async () => {
  mockCast.available = false;
  const view = await render(<CastButton tintColor='#fff' />);
  expect(view.toJSON()).toBeNull();
});
