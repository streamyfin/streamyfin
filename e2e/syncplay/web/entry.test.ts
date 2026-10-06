const mockRegister = jest.fn();
const mockClientImported = jest.fn();
const mockClient = () => null;

jest.mock("expo", () => ({ registerRootComponent: mockRegister }));
jest.mock("./WebPreview", () => {
  mockClientImported();
  return { WebPreview: mockClient };
});

const development = globalThis as unknown as { __DEV__: boolean };
const originalDevelopment = development.__DEV__;
const originalFlag = process.env.EXPO_PUBLIC_SYNCPLAY_TEST_CLIENT;

describe("explicit browser test-client entry", () => {
  beforeEach(() => {
    jest.resetModules();
    mockRegister.mockClear();
    mockClientImported.mockClear();
    development.__DEV__ = true;
    delete process.env.EXPO_PUBLIC_SYNCPLAY_TEST_CLIENT;
  });
  afterAll(() => {
    development.__DEV__ = originalDevelopment;
    if (originalFlag === undefined)
      delete process.env.EXPO_PUBLIC_SYNCPLAY_TEST_CLIENT;
    else process.env.EXPO_PUBLIC_SYNCPLAY_TEST_CLIENT = originalFlag;
  });

  test("normal web starts do not load the custom client", () => {
    require("../../../index.web");
    expect(mockClientImported).not.toHaveBeenCalled();
    expect(mockRegister.mock.calls[0][0].name).toBe(
      "SyncPlayTestClientDisabled",
    );
  });

  test("the explicit development flag enables the decoder test client", () => {
    process.env.EXPO_PUBLIC_SYNCPLAY_TEST_CLIENT = "1";
    require("../../../index.web");
    expect(mockClientImported).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledWith(mockClient);
  });

  test("other flag values do not enable the test client", () => {
    process.env.EXPO_PUBLIC_SYNCPLAY_TEST_CLIENT = "true";
    require("../../../index.web");
    expect(mockClientImported).not.toHaveBeenCalled();
    expect(mockRegister.mock.calls[0][0].name).toBe(
      "SyncPlayTestClientDisabled",
    );
  });

  test("release mode keeps the test client disabled even with the flag", () => {
    development.__DEV__ = false;
    process.env.EXPO_PUBLIC_SYNCPLAY_TEST_CLIENT = "1";
    require("../../../index.web");
    expect(mockClientImported).not.toHaveBeenCalled();
    expect(mockRegister.mock.calls[0][0].name).toBe(
      "SyncPlayTestClientDisabled",
    );
  });
});
