import { beforeEach, expect, test } from "bun:test";
import {
  clearSecureStore,
  secureStoreValues,
  stubSecureStore,
} from "@/test-utils/secureStore";

stubSecureStore();

const { deleteSeerrPassword, getSeerrPassword } = await import(
  "./seerrPassword"
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

// Signing out has to forget the password under either name.
test("deletes it under both names", async () => {
  secureStoreValues.set(`seerrpw_${account}`, "a");
  secureStoreValues.set(`jellyseerrpw_${account}`, "b");

  await deleteSeerrPassword("https://media.example", "user-1");

  expect(secureStoreValues.size).toBe(0);
});
