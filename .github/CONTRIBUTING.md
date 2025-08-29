# Contributing to Streamyfin

Thank you for your interest in contributing to the Streamyfin mobile app project! This document provides guidelines to smoothly collaborate on the Streamyfin codebase and help improve the app for all users.

---

## Table of Contents

- [Reporting Issues](#reporting-issues)
- [Reporting Security Vulnerabilities](#reporting-security-vulnerabilities)
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

Streamyfin uses GitHub issues to track bugs and improvements. Before opening a new issue:

- Search existing issues for duplicates.
- Provide clear, reproducible steps to demonstrate bugs.
- Include device info, OS version, Streamyfin version, and any relevant logs.
- Apply the `bug` label to the issue for easier triage; no title prefix needed.

If you're unsure about how to report an issue or need help, reach out to the community via our chat links.

### Reporting Security Vulnerabilities

Please do not file public GitHub issues for security vulnerabilities.

Report security concerns via GitHub Security Advisories (Repository → Security → Report a vulnerability). Provide steps to reproduce, affected versions, and mitigation ideas if available. We’ll acknowledge receipt and coordinate a fix before public disclosure.

If Security Advisories are unavailable for you, contact the maintainers via the email listed in SECURITY.md.---

## Requesting Features & Enhancements

Please submit feature and enhancement requests as GitHub issues labeled `enhancement`.

When creating a new feature request:

- Check if the idea or similar request exists.
- Use reactions like 👍 to support existing requests.
- Provide a clear explanation of the use case and benefits.

---

## Developing the Mobile App

### Codebase Overview

Streamyfin is built primarily using Expo and React Native to support both iOS and Android platforms within a single repository. The app communicates directly with Jellyfin backend servers for media streaming.

### Setting Up Your Development Environment

1. Fork the Streamyfin repository on GitHub. If prompted with “Copy the main branch only,” uncheck it so all branches are copied.
2. Clone your fork:

```

git clone git@github.com:yourusername/streamyfin.git
# or
git clone https://github.com/yourusername/streamyfin.git
cd streamyfin

```

3. Initialize submodules and install dependencies:

```
bun run submodule-reload
bun install
```

4. Start the development server locally (with Expo):

```
bun ios / bun android
```

> Optionally, to run directly on a device or emulator:
> 
> ```
> # For iOS (requires macOS and Xcode):
> bun run ios
> # For Android (requires Android Studio or Android Debug Bridge (ADB) tool, plus an emulator or physical device):
> bun run android 
> ```

5. Use the Expo app on your mobile device or emulator to run and debug Streamyfin.

### Making Changes

1. Stay up to date by syncing with upstream:

```bash
# Add the upstream remote only once (skip if already added)
git remote add upstream https://github.com/streamyfin/streamyfin.git
# Fetch latest changes from upstream
git fetch upstream
# Rebase your current branch onto the upstream default branch (replace 'develop' if you are working from another upstream branch)
git rebase upstream/develop
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
- Ensure CI checks are green (lint, type-check, build).
- Do not include secrets, tokens, or production credentials. Redact sensitive data in logs and screenshots.
- Keep PRs focused; avoid bundling unrelated changes together.

PRs require review and approval by maintainers before merging.---

## Release Process

- Streamyfin follows semantic versioning (`MAJOR.MINOR.PATCH`).
- Releases are made periodically after testing and QA cycles.
- Tag each release and publish a GitHub Release with a changelog.
- Consider automating versioning and changelogs (e.g., Changesets or semantic-release).
- Release announcements are posted on our repository and community channels.
- Contributions accepted through PRs will be included in upcoming releases according to readiness.

---

## Getting Help and Community

- Join our community chat channels on [Discord](https://discord.streamyfin.app) for questions and support.
- Use GitHub discussions or open issues to get assistance or report problems.

---

Thank you for helping make Streamyfin a better app for everyone!
