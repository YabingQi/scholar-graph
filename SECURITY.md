# Security Policy

## Supported Versions

Only the latest commit on `main` is actively maintained.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately by emailing the maintainer or using [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) feature on this repository.

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any suggested mitigations

You can expect an acknowledgement within 48 hours and a resolution or status update within 7 days.

## Scope

This project fetches data from the public [DBLP API](https://dblp.org) and serves it via a local FastAPI backend. The primary attack surface is:

- The FastAPI API endpoints (injection, DoS via large requests)
- The local SQLite database (path traversal if the DB path is user-controlled)
- CORS configuration (ensure `CORS_ORIGINS` is set correctly in production)
