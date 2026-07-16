# Security Policy

Seedless is a non-custodial Solana wallet. Users hold their own funds, so we
take security reports seriously and respond to every one.

## Supported versions

Only the latest published beta build is supported. Older APKs do not receive
security fixes and should be replaced.

## Reporting a vulnerability

Please **do not open a public GitHub issue** for a security problem.

Report privately to **security@seedlesslabs.xyz**, or by direct message to
[@francis_codex](https://x.com/francis_codex) on X.

Include where you can:

- a description of the issue and the impact you believe it has
- the steps to reproduce it, or a proof of concept
- the build or commit you tested against
- whether the issue affects mainnet, devnet, or both

## What to expect

- Acknowledgement within 72 hours.
- An assessment and a planned fix date within 7 days.
- Credit in the release notes once the fix ships, unless you prefer to remain
  anonymous.

## Scope

In scope: the wallet application in this repository, the passkey and session
signing flow, transaction construction, the swap path, and the private
transfer layer.

Out of scope: vulnerabilities in third-party dependencies and upstream
protocols. Please report those to the relevant maintainers. We are happy to
help coordinate where the issue reaches us first.

## Safe harbour

We will not pursue action against researchers who act in good faith, avoid
privacy violations and service degradation, and give us reasonable time to fix
an issue before disclosing it.
