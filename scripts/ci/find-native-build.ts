/**
 * Finds an earlier CI build whose native binary this run can repack instead of
 * rebuilding on macOS.
 *
 * `build-apps.yml` names each iOS artifact after the `@expo/fingerprint` hash of
 * the native project, so an artifact with the same name holds a binary built
 * from the same native code. This script looks those names up and prints, for
 * each one, the run to download it from, or nothing when no build is usable.
 *
 * A repacked binary keeps the native code of the build it came from, so only a
 * build this run would trust with its own native code may be a source: a run
 * on `develop` in this repository, or an earlier run of the same pull request.
 * A binary from another pull request must never be used, because anyone can
 * open one from a fork and name an artifact after any fingerprint.
 */
import { appendFileSync } from "node:fs";

/** The branch whose builds every pull request and merge queue entry may reuse. */
export const TRUSTED_BRANCH = "develop";

export interface Artifact {
  id: number;
  name: string;
  expired: boolean;
  created_at: string;
  workflow_run: {
    id: number;
    head_branch: string;
    head_repository_id: number;
    repository_id: number;
  };
}

export interface RunContext {
  repositoryId: number;
  /** Set on a `pull_request` run: the branch and repository the PR comes from. */
  pullRequest?: { headRef: string; headRepositoryId: number };
}

const isFromThisPullRequest = (artifact: Artifact, ctx: RunContext) =>
  ctx.pullRequest !== undefined &&
  artifact.workflow_run.head_branch === ctx.pullRequest.headRef &&
  artifact.workflow_run.head_repository_id === ctx.pullRequest.headRepositoryId;

const isFromTrustedBranch = (artifact: Artifact, ctx: RunContext) =>
  artifact.workflow_run.head_branch === TRUSTED_BRANCH &&
  artifact.workflow_run.head_repository_id === ctx.repositoryId;

/**
 * Picks the artifact to repack: the newest one from this pull request, else
 * the newest one from `develop`. Returns undefined when neither exists.
 */
export const pickSource = (
  artifacts: Artifact[],
  ctx: RunContext,
): Artifact | undefined => {
  const usable = artifacts
    .filter(
      (a) => !a.expired && a.workflow_run.repository_id === ctx.repositoryId,
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    usable.find((a) => isFromThisPullRequest(a, ctx)) ??
    usable.find((a) => isFromTrustedBranch(a, ctx))
  );
};

const fetchArtifacts = async (
  repository: string,
  name: string,
  token: string,
): Promise<Artifact[]> => {
  const url = `https://api.github.com/repos/${repository}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=100`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status} for artifact ${name}`);
  }
  const body = (await response.json()) as { artifacts: Artifact[] };
  return body.artifacts;
};

/**
 * Usage: `bun scripts/ci/find-native-build.ts <output>=<artifact name> ...`
 *
 * Writes `<output>=<run id>` to `$GITHUB_OUTPUT` for each pair, with an empty
 * run id when no build is usable. Reads `GITHUB_TOKEN`, `GITHUB_REPOSITORY`,
 * `REPOSITORY_ID`, and on a pull request `PR_HEAD_REF` and `PR_HEAD_REPO_ID`.
 */
const main = async () => {
  const env = process.env;
  const token = env.GITHUB_TOKEN ?? "";
  const repository = env.GITHUB_REPOSITORY ?? "";
  const ctx: RunContext = {
    repositoryId: Number(env.REPOSITORY_ID),
    pullRequest: env.PR_HEAD_REF
      ? {
          headRef: env.PR_HEAD_REF,
          headRepositoryId: Number(env.PR_HEAD_REPO_ID),
        }
      : undefined,
  };
  for (const pair of process.argv.slice(2)) {
    const [output, name] = pair.split("=");
    const source = pickSource(
      await fetchArtifacts(repository, name, token),
      ctx,
    );
    const runId = source ? String(source.workflow_run.id) : "";
    console.log(
      `${name}: ${source ? `run ${runId} (${source.workflow_run.head_branch})` : "none, full build"}`,
    );
    if (env.GITHUB_OUTPUT)
      appendFileSync(env.GITHUB_OUTPUT, `${output}=${runId}\n`);
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
