# Spicetify Mini Lyrics

Synchronized lyrics directly inside Spotify's native Mini Player.

Built as a lightweight [Spicetify](https://spicetify.app/) extension using [LRCLIB](https://lrclib.net/) for synchronized lyrics.

## Features

- Lyrics inside Spotify's native Picture-in-Picture Mini Player
- Synchronized lyrics using Spotify playback position
- Smooth vertical lyric scrolling
- Previous / current / next lyric display
- Multi-line lyrics without truncation
- Animated searching indicator
- Automatic lyric lookup when changing tracks
- LRCLIB exact lookup with search fallback
- Seek-aware synchronization

## Requirements

- Spotify Desktop
- Spicetify
- Windows

## Installation

Copy `miniLyrics.js` into your Spicetify Extensions directory:

```text
%APPDATA%\spicetify\Extensions\
```

Then enable the extension:

```powershell
spicetify config extensions miniLyrics.js
spicetify apply
```

Open Spotify and launch the native Mini Player.

Synchronized lyrics should appear automatically.

## Updating

Replace the existing `miniLyrics.js` with the latest version, then run:

```powershell
spicetify apply
```

## How It Works

The extension reads the currently playing track and playback position from Spicetify.

It then:

1. Retrieves synchronized lyrics from LRCLIB.
2. Parses the LRC timestamps.
3. Matches Spotify's current playback position to the corresponding lyric line.
4. Injects the lyrics into Spotify's native Picture-in-Picture Mini Player.
5. Updates the displayed lyrics automatically during playback and seeking.

## Lyrics Source

Lyrics are retrieved from [LRCLIB](https://lrclib.net/).

This project does not include or redistribute a bundled lyrics database.

## Disclaimer

This is an unofficial project and is not affiliated with Spotify, Spicetify, or LRCLIB.