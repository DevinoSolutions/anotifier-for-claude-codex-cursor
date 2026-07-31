# Security Policy

## Supported Versions

Security fixes land on the latest `1.x` release. Please upgrade to the newest
version before reporting — the issue may already be fixed.

| Version | Supported |
|---------|:---------:|
| latest 1.x | yes |
| older      | no  |

## Reporting a Vulnerability

Report privately through GitHub Security Advisories: open the
[Security tab](https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/security)
of this repository and choose **Report a vulnerability**. That keeps the report
private until a fix is available.

Please do not open a public issue for a suspected vulnerability.

Helpful details to include:

- what an attacker can do, and the impact
- OS and `anotifier` version
- steps to reproduce, or a minimal config that triggers it

This is a small maintainer team, so response time is best-effort rather than
guaranteed — expect an initial acknowledgement within a few business days. If a
report is confirmed, the fix and an advisory are published together.

## Scope Notes

`anotifier` runs locally, reads `~/.anotifier/config.json`, and can send
notifications to third-party endpoints you configure (ntfy topics, webhook
URLs). Webhook URLs and bot tokens in your config are secrets: errors are logged
with the URL's origin only, never the full URL. Reports about secret leakage
through logs, hook payloads, or notification content are in scope.
