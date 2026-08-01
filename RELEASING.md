# Releasing

Releases are triggered by pushing a Git tag that matches `v*`.

## Recommended flow

1. Prepare the version:

```powershell
$version = "0.4.1"
npm run release:prepare -- $version
```

2. Review the version bump in `package.json`, `package-lock.json`, and `public/system.json`.

3. Commit and tag:

```powershell
git add package.json package-lock.json public/system.json
git commit -m "Release v$version"
git tag "v$version"
```

4. Push:

```powershell
git push origin HEAD
git push origin "v$version"
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
npm run release:prepare -- 0.4.1 --dry-run
```
