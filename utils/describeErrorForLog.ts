import { isAxiosError } from "axios";

// The local log is exportable (Settings → Logs shares it as logs.txt), so a
// caught error is reduced to a curated shape before it is persisted: a raw
// AxiosError serializes its request config INCLUDING the Authorization and
// X-Api-Key headers, and a plain Error stringifies to "{}" (message/stack
// are non-enumerable) — both wrong, in opposite directions.
export const describeErrorForLog = (error: unknown): unknown => {
  if (isAxiosError(error)) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      url: error.config?.url?.split("?")[0],
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 8).join("\n"),
    };
  }
  return error;
};
