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
  pullRequest: { headRef, headRepositoryId },
});

const onMergeQueue: RunContext = { repositoryId: REPO };

describe("pickSource", () => {
  it("prefers the pull request's own earlier build over develop", () => {
    const develop = artifact("develop", "2026-11-04T12:00:00Z");
    const own = artifact("feat/thing", "2026-11-03T12:00:00Z");
    expect(pickSource([develop, own], onPullRequest("feat/thing"))).toBe(own);
  });

  it("takes the newest develop build when the pull request has none", () => {
    const older = artifact("develop", "2026-11-01T12:00:00Z");
    const newer = artifact("develop", "2026-11-04T12:00:00Z");
    expect(pickSource([older, newer], onPullRequest("feat/thing"))).toBe(newer);
  });

  it("never takes another pull request's build", () => {
    // Anyone can open a PR and name an artifact after a matching fingerprint,
    // so its binary may carry native code this PR never reviewed.
    const other = artifact("feat/other", "2026-11-04T12:00:00Z");
    expect(pickSource([other], onPullRequest("feat/thing"))).toBeUndefined();
    expect(pickSource([other], onMergeQueue)).toBeUndefined();
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
      pickSource([upstream], onPullRequest("feat/thing", FORK)),
    ).toBeUndefined();
  });

  it("lets a fork pull request reuse its own earlier build", () => {
    const own = artifact("feat/thing", "2026-11-04T12:00:00Z", {
      headRepositoryId: FORK,
    });
    expect(pickSource([own], onPullRequest("feat/thing", FORK))).toBe(own);
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
