# Contributing

Thanks for taking an interest in Seedless.

## Getting set up

```bash
npm install
cp .env.example .env    # fill in your own keys
npm run typecheck
npm run android         # or: npm run ios
```

Node 20 or newer. The version used in development is pinned in `.nvmrc`.

## Before you open a pull request

- `npm run typecheck` must pass. The repository is currently clean, so any
  error you see is one you introduced.
- Keep changes focused. One concern per pull request.
- Match the style of the file you are editing rather than reformatting it.
- Fill in the pull request template, particularly the risk section.

## Things that need extra care

Some parts of this codebase move user funds. If you are touching any of the
following, say so explicitly in the pull request and describe how you tested:

- transaction construction and signing
- the passkey and session signer flow
- fee sponsorship through the paymaster
- the swap path
- the private transfer and stealth address layers

Test against devnet first. Never commit a key, a secret, or a `.env` file.

## Reporting bugs

Open an issue using the bug report template. For anything security related,
follow [SECURITY.md](SECURITY.md) instead and report it privately.
