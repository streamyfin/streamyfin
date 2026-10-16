import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import type React from "react";
import type { QuickConnectStatus } from "@/hooks/useQuickConnect";
import { pendingAccountSaveAtom, userAtom } from "@/providers/JellyfinProvider";
import { Login } from "./Login";

const mockStopPolling = jest.fn();
const mockJellyfin = {
  setServer: jest.fn(),
  login: jest.fn(),
  removeServer: jest.fn(),
  initiateQuickConnect: jest.fn(async () => "123456"),
  stopQuickConnectPolling: () => mockStopPolling(),
  quickConnectStatus: "waiting" as QuickConnectStatus,
  loginWithSavedCredential: jest.fn(),
  loginWithPassword: jest.fn(),
};
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "https://media.example.com" }),
    userAtom: atom(null),
    pendingAccountSaveAtom: atom(null),
    useJellyfin: () => mockJellyfin,
  };
});
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ setOptions: () => {} }),
}));
jest.mock("i18next", () => ({ t: (key: string) => key }));
jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: (props: { name: string }) => MockIcon(props),
}));
const MockIcon = ({ name }: { name: string }) => {
  const { Text } = jest.requireActual("react-native");
  return <Text>{name}</Text>;
};
jest.mock("@/components/login/QuickConnectCodeModal", () => ({
  QuickConnectCodeModal: (props: {
    code: string | null;
    onClose: () => void;
  }) => MockCodeModal(props),
}));
const MockCodeModal = ({
  code,
  onClose,
}: {
  code: string | null;
  onClose: () => void;
}) => {
  const { Pressable, Text } = jest.requireActual("react-native");
  return code ? (
    <Pressable onPress={onClose}>
      <Text>close code</Text>
    </Pressable>
  ) : null;
};
jest.mock("@/components/Button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => {
    const { Text } = jest.requireActual("react-native");
    return <Text>{children}</Text>;
  },
}));
jest.mock("@/components/common/Input", () => ({ Input: () => null }));
jest.mock("@/components/JellyfinServerDiscovery", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@/components/PreviousServersList", () => ({
  PreviousServersList: () => null,
}));
jest.mock("@/components/settings/CustomHeaderSheet", () => ({
  CustomHeaderSheet: () => null,
}));
jest.mock("@/providers/GlobalModalProvider", () => ({
  useGlobalModal: () => ({ showModal: () => {}, hideModal: () => {} }),
}));
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);
jest.mock("@/utils/jellyfin/checkServer", () => ({
  checkJellyfinServer: jest.fn(),
  ServerTooOldError: class extends Error {},
}));

describe("Login Quick Connect", () => {
  beforeEach(() => {
    mockStopPolling.mockClear();
    mockJellyfin.quickConnectStatus = "waiting";
    getDefaultStore().set(userAtom as never, null as never);
    getDefaultStore().set(pendingAccountSaveAtom as never, null as never);
  });

  test("keeps polling after the code sheet is closed", async () => {
    await render(<Login />);
    await fireEvent.press(screen.getByText("save_account.save_for_later"));
    await act(async () => {
      await fireEvent.press(screen.getByText("cellphone-lock"));
    });
    mockStopPolling.mockClear();

    await fireEvent.press(screen.getByText("close code"));

    expect(mockStopPolling).not.toHaveBeenCalled();
    expect(screen.queryByText("close code")).toBeNull();
    await act(async () => {
      getDefaultStore().set(userAtom as never, { Id: "user-1" } as never);
    });
    expect(getDefaultStore().get(pendingAccountSaveAtom)).toEqual({
      serverName: "",
    });
  });

  test.each(["expired", "disabled"] as const)(
    "forgets the Quick Connect save intent when the request is %s",
    async (status) => {
      const view = await render(<Login />);
      await fireEvent.press(screen.getByText("save_account.save_for_later"));
      await act(async () => {
        await fireEvent.press(screen.getByText("cellphone-lock"));
      });
      mockJellyfin.quickConnectStatus = status;
      await view.rerender(<Login />);

      // A later password login must follow its own save-account flow.
      await act(async () => {
        getDefaultStore().set(userAtom as never, { Id: "user-1" } as never);
      });
      expect(getDefaultStore().get(pendingAccountSaveAtom)).toBeNull();
    },
  );
});
