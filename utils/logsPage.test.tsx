import { fireEvent, render, screen } from "@testing-library/react-native";
import LogsPage from "@/app/(auth)/(tabs)/(home)/settings/logs/page";

const mockLogs = [
  {
    timestamp: 1_700_000_000_000,
    level: "ERROR",
    message: "Playback failed",
    data: { code: "E_DECODER" },
  },
];
jest.mock("@/utils/log", () => ({
  useLog: () => ({ logs: mockLogs }),
  writeErrorLog: jest.fn(),
}));
jest.mock("expo-router", () => ({
  useNavigation: () => ({ setOptions: () => {} }),
}));
jest.mock("expo-file-system", () => ({ File: class {}, Paths: {} }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("sonner-native", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/components/filters/FilterButton", () => ({
  FilterButton: () => null,
}));
jest.mock("@/components/common/HeaderButton", () => ({
  HeaderButton: () => null,
}));

describe("logs page", () => {
  test("shows a log's payload only while its row is open", async () => {
    await render(<LogsPage />);
    const payload = /E_DECODER/;
    expect(screen.queryByText(payload)).toBeNull();

    await fireEvent.press(screen.getByText("Playback failed"));
    expect(screen.getByText(payload)).toBeTruthy();

    await fireEvent.press(screen.getByText("Playback failed"));
    expect(screen.queryByText(payload)).toBeNull();
  });
});
