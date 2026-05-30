# Release Copy

This file contains ready-to-paste copy for GitHub and Obsidian community release pages.

## GitHub repository description

Translate Obsidian community plugin detail pages in place with multi-language support and source-language auto-detect.

## Short plugin introduction

Community Detail Translator adds an in-place translation button to Obsidian's community plugin detail pages. It translates plugin descriptions directly inside the marketplace UI, supports multiple target languages, and lets users switch between translated text and the original text without leaving the page.

## GitHub release notes for v0.1.0

### Community Detail Translator v0.1.0

Initial public release.

#### Highlights

- Adds an in-place translation button to community plugin detail pages
- Supports source language auto-detect
- Supports multiple target languages
- Translates the full detail pane, not only the visible viewport
- Lets users toggle between translated text and the original text
- Prioritizes summary content first for faster visible feedback
- Uses Google Translate first and MyMemory as fallback when possible

#### Notes

- Desktop only
- Translation quality depends on upstream translation services
- If Obsidian changes marketplace DOM structure in future releases, selector updates may be required

## Community submission summary

Community Plugin Detail Translator brings in-place translation to Obsidian's community plugin browser. Users can open any plugin detail page, choose source and target languages, translate the full detail content, and switch back to the original text at any time.

## Forum or showcase post draft

I built Community Plugin Detail Translator, an Obsidian plugin that translates community plugin detail pages directly inside the marketplace UI.

It adds a translation button to the detail pane, supports multiple target languages, can auto-detect the source language, and lets you switch between translated text and the original text without opening a separate panel.

The plugin also prioritizes the summary section first, so visible content starts changing quickly even on long README pages.
