# Security Policy

Seedless is a **non-custodial Solana wallet** in private mainnet beta. Users hold
their own funds. A bug here can cost someone real money, so we treat security
reports as the highest-priority work in the project.

If you are here to report something, jump to
[Reporting a vulnerability](#1-reporting-a-vulnerability).

---

## 1. Reporting a vulnerability

**Do not open a public GitHub issue for a security problem.** Do not post it on
X, in a Telegram group, or in a Discord.

Report privately, by either channel:

| Channel | Address |
| --- | --- |
| Email | **security@seedlesslabs.xyz** |
| Direct message | [@francis_codex](https://x.com/francis_codex) on X |

Include as much of the following as you have:

- what the issue is, and the impact you believe it has
- steps to reproduce, or a proof of concept
- the build number or commit you tested against
- whether it affects mainnet, devnet, or both
- a transaction signature, if one exists
- how you would like to be credited, or that you would rather stay anonymous

You do not need a polished write-up. A rough report of a real issue is worth far
more to us than a well-formatted non-issue.

### Our response commitment

| Severity | Acknowledged within | Assessment and fix plan within |
| --- | --- | --- |
| Critical | 24 hours | 72 hours |
| High | 48 hours | 5 days |
| Medium | 72 hours | 10 days |
| Low / informational | 5 days | with the next release |

We will keep you updated while a fix is in progress, tell you when it ships, and
credit you in the release notes unless you ask us not to.

---

## 2. What this policy covers

Seedless follows a **partnership-first architecture**. Roughly 70% of the
load-bearing cryptography and infrastructure is delegated to external systems
that carry their own audits. The custom surface is deliberately small: a
TypeScript integration layer plus one on-chain Rust program.

This matters for reporting, because **sending a report to the wrong party delays
the fix.** The tables below say who owns what.

### In scope — report these to us

| Area | What it covers |
| --- | --- |
| **Transaction construction and broadcast** | Instruction assembly, associated token account creation and idempotency, fee and rent accounting, mint validation, the sponsored versus unsponsored path |
| **Session signer lifecycle** | Storage, scope, expiry and revocation of session keys, and how they propagate into transaction builders |
| **On-chain authorization program** | The custom Rust (Pinocchio) controller that gates MPC dWallet operations behind passkey authorization: signature verification, account validation, CPI safety, replay resistance |
| **Private transfer integration** | Our wrapper around the stealth-address protocol: master-seed derivation, UTXO accounting and selection, claim, deposit and withdraw flows, recipient registration |
| **ZK proof integration** | Our bindings around partner circuits: proof input integrity, serialization, handling of secret material during proof generation |
| **Cross-chain client** | User-share confidentiality, and construction of authorization payloads against the on-chain controller |
| **Value-movement screens** | Send and swap state correctness, double-send prevention, honest disclosure of irreversible costs such as account-creation rent |
| **Stealth and token-detection helpers** | Address derivation correctness, and any false-positive token surfacing that could enable a phishing interface |
| **Anything that moves user funds without informed consent** | Always in scope, wherever it lives |

### Out of scope — report these to the owning project

These are externally audited and not maintained by us. We are happy to help
coordinate if a report reaches us first, and we will forward it rather than sit
on it.

| System | Owns |
| --- | --- |
| **LazorKit** | Passkey authentication, the smart wallet program, and the integrated Kora paymaster that sponsors fees |
| **Umbra** | The stealth-address protocol, the encrypted execution layer, and the ZK circuits themselves |
| **Jupiter** | Swap aggregation and routing |
| **Alchemy** | RPC infrastructure |
| **Ika** | The MPC network protocol and the Ika-owned SDK |

Also outside this policy: app store policy compliance, and UI or visual issues
with no security consequence. Those are welcome as normal GitHub issues.

---

## 3. Trust boundaries

What Seedless implements, versus what it delegates and assumes to be correct.

| Boundary | Trust assumption |
| --- | --- |
| Passkey signing | Delegated to LazorKit. Seedless does not implement WebAuthn or smart-wallet signing |
| Gas sponsorship | Delegated to LazorKit's integrated Kora paymaster |
| Stealth-address protocol | Delegated to Umbra. Seedless wraps the client SDK |
| Swap routing | Delegated to Jupiter |
| RPC | Delegated to Alchemy |
| MPC and cross-chain | Delegated to Ika. Seedless authorizes operations via its own on-chain controller |
| **Transaction construction, session-key lifecycle, ATA handling, intent routing** | **Implemented by Seedless** |
| **Multi-chain authorization via the on-chain controller** | **Implemented by Seedless** |

The bottom two rows are ours. That is where we most want your attention.

---

## 4. Threat model

### Assets being protected

- User funds, SOL and SPL tokens, held in the smart wallet
- Stealth-address master seeds and derived keys
- MPC user shares
- Session signer keys, within their session lifetime
- User passkeys, held in the device secure enclave and referenced through
  WebAuthn rather than accessible to our code

### Adversaries considered

- Malicious recipients, including addresses crafted to exploit account-creation
  flows
- Network-position adversaries, partially mitigated by HTTPS to RPC and partner
  endpoints
- Malicious dApps requesting transactions through the wallet via deep links
- Compromised local device storage, with limited mitigation, since passkeys are
  delegated to the OS secure enclave

### Known gaps

We would rather state these than have you waste time discovering them:

- **Automated test coverage on the TypeScript surface is limited.** There is a
  mainnet smoke test and little else.
- **Several flows evolved quickly** through a hackathon period. Refactor
  consolidation is ongoing and some code paths still carry that history.
- **The on-chain controller has been deployed to devnet** and has not yet had a
  formal mainnet hardening pass.
- **Not yet independently audited.** An external audit is being scoped. This
  policy exists partly because that audit has not happened yet, and we would
  rather hear from you first.

---

## 5. Coordinated disclosure

We ask for coordinated disclosure, and we commit to the same in return.

- **No public disclosure** of a finding at any severity until it is remediated
  and remediation is confirmed, or until a date we both agree on.
- We aim to remediate **critical findings within 7 days** and high findings
  within 30. If a fix will take longer we will tell you why rather than go quiet.
- If a finding affects **partner infrastructure**, we will coordinate disclosure
  with that partner and keep you in the loop. We will not disclose to a partner
  on your behalf without telling you first.
- We are happy to co-publish a write-up once a fix has shipped.

If we go quiet on you for more than two weeks without explanation, treat that as
a failure on our side and escalate by DM.

---

## 6. Safe harbour

We will not pursue legal action, and will not ask a platform to act against you,
for security research conducted in good faith under this policy. Good faith
means:

- you avoid privacy violations, data destruction, and degradation of service
- you do not access, modify, or exfiltrate data belonging to other users beyond
  the minimum needed to demonstrate the issue
- you do not exploit an issue beyond proving it exists, and you never move funds
  that are not yours
- you test against **devnet** wherever the issue can be demonstrated there
- you give us reasonable time to fix the issue before disclosing it

**Live exploitation against production, the paymaster, or any partner-operated
system requires our written consent in advance.** Ask first. We will usually say
yes and help you set it up safely.

---

## 7. Rewards

Seedless is pre-revenue and bootstrapped, so we cannot currently promise a cash
bounty, and we would rather be honest about that than imply one.

What we can offer today:

- public credit in the release notes and in this repository, if you want it
- a written reference for the work
- early access, and direct contact with the engineering lead
- first call on a formal bug bounty programme when one is funded

If you find something critical, talk to us anyway. We will do what we can.

---

## 8. Supported versions

Only the **latest published beta build** receives security fixes. Older APKs are
not patched and should be replaced. Version history is in
[CHANGELOG.md](CHANGELOG.md).

---

## 9. Things we will never do

So you can recognise an impersonation attempt:

- We will **never ask for a seed phrase.** Seedless does not use seed phrases at
  all. Anyone claiming to be us and asking for one is not us.
- We will never ask for your private keys, your passkey, or your device PIN.
- We will never DM you first asking you to connect a wallet or sign a
  transaction to "verify", "migrate", or "claim" anything.
- We will never ask you to install a build from anywhere other than our official
  channels.

Report impersonation to the addresses in Section 1.
