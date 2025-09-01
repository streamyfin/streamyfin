<!--
  Pull Request Template for Streamyfin
  ====================================
  Use this template to help reviewers understand the purpose of your PR
  and to ensure all necessary checks are completed before merging.
-->

## 🔖 Summary
<!--
A concise description of the changes introduced by this PR.
Example:
“Add real-time currency conversion widget to dashboard.”
-->

## 🏷️ Ticket / Issue
<!--
Link to the related ticket, issue or user story.
You can also indicate if this PR supersedes a previous one.
Example:
- Closes #123
- Fixes STREAMYFIN-456
- Resolves #789
- Supersedes #120
- Related: #130
-->

## 🛠️ What’s Changed
<!-- Use a Conventional Commit in the PR title, e.g., `feat(auth): add MFA`. 
If this PR introduces a breaking change, include a `BREAKING CHANGE:` block in the description.
Spec: https://www.conventionalcommits.org/ -->

- Type: feat | fix | docs | style | refactor | perf | test | chore | build | ci | revert
- Scope (optional): e.g., auth, billing, mobile
- Short summary: what changed and why (1–2 lines)
-->

### ⚠️ Breaking Changes
<!-- List any breaking API/contract changes and migration guidance. If none, write “None”. -->

### 🔐 Security & Privacy Impact
<!-- Data touched, new permissions/scopes, PII, secrets, threat considerations. If none, write “None”. -->

### ⚡ Performance Impact
<!-- Hot paths, memory/CPU/latency implications, benchmarks if available. -->

### 🖼️ Screenshots / GIFs (if UI)
<!-- 
Provide more context or background. Explain any non-obvious decisions.
Before/After, dark mode, responsive states. 
-->

## ✅ Checklist
<!--
Review and check off items as you complete them.
-->
- [ ] I’ve read the [contribution guidelines](CONTRIBUTING.md)
- [ ] Code follows project style and passes lint/format (`npm|pnpm|yarn|bun` scripts)
- [ ] Type checks pass (tsc/biome/etc.)
- [ ] Docs updated (README/ADR/usage/API)
- [ ] No secrets/credentials included; env vars documented
- [ ] Release notes/CHANGELOG entry added (if applicable)
- [ ] Verified locally that changes behave as expected

## 🔍 Testing Instructions
<!--
Describe how reviewers can test your changes.
Example:
1. `git fetch origin pull/<PR_ID>/head:branchname && git checkout branchname`
2. Install deps: `npm|pnpm|yarn|bun install`
3. Start service/app: `npm|pnpm|yarn|bun run [target]` (e.g., `npm run ios` or `bun run android:tv`)
4. Run tests: `npm|pnpm|yarn|bun test`
5. Verification steps:
   - [ ] Expected UI/endpoint behavior
   - [ ] Logs show no errors
   - [ ] Edge cases covered (list)
-->

## ⚙️ Deployment Notes
<!--
Describe any deployment considerations such as config, environment vars, or native builds.
-->

## 📝 Additional Notes
<!--
Any other information or references related to this PR.
-->