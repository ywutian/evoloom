# Security policy

## Supported versions

Security fixes are applied to the latest tagged release and the `main` branch.
Older releases may not receive patches.

## Report a vulnerability

Use GitHub's private vulnerability reporting feature for this repository. Do
not open a public issue and do not include working credentials, private source
code, personal data, or exploit details in public logs.

Include:

- the affected version or commit;
- the impacted CLI, ACP, gateway, or deployment surface;
- minimal reproduction steps;
- expected and observed behavior;
- potential impact and any suggested mitigation.

Please allow reasonable time for validation and remediation before public
disclosure.

## Public demo boundary

The anonymous demo is intentionally more restricted than the local CLI. It
must not expose Shell, arbitrary filesystem access, secret mutation, plugin or
Skill installation, or conversations owned by another visitor. Provider
credentials belong only in Secret Manager or equivalent server-side secret
storage.
