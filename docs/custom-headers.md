# Custom Headers

Streamyfin can attach custom HTTP headers to Jellyfin and Seerr requests. This is intended for deployments that sit behind proxy authentication such as Cloudflare Zero Trust, Pangolin tunnels, or similar access gateways.

## Jellyfin

Configure Jellyfin headers from the Network settings page or from the advanced section while adding a server.

When no custom headers are configured, Streamyfin sends requests normally. Disabled headers, blank header names, and blank header values are ignored and are not sent.

Header values are stored in the device secure store. Header metadata, such as the header name and enabled state, is stored with the saved server entry.

Jellyfin headers are only attached to URLs that match the configured Jellyfin server base URL. Streamyfin should not send Jellyfin custom headers to external artwork providers, remote media URLs, OpenSubtitles downloads, or other unrelated hosts.

## Seerr

Self-hosted integrations such as Seerr, Streamystats, and Marlin Search can use a separate header configuration from Jellyfin. In each integration's settings, choose one of these modes:

- Jellyfin: inherit the custom headers configured for the Jellyfin server.
- Custom: send a separate set of custom headers to that integration.
- None: do not send custom headers to that integration.

Use a separate integration configuration when the service is exposed through a different proxy, tunnel, hostname, or access policy than Jellyfin.

For safety, integrations do not inherit Jellyfin headers until that mode is selected. This prevents Jellyfin proxy credentials from being sent to a separate integration host by default.

## Behavior

Custom headers are only useful for headers required by your own proxy or access gateway. Do not duplicate Jellyfin's normal authorization header unless the proxy explicitly requires it.

If a header is removed, disabled, or left blank, Streamyfin should behave the same as it did before custom headers were configured.

Custom header names must be valid HTTP header tokens. Blank names, blank values, disabled entries, invalid names, control characters in values, and duplicate header names are ignored.

## Troubleshooting

Before testing in Streamyfin, verify that the proxy accepts the same headers with `curl`. The examples below use fake Cloudflare Access service-token values and a fake Jellyfin host:

```text
Jellyfin URL: https://jellyfin.cloudflare.net
Client ID: 00000000000000000000000000000000.access
Client Secret: fake-cloudflare-access-client-secret
```

First, confirm the proxy blocks or challenges the request without custom headers:

```bash
curl -i https://jellyfin.cloudflare.net/System/Info/Public
```

Then send the Cloudflare Access headers:

```bash
curl -i \
  -H "CF-Access-Client-Id: 00000000000000000000000000000000.access" \
  -H "CF-Access-Client-Secret: fake-cloudflare-access-client-secret" \
  https://jellyfin.cloudflare.net/System/Info/Public
```

If the headers are valid, Cloudflare should allow the request through and Jellyfin should return its public server information. If the response is still a Cloudflare challenge, `401`, or `403`, check the Access service-token values and policy before changing Streamyfin settings.

To test a full Jellyfin login through the proxy, add Jellyfin's normal API authorization header and credentials:

```bash
curl -i \
  -X POST https://jellyfin.cloudflare.net/Users/AuthenticateByName \
  -H "Content-Type: application/json" \
  -H "Authorization: MediaBrowser Client=StreamyfinManualTest, Device=curl, DeviceId=manual-curl, Version=1.0.0" \
  -H "CF-Access-Client-Id: 00000000000000000000000000000000.access" \
  -H "CF-Access-Client-Secret: fake-cloudflare-access-client-secret" \
  --data '{"Username":"demo-user","Pw":"demo-password"}'
```

Use the same header names and values in Streamyfin's custom header settings. For Cloudflare Access, that usually means:

- `CF-Access-Client-Id`
- `CF-Access-Client-Secret`

If `curl` works but Streamyfin does not, confirm that the saved Jellyfin server URL exactly matches the host behind the proxy and that each custom header is enabled, has a non-blank name, and has a non-blank value.
