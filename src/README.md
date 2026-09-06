# Source layout

These files are ordered source sections for the Spicetify extension. They are
combined into one shared function scope by `scripts/build.cjs`; they are not
standalone browser scripts and should not be loaded individually.

## Responsibilities

- `00-bootstrap-state.js`: runtime readiness, constants, and shared state
- `spotify-player.js`: current Spotify track metadata
- `lyrics-*`: LRCLIB lookup, lyric parsing, and playback synchronization
- `netease-*`: NetEase requests, matching, parsing, and timeline helpers
- `translation-*`: language detection, alignment, caching, OpenCC, and loading
- `pip-*`: styles, rendering, and Picture-in-Picture lifecycle
- `track-loader.js`: orchestration when the current song changes
- `startup.js`: startup polling and Spicetify event registration

## Editing workflow

1. Edit the relevant file in this directory.
2. If a file is added, register it in the correct order in `scripts/build.cjs`.
3. Run `npm run verify` from the repository root.
4. Test the generated `miniLyrics.js` in Spicetify.

Keep declarations before their startup use. Shared mutable runtime values remain
in `00-bootstrap-state.js` so the initial split preserves the existing behavior.
