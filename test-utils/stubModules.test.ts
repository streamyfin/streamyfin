import { deviceModule } from "./stubModules";

// `unitSetup.ts` puts this double in place of the real module for every spec,
// so a helper it lacks throws in any caller that reaches it, and the session
// restore in `utils/atoms/api.ts` swallows that error into a null api.
test("the device double exports every helper the real module does", () => {
  const real = jest.requireActual("@/utils/device");
  expect(Object.keys(deviceModule).sort()).toEqual(Object.keys(real).sort());
});

test("a stored session restores with the device double", () => {
  jest.isolateModules(() => {
    const { storage } = jest.requireActual("@/utils/mmkv");
    storage.set("serverUrl", "http://server");
    storage.set("token", "token");
    const { apiAtom } = jest.requireActual("@/utils/atoms/api");
    const { getDefaultStore } = jest.requireActual("jotai");
    expect(getDefaultStore().get(apiAtom)?.basePath).toBe("http://server");
  });
});
