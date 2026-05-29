# Contributing

Contributions are welcome — bug reports, feature requests, and pull requests.

## Setup

```sh
git clone https://github.com/aohana182/crude.git
cd crude
npm install
npm run dev
```

Run tests:

```sh
npm test
```

## Workflow

1. Branch from `main`: `git checkout -b feat/your-feature`
2. Make changes and run tests
3. Commit with [Conventional Commits](https://www.conventionalcommits.org): `feat(scope): description`
4. Open a PR against `main`

## Commit format

```
type(scope): subject

- What changed
- Why it matters
- How verified
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`

## Code style

```sh
npm run lint
```
