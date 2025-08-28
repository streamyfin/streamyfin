# Contributing to StreamyFin

Thank you for your interest in contributing to the StreamyFin mobile app project! This document provides guidelines to smoothly collaborate on the StreamyFin codebase and help improve the app for all users.

---

## Table of Contents

- [Reporting Issues](#reporting-issues)
- [Requesting Features & Enhancements](#requesting-features--enhancements)
- [Developing the Mobile App](#developing-the-mobile-app)
  - [Codebase Overview](#codebase-overview)
  - [Setting Up Your Development Environment](#setting-up-your-development-environment)
  - [Making Changes](#making-changes)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Release Process](#release-process)
- [Getting Help and Community](#getting-help-and-community)

---

## Reporting Issues

StreamyFin uses GitHub issues to track bugs and improvements. Before opening a new issue:

- Search existing issues for duplicates.
- Provide clear, reproducible steps to demonstrate bugs.
- Include device info, OS version, StreamyFin version, and any relevant logs.
- Tag bug reports with `[bug]` at the start of the issue title for easier triage.

If you're unsure about how to report an issue or need help, reach out to the community via our chat links.

---

## Requesting Features & Enhancements

Please submit feature and enhancement requests as GitHub issues labeled `enhancement`.

Before creating a new feature request:

- Check if the idea or similar request exists.
- Use reactions like 👍 to support existing requests.
- Provide a clear explanation of the use case and benefits.

---

## Developing the Mobile App

### Codebase Overview

StreamyFin is built primarily using Expo and React Native to support both iOS and Android platforms within a single repository. The app communicates directly with Jellyfin backend servers for media streaming.

### Setting Up Your Development Environment

1. Fork the StreamyFin repository on GitHub.
2. Clone your fork:

```

git clone git@github.com:yourusername/streamyfin.git
cd streamyfin

```

3. Install dependencies:

```

bun install

```

4. Start the development server locally (with Expo):

```

bun start

```

5. Use the Expo app on your mobile device or emulator to run and debug StreamyFin.

### Making Changes

1. Stay up to date by syncing with upstream:

```

git fetch upstream
git rebase upstream/master

```

2. Create a descriptive feature or bugfix branch:

```

git checkout -b feat/feature-name

```

3. Commit changes with clear, concise messages using imperative mood.
4. Push changes to your fork:

```

git push --set-upstream origin feat/feature-name

```

---

## Pull Request Guidelines

When opening a PR:

- Title should clearly summarize the change.
- Reference any related issue(s) using keywords like `closes #123`.
- Follow our [Conventional Commits](https://www.conventionalcommits.org/) style, e.g., `feat: add new playback controls`.
- Provide a detailed description in the PR body, explaining what, why, and any impacts.
- Include screenshots or recordings if UI changes are involved.
- Ensure all tests pass and add new tests as needed.
- Keep PRs focused; avoid bundling unrelated changes together.

PRs require review and approval by maintainers before merging.

---

## Release Process

- StreamyFin follows semantic versioning (`MAJOR.MINOR.PATCH`).
- Releases are made periodically after testing and QA cycles.
- Release announcements are posted on our repository and community channels.
- Contributions accepted through PRs will be included in upcoming releases according to readiness.

---

## Getting Help and Community

- Join our community chat channels on [Discord](https://discord.streamyfin.app) for questions and support.
- Use GitHub discussions or open issues to get assistance or report problems.

---

Thank you for helping make StreamyFin a better app for everyone !
