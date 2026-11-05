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
 * on `develop` in this repository, or an earlier run of the same pull request
 * when that pull request comes from this repository. A binary from another
 * pull request must never be used, because anyone can open one from a fork and
 * name an artifact after any fingerprint. A fork pull request's own builds are
 * left out too: its runs follow its own copy of the workflow, so one commit
 * could upload any binary under the next commit's fingerprint and the next
 * revert that, leaving a binary no reviewed diff contains. A branch name does
 * not identify a pull request — a closed one's branch can be reused — so a run
 * counts as this pull request's only when its head commit is one of the pull
 * request's commits.
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
    head_sha: string;
    repository_id: number;
  };
}

export interface RunContext {
  repositoryId: number;
  /**
   * Set on a `pull_request` run: the branch and repository it comes from, and
   * the commit SHAs `/pulls/{number}/commits` reports for it.
   */
  pullRequest?: {
    headRef: string;
    headRepositoryId: number;
    commits: ReadonlySet<string>;
  };
}

const isFromThisPullRequest = (artifact: Artifact, ctx: RunContext) =>
  ctx.pullRequest !== undefined &&
  ctx.pullRequest.headRepositoryId === ctx.repositoryId &&
  artifact.workflow_run.head_branch === ctx.pullRequest.headRef &&
  artifact.workflow_run.head_repository_id ===
    ctx.pullRequest.headRepositoryId &&
  ctx.pullRequest.commits.has(artifact.workflow_run.head_sha);

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

const github = async <T>(url: string, token: string): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
};

const fetchArtifacts = async (
  repository: string,
  name: string,
  token: string,
): Promise<Artifact[]> => {
  const artifacts: Artifact[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  while (artifacts.length < total) {
    const body = await github<{ total_count: number; artifacts: Artifact[] }>(
      `https://api.github.com/repos/${repository}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=100&page=${page}`,
      token,
    );
    total = body.total_count;
    artifacts.push(...body.artifacts);
    if (body.artifacts.length < 100) break;
    page += 1;
  }
  return artifacts;
};

const fetchPullRequestCommits = async (
  repository: string,
  prNumber: number,
  token: string,
): Promise<Set<string>> => {
  const commits = new Set<string>();
  let page = 1;
  for (;;) {
    const body = await github<{ sha: string }[]>(
      `https://api.github.com/repos/${repository}/pulls/${prNumber}/commits?per_page=100&page=${page}`,
      token,
    );
    for (const commit of body) commits.add(commit.sha);
    if (body.length < 100) return commits;
    page += 1;
  }
};

/**
 * Usage: `bun scripts/ci/find-native-build.ts <output>=<artifact name> ...`
 *
 * Writes `<output>=<run id>` to `$GITHUB_OUTPUT` for each pair, with an empty
 * run id when no build is usable. Reads `GITHUB_TOKEN`, `GITHUB_REPOSITORY`,
 * `REPOSITORY_ID`, and on a pull request `PR_NUMBER`, `PR_HEAD_REF` and
 * `PR_HEAD_REPO_ID`.
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
          commits: await fetchPullRequestCommits(
            repository,
            Number(env.PR_NUMBER),
            token,
          ),
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
