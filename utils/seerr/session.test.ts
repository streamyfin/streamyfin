import {
  SEERR_COOKIES_STORAGE_KEY,
  SEERR_USER_STORAGE_KEY,
} from "@/constants/Seerr";
import { rememberSeerrSession } from "./session";

const store = (initial: Record<string, unknown> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: <T>(key: string) => values.get(key) as T | undefined,
    setAny: (key: string, value: unknown) => void values.set(key, value),
  };
};

// The app builds its Seerr client only once a cookie list is stored. iOS does
// not show Set-Cookie to JavaScript, and an automatic sign-in never called
// test(), which is what stored the list: after a reset, Seerr was signed in
// and still gone from the app.
describe("rememberSeerrSession", () => {
  test("keeps the user", () => {
    const s = store();
    rememberSeerrSession(s, { id: 7 });
    expect(s.values.get(SEERR_USER_STORAGE_KEY)).toEqual({ id: 7 });
  });

  test("leaves a cookie list, empty when none could be read", () => {
    const s = store();
    rememberSeerrSession(s, { id: 7 });
    expect(s.values.get(SEERR_COOKIES_STORAGE_KEY)).toEqual([]);
  });

  test("keeps the cookies already stored", () => {
    const s = store({ [SEERR_COOKIES_STORAGE_KEY]: ["XSRF-TOKEN=abc"] });
    rememberSeerrSession(s, { id: 7 });
    expect(s.values.get(SEERR_COOKIES_STORAGE_KEY)).toEqual(["XSRF-TOKEN=abc"]);
  });
});
