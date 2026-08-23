# Changelog

All notable changes to EvoLoom are documented here. The project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

No unreleased changes yet.

## [0.3.0] - 2026-08-23

### Added

- Public Agent Canvas deployment with a restricted ACP gateway.
- Server-authoritative model allowlisting and safe runtime model switching.
- Browser-isolated, signed conversation ownership with 30-day GCS persistence.
- Deterministic conversation titles and safe manual renaming.
- Visitor, client, global hourly, and persistent daily conversation limits.
- Reproducible smoke evaluation runner and evidence requirements.
- CodeQL, Gitleaks, Dependabot, Node gateway tests, and Cloud Run image CI.

### Changed

- Renamed and packaged the runtime consistently as EvoLoom.
- Made the Cloud Run build reproducible from a pinned Agent Canvas source
  snapshot instead of a private base image.
- Parameterized provider and Google Cloud deployment configuration.

### Security

- Disabled public Shell, Secret, plugin, Skill-write, and arbitrary-file APIs.
- Bound conversation history to a signed HttpOnly visitor cookie.
- Added ownership checks to REST event and WebSocket routes.

## [0.2.0] - 2026-08-14

- Renamed BearCode to EvoLoom.

## [0.1.0] - 2026-08-07

- Initial public-ready CLI and container baseline.

[Unreleased]: https://github.com/ywutian/evoloom/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/ywutian/evoloom/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ywutian/evoloom/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ywutian/evoloom/releases/tag/v0.1.0
