import "@/augmentations/mmkv";
import { renderHook } from "@testing-library/react-native";
import { HIDDEN_LIBRARY_ORIGINS_STORAGE_KEY } from "@/constants/Values";
import { clearMmkv } from "@/test-utils/mmkv";
import { originKey } from "@/utils/library/hiddenLibraries";
import { storage } from "@/utils/mmkv";
import { useRemapHiddenLibraries } from "./useRemapHiddenLibraries";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

let mockHidden: string[] = [];
let mockLoaded = true;
let mockLocked = false;
const mockUpdateSettings = jest.fn();
jest.mock("@/utils/atoms/settings", () => ({
  settingsAtom: "settingsAtom",
  useSettings: () => ({
    settings: { hiddenLibraries: mockHidden },
    updateSettings: mockUpdateSettings,
    pluginSettings: { hiddenLibraries: { locked: mockLocked } },
  }),
}));
jest.mock("jotai", () => ({
  useAtomValue: () => (mockLoaded ? {} : null),
}));

const SERVER = "server-a";
const USER = "user-1";

beforeEach(() => {
  clearMmkv();
  mockHidden = [];
  mockLoaded = true;
  mockLocked = false;
  mockUpdateSettings.mockClear();
});

describe("useRemapHiddenLibraries", () => {
  test("hides a Live TV view again after Jellyfin 12 changed its id", async () => {
    mockHidden = ["old-livetv"];
    storage.setAny(HIDDEN_LIBRARY_ORIGINS_STORAGE_KEY, {
      [originKey(SERVER, USER, "old-livetv")]: "livetv",
    });

    await renderHook(() =>
      useRemapHiddenLibraries(
        [{ Id: "new-livetv", CollectionType: "livetv", ServerId: SERVER }],
        USER,
      ),
    );

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      hiddenLibraries: ["old-livetv", "new-livetv"],
    });
    expect(storage.get(HIDDEN_LIBRARY_ORIGINS_STORAGE_KEY)).toEqual({
      [originKey(SERVER, USER, "new-livetv")]: "livetv",
    });
  });

  test("writes nothing while the views have not loaded", async () => {
    mockHidden = ["livetv"];

    await renderHook(() => useRemapHiddenLibraries([], USER));

    expect(mockUpdateSettings).not.toHaveBeenCalled();
    expect(storage.getAllKeys()).toEqual([]);
  });

  test.each([
    [
      "settings have not loaded",
      () => {
        mockLoaded = false;
      },
    ],
    [
      "the admin locked the list",
      () => {
        mockLocked = true;
      },
    ],
  ])("carries nothing over while %s", async (_, arrange) => {
    // The hidden list could not be written, and consuming the origin anyway
    // would lose the carry-over for good.
    arrange();
    mockHidden = ["old-livetv"];
    const origins = { [originKey(SERVER, USER, "old-livetv")]: "livetv" };
    storage.setAny(HIDDEN_LIBRARY_ORIGINS_STORAGE_KEY, origins);

    await renderHook(() =>
      useRemapHiddenLibraries(
        [{ Id: "new-livetv", CollectionType: "livetv", ServerId: SERVER }],
        USER,
      ),
    );

    expect(mockUpdateSettings).not.toHaveBeenCalled();
    expect(storage.get(HIDDEN_LIBRARY_ORIGINS_STORAGE_KEY)).toEqual(origins);
  });

  test("only records the type when nothing needs carrying over", async () => {
    mockHidden = ["livetv"];

    await renderHook(() =>
      useRemapHiddenLibraries(
        [{ Id: "livetv", CollectionType: "livetv", ServerId: SERVER }],
        USER,
      ),
    );

    expect(mockUpdateSettings).not.toHaveBeenCalled();
    expect(storage.get(HIDDEN_LIBRARY_ORIGINS_STORAGE_KEY)).toEqual({
      [originKey(SERVER, USER, "livetv")]: "livetv",
    });
  });
});
