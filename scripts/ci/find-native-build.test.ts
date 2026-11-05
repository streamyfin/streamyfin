import {
  type Artifact,
  pickSource,
  type RunContext,
} from "./find-native-build";

const REPO = 1000;
const FORK = 2000;

let nextId = 1;
const artifact = (
  headBranch: string,
  createdAt: string,
  overrides: Partial<Artifact> & {
    headRepositoryId?: number;
    headSha?: string;
    repositoryId?: number;
  } = {},
): Artifact => {
  const {
    headRepositoryId = REPO,
    headSha,
    repositoryId = REPO,
    ...rest
  } = overrides;
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
      head_sha: headSha ?? `sha-${id}`,
      repository_id: repositoryId,
    },
    ...rest,
  };
};

const onPullRequest = (
  headRef: string,
  commits: string[],
  headRepositoryId = REPO,
): RunContext => ({
  repositoryId: REPO,
  pullRequest: { headRef, headRepositoryId, commits: new Set(commits) },
});

const onMergeQueue: RunContext = { repositoryId: REPO };

describe("pickSource", () => {
  it("prefers the pull request's own earlier build over develop", () => {
    const develop = artifact("develop", "2026-11-04T12:00:00Z");
    const own = artifact("feat/thing", "2026-11-03T12:00:00Z");
    expect(
      pickSource(
        [develop, own],
        onPullRequest("feat/thing", [own.workflow_run.head_sha]),
      ),
    ).toBe(own);
  });

  it("takes the newest develop build when the pull request has none", () => {
    const older = artifact("develop", "2026-11-01T12:00:00Z");
    const newer = artifact("develop", "2026-11-04T12:00:00Z");
    expect(
      pickSource([older, newer], onPullRequest("feat/thing", ["sha-x"])),
    ).toBe(newer);
  });

  it("never takes another pull request's build", () => {
    // Anyone can open a PR and name an artifact after a matching fingerprint,
    // so its binary may carry native code this PR never reviewed.
    const other = artifact("feat/other", "2026-11-04T12:00:00Z");
    const ctx = onPullRequest("feat/thing", [other.workflow_run.head_sha]);
    expect(pickSource([other], ctx)).toBeUndefined();
    expect(pickSource([other], onMergeQueue)).toBeUndefined();
  });

  it("never takes a closed pull request's build on a reused branch", () => {
    // The branch matches, but its old head commit is not in this pull request.
    const closed = artifact("feat/thing", "2026-11-04T12:00:00Z", {
      headSha: "sha-closed",
    });
    expect(
      pickSource([closed], onPullRequest("feat/thing", ["sha-mine"])),
    ).toBeUndefined();
  });

  it("falls through a closed pull request's build to the next of this one", () => {
    const closed = artifact("feat/thing", "2026-11-04T12:00:00Z", {
      headSha: "sha-closed",
    });
    const own = artifact("feat/thing", "2026-11-03T12:00:00Z");
    expect(
      pickSource(
        [closed, own],
        onPullRequest("feat/thing", [own.workflow_run.head_sha]),
      ),
    ).toBe(own);
  });

  it("never takes a fork's branch that is named develop", () => {
    const forkDevelop = artifact("develop", "2026-11-04T12:00:00Z", {
      headRepositoryId: FORK,
    });
    expect(pickSource([forkDevelop], onMergeQueue)).toBeUndefined();
  });

  it("never takes a same-named branch from another repository", () => {
    // A fork PR from `feat/thing` must not match the upstream `feat/thing`.
    const upstream = artifact("feat/thing", "2026-11-04T12:00:00Z");
    expect(
      pickSource(
        [upstream],
        onPullRequest("feat/thing", [upstream.workflow_run.head_sha], FORK),
      ),
    ).toBeUndefined();
  });

  it("lets a fork pull request reuse its own earlier build", () => {
    // The run's pull_requests stays empty for a fork pull request, so the
    // commit match is what identifies it.
    const own = artifact("feat/thing", "2026-11-04T12:00:00Z", {
      headRepositoryId: FORK,
    });
    expect(
      pickSource(
        [own],
        onPullRequest("feat/thing", [own.workflow_run.head_sha], FORK),
      ),
    ).toBe(own);
  });

  it("skips expired artifacts", () => {
    const expired = artifact("develop", "2026-11-04T12:00:00Z", {
      expired: true,
    });
    const live = artifact("develop", "2026-11-01T12:00:00Z");
    expect(pickSource([expired, live], onMergeQueue)).toBe(live);
  });

  it("skips merge queue builds, which are not develop", () => {
    const queue = artifact(
      "gh-readonly-queue/develop/pr-1-abc",
      "2026-11-04T12:00:00Z",
    );
    expect(pickSource([queue], onMergeQueue)).toBeUndefined();
  });

  it("finds nothing in an empty list", () => {
    expect(pickSource([], onMergeQueue)).toBeUndefined();
  });
});
