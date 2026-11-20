# nullpad

A markdown note editor that feels like a terminal, built with [Foldkit](https://foldkit.dev) (the Elm architecture on Effect).

## Set up

Needs Node 22.12 or later and pnpm. `corepack enable` installs the pnpm version pinned in `package.json`.

```sh
pnpm install
```

Installing also turns on `.githooks/pre-push` (the `prepare` script sets `core.hooksPath`) and applies the Effect lint patch (`postinstall`).

## Run

```sh
pnpm dev
```

## Check

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm arch
pnpm build
```

`.githooks/pre-push` runs all of these in order. Run it by hand with `.githooks/pre-push`.

`AGENTS.md` has the architecture rules and the working process.
