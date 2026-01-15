# Localization workflow

This folder contains the inputs used to rebuild `lang/en.json` and `lang/ru.json`.

## Export flow

1) In Foundry, use the "Export Localization" button.
2) Save the exported JSON files into `localization/exports/`.
   - Each file should be named after its compendium pack id (for example `world.ezd6-core.json`).

## Intermediate files

- `localization/intermediate/native.json`
  - The native (UI/captions) localization keys.
  - This is the source of truth for non-compendium entries.
- `localization/intermediate/compendiums/*.json`
  - Generated from exports. One file per compendium pack.

## Update command

Run:

```bash
npm run i18n:update
```

What it does:

- Merges `native.json` + compendium intermediates into a new `public/lang/en.json`.
- Preserves old English values when a new value is empty.
- Updates `public/lang/ru.json`:
  - Removes keys missing from the new English file.
  - Clears values when English text changes.
  - Keeps existing translations otherwise.
