# @tailfire/config

Shared configuration package for Tailfire workspaces.

## What It Exports

- ESLint config entries for base, Next.js, and Node
- flat ESLint config variants
- TypeScript base configs for base, Next.js, and Node workspaces
- shared port map from `ports.js`

## Notable Runtime Use

The shared port map is consumed by `scripts/run-next.mjs` to keep the frontend dev/start ports consistent:

- admin: `3100`
- api: `3101`
- ota: `3102`
- client: `3103`

## Notes

- This package is configuration-only; it does not contain app runtime features.
- It is a private workspace package.

## Related Docs

- [`../../README.md`](../../README.md)
- [`../../docs/LOCAL_DEV.md`](../../docs/LOCAL_DEV.md)
