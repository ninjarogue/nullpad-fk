# nullpad

A markdown note editor that feels like a terminal, built with [Foldkit](https://foldkit.dev) (the Elm architecture on Effect).

## Set up

```sh
npm install
npm --prefix e2e install
npx @e2e-dev/web install chromium
git config core.hooksPath .githooks
```

The last command turns on `.githooks/pre-push`. Without it, `git push` runs no checks. Run it once in every clone.

## Run

```sh
npm run dev
```

## Check

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run arch
npm run build
npm --prefix e2e test
```

`.githooks/pre-push` runs all of these in order and fails when a test step runs no tests. Run it by hand with `.githooks/pre-push`.

`AGENTS.md` has the architecture rules and the working process.
