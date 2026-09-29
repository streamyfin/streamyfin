import {
  SEERR_COOKIES_STORAGE_KEY,
  SEERR_USER_STORAGE_KEY,
} from "@/constants/Seerr";

interface SessionStore {
  get<T>(key: string): T | undefined;
  setAny(key: string, value: unknown): void;
}

/**
 * Keeps a signed-in Seerr session: the user, and the cookie list the app
 * builds its Seerr client on (useSeerr). iOS does not show Set-Cookie to
 * JavaScript, so that list can stay empty; what matters is that it exists, as
 * test() leaves it. An automatic sign-in never calls test(), so without this
 * the user was signed in and Seerr was still gone from the app.
 */
export const rememberSeerrSession = (store: SessionStore, user: unknown) => {
  store.setAny(SEERR_USER_STORAGE_KEY, user);
  if (store.get<string[]>(SEERR_COOKIES_STORAGE_KEY) === undefined) {
    store.setAny(SEERR_COOKIES_STORAGE_KEY, []);
  }
};
