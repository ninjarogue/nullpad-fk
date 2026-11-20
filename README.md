# nullpad

A markdown note editor that feels like a terminal, built with [Foldkit](https://foldkit.dev) (the Elm architecture on Effect).

## Set up

```sh
npm install
git config core.hooksPath .githooks
```

The second command turns on `.githooks/pre-push`. Without it, `git push` runs no checks. Run it once in every clone.

## Run

```sh
npm run dev
```

## Check

```sh
npm run format:check
npm run lint
npm run typecheck
npm run arch
npm run build
```

`.githooks/pre-push` runs all of these in order. Run it by hand with `.githooks/pre-push`.

`AGENTS.md` has the architecture rules and the working process.
