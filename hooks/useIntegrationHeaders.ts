import { useAtomValue } from "jotai";
import { useMemo } from "react";
import {
  customHeadersVersionAtom,
  getIntegrationHeaders,
  type IntegrationKey,
} from "@/utils/customHeaders";

/**
 * Effective custom proxy auth headers for an integration, re-read whenever the
 * configuration changes.
 *
 * `resolveOptions` is shaped for `ServerUrlField` / `useServerUrlResolver`:
 * without the headers, a service behind an access gateway answers 403 and its
 * URL never validates.
 */
export function useIntegrationHeaders(integrationKey: IntegrationKey): {
  headers: Record<string, string>;
  resolveOptions: { headers: Record<string, string> };
} {
  const customHeadersVersion = useAtomValue(customHeadersVersionAtom);

  return useMemo(() => {
    const headers = getIntegrationHeaders(integrationKey);
    return { headers, resolveOptions: { headers } };
    // customHeadersVersion: re-resolve after the configuration changes.
  }, [integrationKey, customHeadersVersion]);
}
