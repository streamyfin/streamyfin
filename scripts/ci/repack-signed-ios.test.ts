import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { signingOptions } from "./repack-signed-ios";

describe("signingOptions", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "signing-"));
  writeFileSync(path.join(dir, "password"), "secret");
  writeFileSync(
    path.join(dir, "profiles.json"),
    JSON.stringify({ "com.app": path.join(dir, "com.app.mobileprovision") }),
  );

  // The profile's entitlements list every group it allows, a wildcard
  // keychain group among them; the app was built with a narrower set.
  it("keeps the entitlements the app was built with", () => {
    expect(signingOptions(dir).useAppEntitlements).toBe(true);
  });

  it("signs in process with the files fetch-ios-credentials.ts wrote", () => {
    expect(signingOptions(dir)).toEqual({
      backend: "zsign",
      certificatePath: path.join(dir, "identity.p12"),
      keyPassword: "secret",
      provisioningProfile: {
        "com.app": path.join(dir, "com.app.mobileprovision"),
      },
      useAppEntitlements: true,
    });
  });
});
