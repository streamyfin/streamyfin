import { clearSecureStore, secureStoreValues } from "@/test-utils/secureStore";
import {
  deleteSeerrPassword,
  getSeerrPassword,
  saveSeerrPassword,
} from "./seerrPassword";

jest.mock(
  "expo-secure-store",
  () => jest.requireActual("@/test-utils/secureStore").secureStoreModule,
);

const account = btoa("https://media.example:user-1").replace(
  /[^a-zA-Z0-9]/g,
  "_",
);

beforeEach(clearSecureStore);

// Auto-login signs in to Seerr with the Jellyfin password. Kept under the old
// name by an earlier build, it has to be found on the first launch after the
// update, or nobody gets signed in.
test("finds the password an earlier build kept, and moves it", async () => {
  secureStoreValues.set(`jellyseerrpw_${account}`, "correct horse");

  expect(await getSeerrPassword("https://media.example", "user-1")).toBe(
    "correct horse",
  );
  expect(secureStoreValues.get(`seerrpw_${account}`)).toBe("correct horse");
  expect(secureStoreValues.has(`jellyseerrpw_${account}`)).toBe(false);
});

test("reads the new name first", async () => {
  secureStoreValues.set(`seerrpw_${account}`, "battery staple");
  secureStoreValues.set(`jellyseerrpw_${account}`, "correct horse");

  expect(await getSeerrPassword("https://media.example", "user-1")).toBe(
    "battery staple",
  );
});

// Signing in again after the update writes the new name before anything has
// read the old one. The copy left under the old name, possibly an older
// password, would otherwise stay on the device until the user signs out.
test("saving forgets the copy an earlier build kept", async () => {
  secureStoreValues.set(`jellyseerrpw_${account}`, "correct horse");

  await saveSeerrPassword("https://media.example", "user-1", "battery staple");

  expect(secureStoreValues.get(`seerrpw_${account}`)).toBe("battery staple");
  expect(secureStoreValues.has(`jellyseerrpw_${account}`)).toBe(false);
});

// Signing out has to forget the password under either name.
test("deletes it under both names", async () => {
  secureStoreValues.set(`seerrpw_${account}`, "a");
  secureStoreValues.set(`jellyseerrpw_${account}`, "b");

  await deleteSeerrPassword("https://media.example", "user-1");

  expect(secureStoreValues.size).toBe(0);
});
