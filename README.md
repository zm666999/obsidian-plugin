# Community Plugin Detail Translator

Community Plugin Detail Translator is an Obsidian desktop plugin that adds an in-place translation button to community plugin detail pages.

It translates the plugin detail view directly inside the marketplace UI, supports multiple languages, and lets you switch between the translated text and the original text without leaving the page.

## Features

- Adds a translation button directly to the community plugin detail pane
- Replaces detail content in place instead of opening a separate side panel
- Supports source language auto-detect
- Supports multiple target languages
- Lets you toggle between translated text and the original text
- Translates the whole detail pane, including hidden content already present in the DOM
- Prioritizes the summary section first so visible changes appear quickly
- Uses Google Translate first and falls back to MyMemory when possible

## Supported languages

- Auto detect for source language
- Chinese (Simplified)
- Chinese (Traditional)
- English
- Japanese
- Korean
- French
- German
- Spanish
- Russian
- Portuguese
- Italian
- Arabic
- Hindi

## How it works

When you open a plugin details page in Obsidian's community plugin browser, the plugin injects a translation button below the plugin summary area. After you click it, the plugin collects text from the entire detail pane, translates it in batches, replaces the visible text in place, and keeps the original text so you can switch back at any time.

## Usage

1. Open Obsidian Settings.
2. Go to Community plugins.
3. Enable Community Plugin Detail Translator.
4. Open the community plugin browser.
5. Open any plugin detail page.
6. Optionally choose the source and target languages in the plugin settings.
7. Click the translation button.

## Notes

- This plugin is desktop-only because it depends on the desktop marketplace DOM.
- If Obsidian changes the plugin marketplace structure in a future release, selectors may need to be updated.
- Translation quality and availability depend on the upstream public translation services.
- Google Translate supports source-language auto-detect. The MyMemory fallback works best when you choose an explicit source language.

## Development

```bash
npm install
npm run build
npm run verify
```

Generated runtime files:

- `main.js`
- `manifest.json`
- `styles.css`

## Local testing

Copy these files into a vault plugin folder:

- `main.js`
- `manifest.json`
- `styles.css`

Example target folder:

```text
YourVault/.obsidian/plugins/community-plugin-detail-translator/
```

## Submission reminder

The Obsidian community directory reads `README.md` and `manifest.json` from your repository default branch, while actual install files are downloaded from the GitHub release whose tag matches the version in `manifest.json`.
