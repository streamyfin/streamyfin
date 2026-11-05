let mockBuild: unknown;

jest.mock("expo-application", () => ({
  nativeApplicationVersion: "0.56.0",
  nativeBuildVersion: "42",
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { build: mockBuild } };
    },
  },
}));

import { getVersionInfo } from "./version";

const devFlag = __DEV__;
const setDev = (value: boolean) => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = value;
};

describe("getVersionInfo", () => {
  beforeEach(() => setDev(false));
  afterAll(() => setDev(devFlag));

  it("pins a CI build to its commit and run", () => {
    mockBuild = {
      commit: "abc1234",
      branch: "develop",
      profile: "ci",
      runNumber: "2098",
    };
    expect(getVersionInfo().display).toBe("0.56.0 · abc1234 · #2098");
  });

  it("shows the bare version on a production build", () => {
    mockBuild = { commit: "abc1234", profile: "production", runNumber: "7" };
    expect(getVersionInfo().display).toBe("0.56.0");
  });

  it("shows the branch and commit on a dev build", () => {
    setDev(true);
    mockBuild = { commit: "abc1234", branch: "feat/x" };
    expect(getVersionInfo().display).toBe("0.56.0 · feat/x · abc1234");
  });

  // app.config.ts leaves what a local build lacks empty, and the embedded
  // config is what Expo serialized: it turns a null into an empty object.
  it("leaves out what a local build does not know", () => {
    mockBuild = {
      commit: "abc1234",
      branch: "main",
      profile: {},
      runNumber: {},
    };
    const info = getVersionInfo();
    expect(info.display).toBe("0.56.0 · abc1234");
    expect(info.profile).toBeNull();
    expect(info.runNumber).toBeNull();
  });
});
