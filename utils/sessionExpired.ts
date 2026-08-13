/**
 * A saved account's token was rejected. The account is kept — callers offer
 * re-authentication instead.
 */
export class SessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionExpiredError";
  }
}

/**
 * Alert copy for a failed sign-in with a saved credential. The recovery
 * actions differ per screen, the wording does not.
 */
export function savedLoginAlertText(
  error: unknown,
  t: (key: string) => string,
): { title: string; message: string } {
  if (error instanceof SessionExpiredError) {
    return {
      title: t("server.session_expired"),
      message: t("server.please_login_again"),
    };
  }
  return {
    title: t("login.connection_failed"),
    message:
      error instanceof Error
        ? error.message
        : t("login.an_unexpected_error_occurred"),
  };
}
