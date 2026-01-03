# Security Policy

## Supported Versions of Streamyfin Mobile App

Only the most recent stable release of the Streamyfin mobile app is guaranteed to include the latest security patches. **Running older app versions may leave you vulnerable to security risks**. Always update your app from the official App Store or Google Play Store as soon as updates are available. If you must run an older version, avoid using sensitive features (e.g., account management, payment methods) until you can upgrade.

This policy applies only to the current stable app release. Security flaws in previous app versions that are no longer present in the latest release **will not** be back-ported or fixed.

## Supported Versions of Other Streamyfin Components (Server, Plugins)

Most Streamyfin backend services and plugins are supported only in their latest release. Consult each project’s README or release notes for any exceptions.

## Vulnerability Triage

Before reporting an issue, please consider:

- Administrator-level risks: Certain administrative or configuration endpoints in the backend may inherently carry elevated privileges. Vulnerabilities that **require administrator or root access** are classified as low priority. Report those via normal GitHub Issues.
- Known vulnerabilities: We maintain a public list of known issues on our Security Advisories page at https://github.com/Streamyfin/Streamyfin/security/advisories. If your issue is already listed there, please do not re-report it.
- Local-only issues: Vulnerabilities exploitable only with physical device access, manual file modification, or local debugging (e.g., modifying app files, rooting/jailbreaking) are considered low- to medium-priority.
- Infrastructure reports: To report issues in our website, servers, CI/CD, or other infrastructure, tag your report subject with `[Streamyfin Infrastructure]`. Our infrastructure team follows standard patch policies for public vulnerabilities, so avoid duplicating widely known issues.


## Reporting a Vulnerability

After confirming your issue is new and relevant, send an email to **developer@streamyfin.app** with the following:

1. Subject line: `[Streamyfin Security] <short summary>`
2. Overview (public-safe): Describe what component is affected (mobile app, backend API, plugin) and the high-level impact. We may reuse this text for a GitHub Security Advisory.
3. Details: Provide reproduction steps, code or API snippets, proof-of-concept, and any suggested remediation. Detail exactly how to trigger the issue.
4. Your GitHub username: So we can invite you to the GitHub Security Advisory (GHSA) for coordination and credit.

Once received, we will review the report, file a GHSA if warranted, and include you and the relevant teams in the remediation process.

## Post-Disclosure Process

Streamyfin is a volunteer-driven project. **We appreciate patience and do not enforce strict disclosure deadlines**, especially for complex issues. You may send polite follow-ups if there’s no response after a reasonable interval.

- Patch releases: For critical vulnerabilities, we generally issue a point release promptly unless a major release is imminent; in that case, we defer the fix.
- Advisory publication: After releasing a patched app version, we wait at least seven days (1 week) before publishing the GHSA to allow most users to upgrade. We request that any third-party disclosures (blog posts, advisories) occur **after** our GHSA publication.
- CVE assignment: We will request CVEs via the GitHub Security interface and include them in the published advisory.
