import { act, renderHook } from "@testing-library/react-native";
import { MUSIC_FOLDER_INCLUDE_SUBFOLDERS_KEY } from "@/constants/Music";
import { clearMmkv } from "@/test-utils/mmkv";
import { storage } from "@/utils/mmkv";
import { useIncludeSubfolders } from "./useIncludeSubfolders";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

beforeEach(() => clearMmkv());

describe("the Include subfolders switch", () => {
  // A folder that only holds folders would have nothing to play.
  it("is on until the user turns it off", async () => {
    const { result } = await renderHook(() => useIncludeSubfolders());
    expect(result.current.value).toBe(true);
  });

  it("is remembered for the next folder", async () => {
    const first = await renderHook(() => useIncludeSubfolders());
    await act(() => first.result.current.onChange(false));
    expect(first.result.current.value).toBe(false);
    expect(storage.getBoolean(MUSIC_FOLDER_INCLUDE_SUBFOLDERS_KEY)).toBe(false);

    const next = await renderHook(() => useIncludeSubfolders());
    expect(next.result.current.value).toBe(false);
  });
});
