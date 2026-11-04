/**
 * Downloads the App Store signing files for a repacked IPA from EAS, the way
 * `eas build --local` does, so no copy of them lives in GitHub secrets.
 *
 * EAS renews the provisioning profiles it stores. A copy kept anywhere else
 * goes stale when a profile expires, so the files must be fetched per run.
 *
 * This uses the GraphQL queries of eas-cli itself
 * (`credentials/ios/api/graphql/queries/` in the `eas-cli` package). They are
 * not a documented API: when EAS changes them, this script fails, and the
 * signed job fails with it instead of shipping an unsigned IPA.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const GRAPHQL_URL = "https://api.expo.dev/graphql";
const DISTRIBUTION = "APP_STORE";

const APP_IDENTIFIER_QUERY = `
  query AppleAppIdentifier($accountName: String!, $bundleIdentifier: String!) {
    account {
      byName(accountName: $accountName) {
        appleAppIdentifiers(bundleIdentifier: $bundleIdentifier) { id }
      }
    }
  }
`;

const BUILD_CREDENTIALS_QUERY = `
  query IosBuildCredentials(
    $projectFullName: String!
    $appleAppIdentifierId: String!
    $iosDistributionType: IosDistributionType!
  ) {
    app {
      byFullName(fullName: $projectFullName) {
        iosAppCredentials(filter: { appleAppIdentifierId: $appleAppIdentifierId }) {
          iosAppBuildCredentialsList(filter: { iosDistributionType: $iosDistributionType }) {
            distributionCertificate { id certificateP12 certificatePassword }
            provisioningProfile { provisioningProfile }
          }
        }
      }
    }
  }
`;

interface BuildCredentialsResponse {
  app: {
    byFullName: {
      iosAppCredentials: {
        iosAppBuildCredentialsList: {
          distributionCertificate: {
            id: string;
            certificateP12: string | null;
            certificatePassword: string | null;
          } | null;
          provisioningProfile: { provisioningProfile: string | null } | null;
        }[];
      }[];
    };
  };
}

export interface TargetCredentials {
  bundleIdentifier: string;
  certificateId: string;
  certificateP12: string;
  certificatePassword: string;
  provisioningProfile: string;
}

/** Reads one target's App Store credentials out of the GraphQL answer. */
export const parseBuildCredentials = (
  bundleIdentifier: string,
  data: BuildCredentialsResponse,
): TargetCredentials => {
  const build =
    data.app.byFullName.iosAppCredentials[0]?.iosAppBuildCredentialsList[0];
  const certificate = build?.distributionCertificate;
  const profile = build?.provisioningProfile?.provisioningProfile;
  if (!certificate?.certificateP12 || !profile) {
    throw new Error(
      `EAS has no complete ${DISTRIBUTION} credentials for ${bundleIdentifier}. Run \`eas credentials -p ios\` to set them up.`,
    );
  }
  return {
    bundleIdentifier,
    certificateId: certificate.id,
    certificateP12: certificate.certificateP12,
    certificatePassword: certificate.certificatePassword ?? "",
    provisioningProfile: profile,
  };
};

/**
 * Checks that every target is signed by one certificate, because zsign signs
 * the app and its extensions with a single identity.
 */
export const assertOneCertificate = (targets: TargetCredentials[]) => {
  const ids = new Set(targets.map((t) => t.certificateId));
  if (ids.size !== 1) {
    throw new Error(
      `The targets use ${ids.size} distribution certificates; repack signs them all with one.`,
    );
  }
};

const query = async <T>(
  token: string,
  document: string,
  variables: Record<string, string>,
): Promise<T> => {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query: document, variables }),
  });
  const body = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (!response.ok || body.errors?.length || !body.data) {
    const messages = body.errors?.map((e) => e.message).join("; ");
    throw new Error(
      `EAS answered ${response.status}: ${messages ?? "no data"}`,
    );
  }
  return body.data;
};

/**
 * Usage: `bun scripts/ci/fetch-ios-credentials.ts <dir> <bundle id> ...`
 *
 * Writes `identity.p12`, its password as `password`, one profile per bundle
 * identifier, and `profiles.json` (bundle identifier to profile path) to
 * `<dir>`, readable by the runner's user only. Reads `EXPO_TOKEN`, and the
 * account and project from `app.json`.
 *
 * The password must never reach the log or `$GITHUB_OUTPUT`: masking it means
 * printing it as a workflow command, and a newline in it would inject outputs.
 */
const main = async () => {
  const [dir, ...bundleIdentifiers] = process.argv.slice(2);
  const token = process.env.EXPO_TOKEN ?? "";
  const { expo } = JSON.parse(readFileSync("app.json", "utf8"));
  const projectFullName = `@${expo.owner}/${expo.slug}`;

  const targets: TargetCredentials[] = [];
  for (const bundleIdentifier of bundleIdentifiers) {
    const identifiers = await query<{
      account: { byName: { appleAppIdentifiers: { id: string }[] } };
    }>(token, APP_IDENTIFIER_QUERY, {
      accountName: expo.owner,
      bundleIdentifier,
    });
    const appleAppIdentifierId =
      identifiers.account.byName.appleAppIdentifiers[0]?.id;
    if (!appleAppIdentifierId) {
      throw new Error(`EAS knows no Apple app identifier ${bundleIdentifier}`);
    }
    const data = await query<BuildCredentialsResponse>(
      token,
      BUILD_CREDENTIALS_QUERY,
      {
        projectFullName,
        appleAppIdentifierId,
        iosDistributionType: DISTRIBUTION,
      },
    );
    targets.push(parseBuildCredentials(bundleIdentifier, data));
  }
  assertOneCertificate(targets);

  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(
    path.join(dir, "identity.p12"),
    Buffer.from(targets[0].certificateP12, "base64"),
    { mode: 0o600 },
  );
  writeFileSync(path.join(dir, "password"), targets[0].certificatePassword, {
    mode: 0o600,
  });
  const profiles: Record<string, string> = {};
  for (const target of targets) {
    const file = path.join(dir, `${target.bundleIdentifier}.mobileprovision`);
    writeFileSync(file, Buffer.from(target.provisioningProfile, "base64"), {
      mode: 0o600,
    });
    profiles[target.bundleIdentifier] = file;
  }
  writeFileSync(path.join(dir, "profiles.json"), JSON.stringify(profiles));
  console.log(
    `Fetched ${DISTRIBUTION} credentials for ${bundleIdentifiers.join(", ")}`,
  );
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
