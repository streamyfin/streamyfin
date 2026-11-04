import {
  assertOneCertificate,
  parseBuildCredentials,
  type TargetCredentials,
} from "./fetch-ios-credentials";

const answer = (
  build: {
    certificate?: {
      id: string;
      certificateP12: string | null;
      certificatePassword: string | null;
    } | null;
    profile?: string | null;
  } | null,
) => ({
  app: {
    byFullName: {
      iosAppCredentials:
        build === null
          ? []
          : [
              {
                iosAppBuildCredentialsList: [
                  {
                    distributionCertificate: build.certificate ?? null,
                    provisioningProfile:
                      build.profile === undefined
                        ? null
                        : { provisioningProfile: build.profile },
                  },
                ],
              },
            ],
    },
  },
});

const target = (
  bundleIdentifier: string,
  certificateId: string,
): TargetCredentials => ({
  bundleIdentifier,
  certificateId,
  certificateP12: "cDEy",
  certificatePassword: "secret",
  provisioningProfile: "cHJvZmlsZQ==",
});

describe("parseBuildCredentials", () => {
  it("reads the certificate, its password and the profile", () => {
    const parsed = parseBuildCredentials(
      "com.example.app",
      answer({
        certificate: {
          id: "cert-1",
          certificateP12: "cDEy",
          certificatePassword: "secret",
        },
        profile: "cHJvZmlsZQ==",
      }),
    );
    expect(parsed).toEqual(target("com.example.app", "cert-1"));
  });

  it("treats a missing password as an empty one", () => {
    // EAS stores a certificate exported without a password as null.
    const parsed = parseBuildCredentials(
      "com.example.app",
      answer({
        certificate: {
          id: "cert-1",
          certificateP12: "cDEy",
          certificatePassword: null,
        },
        profile: "cHJvZmlsZQ==",
      }),
    );
    expect(parsed.certificatePassword).toBe("");
  });

  it("fails when the bundle has no credentials", () => {
    expect(() =>
      parseBuildCredentials("com.example.app", answer(null)),
    ).toThrow(/no complete APP_STORE credentials for com.example.app/);
  });

  it("fails when the profile is missing", () => {
    expect(() =>
      parseBuildCredentials(
        "com.example.app",
        answer({
          certificate: {
            id: "cert-1",
            certificateP12: "cDEy",
            certificatePassword: "secret",
          },
          profile: null,
        }),
      ),
    ).toThrow(/no complete/);
  });

  it("fails when the certificate has no p12", () => {
    expect(() =>
      parseBuildCredentials(
        "com.example.app",
        answer({
          certificate: {
            id: "cert-1",
            certificateP12: null,
            certificatePassword: "secret",
          },
          profile: "cHJvZmlsZQ==",
        }),
      ),
    ).toThrow(/no complete/);
  });
});

describe("assertOneCertificate", () => {
  it("accepts an app and extension signed by one certificate", () => {
    expect(() =>
      assertOneCertificate([
        target("com.example.app", "cert-1"),
        target("com.example.app.widget", "cert-1"),
      ]),
    ).not.toThrow();
  });

  it("refuses targets signed by different certificates", () => {
    // zsign signs the whole bundle with one identity, so the extension would
    // end up signed by a certificate its profile does not name.
    expect(() =>
      assertOneCertificate([
        target("com.example.app", "cert-1"),
        target("com.example.app.widget", "cert-2"),
      ]),
    ).toThrow(/2 distribution certificates/);
  });
});
