import {
  type Artifact,
  pickSource,
  type RunContext,
} from "./find-native-build";

const REPO = 1000;
const FORK = 2000;
const THIS_PR = 42;
const CLOSED_PR = 7;

let nextId = 1;
const artifact = (
  headBranch: string,
  createdAt: string,
  overrides: Partial<Artifact> & {
    headRepositoryId?: number;
    repositoryId?: number;
  } = {},
): Artifact => {
  const { headRepositoryId = REPO, repositoryId = REPO, ...rest } = overrides;
  const id = nextId++;
  return {
    id,
    name: "streamyfin-ios-phone-unsigned-ipa-fp-abc",
    expired: false,
    created_at: createdAt,
    workflow_run: {
      id: id * 10,
      head_branch: headBranch,
      head_repository_id: headRepositoryId,
      repository_id: repositoryId,
    },
    ...rest,
  };
};

const onPullRequest = (
  headRef: string,
  headRepositoryId = REPO,
): RunContext => ({
  repositoryId: REPO,
  pullRequest: { number: THIS_PR, headRef, headRepositoryId },
});

const onMergeQueue: RunContext = { repositoryId: REPO };

/** The pull request numbers each run belongs to, keyed by run id. */
const pullRequestsOfRun =
  (runs: Record<number, number[]>) => async (runId: number) =>
    runs[runId] ?? [];

/** Every queried run belongs to this pull request. */
const ownRuns = async () => [THIS_PR];

describe("pickSource", () => {
  it("prefers the pull request's own earlier build over develop", async () => {
    const develop = artifact("develop", "2026-11-04T12:00:00Z");
    const own = artifact("feat/thing", "2026-11-03T12:00:00Z");
    expect(
      await pickSource([develop, own], onPullRequest("feat/thing"), ownRuns),
    ).toBe(own);
  });

  it("takes the newest develop build when the pull request has none", async () => {
    const older = artifact("develop", "2026-11-01T12:00:00Z");
    const newer = artifact("develop", "2026-11-04T12:00:00Z");
    expect(
      await pickSource([older, newer], onPullRequest("feat/thing"), ownRuns),
    ).toBe(newer);
  });

  it("never takes another pull request's build", async () => {
    // Anyone can open a PR and name an artifact after a matching fingerprint,
    // so its binary may carry native code this PR never reviewed.
    const other = artifact("feat/other", "2026-11-04T12:00:00Z");
    expect(
      await pickSource([other], onPullRequest("feat/thing"), ownRuns),
    ).toBeUndefined();
    expect(await pickSource([other], onMergeQueue, ownRuns)).toBeUndefined();
  });

  it("never takes a closed pull request's build on a reused branch", async () => {
    // The branch matches, but the run belongs to a different pull request.
    const closed = artifact("feat/thing", "2026-11-04T12:00:00Z");
    const runs = pullRequestsOfRun({
      [closed.workflow_run.id]: [CLOSED_PR],
    });
    expect(
      await pickSource([closed], onPullRequest("feat/thing"), runs),
    ).toBeUndefined();
  });

  it("falls through a closed pull request's build to the next of this one", async () => {
    const closed = artifact("feat/thing", "2026-11-04T12:00:00Z");
    const own = artifact("feat/thing", "2026-11-03T12:00:00Z");
    const runs = pullRequestsOfRun({
      [closed.workflow_run.id]: [CLOSED_PR],
      [own.workflow_run.id]: [THIS_PR],
    });
    expect(
      await pickSource([closed, own], onPullRequest("feat/thing"), runs),
    ).toBe(own);
  });

  it("never takes a fork's branch that is named develop", async () => {
    const forkDevelop = artifact("develop", "2026-11-04T12:00:00Z", {
      headRepositoryId: FORK,
    });
    expect(
      await pickSource([forkDevelop], onMergeQueue, ownRuns),
    ).toBeUndefined();
  });

  it("never takes a same-named branch from another repository", async () => {
    // A fork PR from `feat/thing` must not match the upstream `feat/thing`.
    const upstream = artifact("feat/thing", "2026-11-04T12:00:00Z");
    expect(
      await pickSource([upstream], onPullRequest("feat/thing", FORK), ownRuns),
    ).toBeUndefined();
  });

  it("lets a fork pull request reuse its own earlier build", async () => {
    const own = artifact("feat/thing", "2026-11-04T12:00:00Z", {
      headRepositoryId: FORK,
    });
    expect(
      await pickSource([own], onPullRequest("feat/thing", FORK), ownRuns),
    ).toBe(own);
  });

  it("skips expired artifacts", async () => {
    const expired = artifact("develop", "2026-11-04T12:00:00Z", {
      expired: true,
    });
    const live = artifact("develop", "2026-11-01T12:00:00Z");
    expect(await pickSource([expired, live], onMergeQueue, ownRuns)).toBe(live);
  });

  it("skips merge queue builds, which are not develop", async () => {
    const queue = artifact(
      "gh-readonly-queue/develop/pr-1-abc",
      "2026-11-04T12:00:00Z",
    );
    expect(await pickSource([queue], onMergeQueue, ownRuns)).toBeUndefined();
  });

  it("finds nothing in an empty list", async () => {
    expect(await pickSource([], onMergeQueue, ownRuns)).toBeUndefined();
  });
});
