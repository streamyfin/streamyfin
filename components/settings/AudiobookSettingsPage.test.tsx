import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import i18n from "i18next";
import { getDefaultStore } from "jotai";
import type React from "react";
import { initReactI18next } from "react-i18next";
import { Alert, type AlertButton } from "react-native";
import AudiobookSettingsPage from "@/app/(auth)/(tabs)/(more)/settings/audiobooks/page";
import { clearMmkv } from "@/test-utils/mmkv";
import en from "@/translations/en.json";
import { userAtom } from "@/utils/atoms/api";
import { bookFromParts } from "@/utils/audiobooks/books";
import {
  getDownloadedBooks,
  registerDownloadedBook,
} from "@/utils/audiobooks/storage";

jest.mock("react-i18next", () =>
  jest.requireActual("@/test-utils/realI18next"),
);

const mockUpdateSettings = jest.fn();
const mockSettings = {
  audiobookSkipBackSeconds: 15,
  audiobookSkipForwardSeconds: 30,
  audiobookPlaybackRate: 1.25,
  audiobookAutoRewind: true,
  audiobookCacheNextPart: true,
};
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: mockSettings,
    updateSettings: mockUpdateSettings,
    pluginSettings: {},
  }),
}));
// The files go through the background downloader's native module; what the
// page owns is which books it asks to delete.
const mockDeleteBookDownload = jest.fn(async (book: { id: string }) => {
  jest
    .requireActual("@/utils/audiobooks/storage")
    .unregisterDownloadedBook(book.id);
});
jest.mock("@/utils/audiobooks/downloads", () => ({
  deleteBookDownload: (book: { id: string }) => mockDeleteBookDownload(book),
}));
// The dropdown shows its trigger and every option's label, each pressable.
jest.mock("@/components/PlatformDropdown", () => ({
  PlatformDropdown: ({
    trigger,
    groups,
  }: {
    trigger: React.ReactNode;
    groups: { options: { label: string; onPress: () => void }[] }[];
  }) => {
    const { Text } = jest.requireActual("react-native");
    return (
      <>
        {trigger}
        {groups
          .flatMap((group) => group.options)
          .map((option) => (
            <Text key={option.label} onPress={option.onPress}>
              {option.label}
            </Text>
          ))}
      </>
    );
  },
}));

beforeAll(() =>
  i18n.use(initReactI18next).init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  }),
);

beforeEach(() => {
  clearMmkv();
  jest.clearAllMocks();
  getDefaultStore().set(userAtom, { Id: "user", ServerId: "server" });
});

const book = (id: string, serverId = "server") =>
  bookFromParts([
    {
      Id: id,
      Name: id,
      Type: "AudioBook",
      ServerId: serverId,
      ParentId: "folder",
    } satisfies BaseItemDto,
  ]);

describe("AudiobookSettingsPage", () => {
  it("shows the skip intervals and speed chosen", async () => {
    await render(<AudiobookSettingsPage />);

    // Skip back's trigger and option, and skip forward's option.
    expect(screen.getAllByText("15 seconds")).toHaveLength(3);
    expect(screen.getAllByText("30 seconds")).toHaveLength(3);
    expect(screen.getAllByText("1.25×")).toHaveLength(2);
  });

  it("saves the interval picked", async () => {
    await render(<AudiobookSettingsPage />);

    // Back's list comes before forward's.
    await fireEvent.press(screen.getAllByText("45 seconds")[0]);

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      audiobookSkipBackSeconds: 45,
    });
  });

  it("deletes this server's downloaded books once confirmed", async () => {
    registerDownloadedBook(book("mine"));
    registerDownloadedBook(book("theirs", "other-server"));
    const alert = jest.spyOn(Alert, "alert");
    await render(<AudiobookSettingsPage />);

    expect(screen.getByText("1 book")).toBeTruthy();
    await fireEvent.press(screen.getByText("Delete downloaded audiobooks"));
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    await act(async () => {
      await buttons
        .find((button) => button.style === "destructive")
        ?.onPress?.();
    });

    expect(mockDeleteBookDownload).toHaveBeenCalledTimes(1);
    expect(mockDeleteBookDownload.mock.calls[0][0].id).toBe("mine");
    expect(getDownloadedBooks(null).map((entry) => entry.book.id)).toEqual([
      "theirs",
    ]);
    expect(screen.getByText("0 books")).toBeTruthy();
  });
});
