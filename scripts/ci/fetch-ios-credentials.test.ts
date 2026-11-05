import {
  assertCertificateValid,
  assertOneCertificate,
  assertProfileValid,
  parseBuildCredentials,
  type TargetCredentials,
} from "./fetch-ios-credentials";

const answer = (
  build: {
    certificate?: {
      id: string;
      certificateP12: string | null;
      certificatePassword: string | null;
      validityNotAfter?: string | null;
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
                    distributionCertificate: build.certificate
                      ? { validityNotAfter: null, ...build.certificate }
                      : null,
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
  certificateValidUntil: null,
  provisioningProfile: "cHJvZmlsZQ==",
});

describe("parseBuildCredentials", () => {
  it("reads the certificate, its password, its end date and the profile", () => {
    const parsed = parseBuildCredentials(
      "com.example.app",
      answer({
        certificate: {
          id: "cert-1",
          certificateP12: "cDEy",
          certificatePassword: "secret",
          validityNotAfter: "2027-06-01T00:00:00.000Z",
        },
        profile: "cHJvZmlsZQ==",
      }),
    );
    expect(parsed).toEqual({
      ...target("com.example.app", "cert-1"),
      certificateValidUntil: "2027-06-01T00:00:00.000Z",
    });
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

// A provisioning profile is a signed message whose plist is plain text.
const profileWith = (expiration: string) =>
  Buffer.from(
    `0\u0082signed<?xml version="1.0"?><plist version="1.0"><dict><key>ExpirationDate</key><date>${expiration}</date></dict></plist>signature`,
    "latin1",
  ).toString("base64");

describe("assertProfileValid", () => {
  const now = new Date("2026-11-05T12:00:00Z");

  it("accepts a profile that expires later", () => {
    expect(() =>
      assertProfileValid("com.app", profileWith("2027-04-12T16:49:13Z"), now),
    ).not.toThrow();
  });

  // zsign checks only the key and the team: an expired profile would sign an
  // IPA that installs nowhere, and the job would pass.
  it("refuses an expired profile", () => {
    expect(() =>
      assertProfileValid("com.app", profileWith("2026-11-01T00:00:00Z"), now),
    ).toThrow(/expired/);
  });

  it("refuses a profile it cannot read a date from", () => {
    expect(() =>
      assertProfileValid(
        "com.app",
        Buffer.from("not a profile").toString("base64"),
        now,
      ),
    ).toThrow(/expiration date/);
  });
});

describe("assertCertificateValid", () => {
  const now = new Date("2026-11-05T12:00:00Z");

  it("accepts a certificate that expires later", () => {
    expect(() =>
      assertCertificateValid("com.app", "2027-06-01T00:00:00.000Z", now),
    ).not.toThrow();
  });

  // zsign checks that the key matches the certificate, not its dates: an
  // expired certificate would sign an IPA App Store Connect refuses, and the
  // job would pass.
  it("refuses an expired certificate", () => {
    expect(() =>
      assertCertificateValid("com.app", "2026-10-01T00:00:00.000Z", now),
    ).toThrow(/expired/);
  });

  it("refuses a certificate without a validity date", () => {
    expect(() => assertCertificateValid("com.app", null, now)).toThrow(
      /validity/,
    );
  });
});
