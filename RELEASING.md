# Releasing

Releases are triggered by pushing a Git tag that matches `v*`.

## Recommended flow

1. Prepare the version:

```powershell
npm run release:prepare -- 0.2.1
```

2. Review the version bump in [package.json](/d:/Work/Projects/ezd6/package.json) and [public/system.json](/d:/Work/Projects/ezd6/public/system.json).

3. Commit and tag:

```powershell
git add package.json public/system.json
git commit -m "Release v0.2.1"
git tag v0.2.1
```

4. Push:

```powershell
git push origin main
git push origin v0.2.1
```

## What GitHub does

The release workflow in [release.yml](/d:/Work/Projects/ezd6/.github/workflows/release.yml):

- installs dependencies
- runs `npm run build`
- patches `dist/system.json` for the tagged release
- zips `dist` into `ezd6-reforged.zip`
- publishes a GitHub Release with the zip and manifest

## Dry run

To preview the version bump without writing files:

```powershell
npm run release:prepare -- 0.2.1 --dry-run
```
