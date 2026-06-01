function withHttpProtocol(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

export function normalizeHttpBaseUrl(url: string): string {
  return withHttpProtocol(url).replace(/\/$/, "");
}

export function isUrlForBaseUrl(url: string, baseUrl: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const parsedBase = new URL(normalizeHttpBaseUrl(baseUrl));
    const basePath = parsedBase.pathname.replace(/\/$/, "");

    return (
      parsedUrl.protocol === parsedBase.protocol &&
      parsedUrl.host === parsedBase.host &&
      (basePath === "" ||
        parsedUrl.pathname === basePath ||
        parsedUrl.pathname.startsWith(`${basePath}/`))
    );
  } catch {
    return false;
  }
}
