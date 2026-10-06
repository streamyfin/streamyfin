/** What a custom link can be handed to. Both reject when they cannot open it. */
export interface CustomLinkOpeners {
  /** The in-app browser, which on iOS only takes http and https. */
  browser: (url: string) => Promise<unknown>;
  /** The system, which finds the app registered for the link's scheme. */
  system: (url: string) => Promise<unknown>;
}

// RFC 3986: a letter, then letters, digits, "+", "-" or ".", up to the colon.
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

const WEB_SCHEMES = ["http", "https"];

/**
 * Opens a link from the server's menu links, and reports whether anything took it.
 *
 * The address is whatever the admin typed. A web address goes to the in-app browser,
 * any other scheme to the system, since an app's own scheme is a fair thing to put in
 * a custom link. An address with no scheme opens nothing: prefixing one would be a
 * guess at which the admin meant.
 */
export const openCustomLink = async (
  url: unknown,
  openers: CustomLinkOpeners,
): Promise<boolean> => {
  // Read rather than trusted: the links come out of JSON the admin edits by
  // hand, and an entry can lack its address or hold something that is not text.
  if (typeof url !== "string") return false;

  const address = url.trim();
  const scheme = SCHEME.exec(address)?.[1].toLowerCase();
  if (!scheme) return false;

  if (WEB_SCHEMES.includes(scheme)) {
    try {
      await openers.browser(address);
      return true;
    } catch {
      // The in-app browser is one way to open a web address, not the only one:
      // Android refuses when no browser offers custom tabs.
    }
  }

  try {
    await openers.system(address);
    return true;
  } catch {
    return false;
  }
};
