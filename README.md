# Spotify-Mini-player-Lyrics

Synchronized lyrics directly inside Spotify's native Mini Player.

**Spotify-Mini-player-Lyrics** is a lightweight [Spicetify](https://spicetify.app/) extension that retrieves synchronized lyrics from [LRCLIB](https://lrclib.net/) and displays them directly inside Spotify's native Picture-in-Picture Mini Player.

## Features

- Synchronized lyrics inside Spotify's native Mini Player
- Smooth vertical lyric scrolling animations
- Previous, current, and next lyric display
- Multi-line lyrics with automatic wrapping
- Animated searching indicator
- Automatic lyric lookup when changing tracks
- LRCLIB exact lookup with search fallback
- Seek-aware lyric synchronization
- No separate lyrics window required

## Requirements

- Spotify Desktop
- [Spicetify](https://spicetify.app/)
- Windows

## Installation

### 1. Download the extension

Download `miniLyrics.js` from this repository:

[Spotify-Mini-player-Lyrics](https://github.com/JoyBoyuuu/Spotify-Mini-player-Lyrics)

### 2. Copy the extension

Place `miniLyrics.js` in your Spicetify Extensions directory:

```text
%APPDATA%\spicetify\Extensions\
```

For example:

```text
C:\Users\<YourUsername>\AppData\Roaming\spicetify\Extensions\miniLyrics.js
```

### 3. Enable the extension

Open PowerShell and run:

```powershell
spicetify config extensions miniLyrics.js
spicetify apply
```

Spotify will restart automatically.

### 4. Open the Mini Player

Start playing a song and open Spotify's native Mini Player.

If synchronized lyrics are available, they will appear automatically.

## Updating

Replace the existing:

```text
%APPDATA%\spicetify\Extensions\miniLyrics.js
```

with the latest version from this repository.

Then run:

```powershell
spicetify apply
```

## How It Works

The extension reads the currently playing track and playback position through Spicetify.

It then:

1. Detects the currently playing song.
2. Retrieves synchronized lyrics from LRCLIB.
3. Parses the LRC timestamps.
4. Matches Spotify's playback position to the corresponding lyric line.
5. Injects the lyrics directly into Spotify's native Picture-in-Picture Mini Player.
6. Updates the displayed lyrics automatically during playback.
7. Re-synchronizes immediately when seeking or changing tracks.

## Lyrics Display

The Mini Player displays the surrounding lyrics with the current line emphasized.

```text
Previous lyric

CURRENT LYRIC

Next lyric
```

When the song moves to the next line, the lyrics smoothly scroll upward instead of switching instantly.

Long lyric lines are automatically wrapped instead of being truncated with `...`.

## Lyrics Source

Lyrics are retrieved from [LRCLIB](https://lrclib.net/).

This project does not include or redistribute a bundled lyrics database.

Availability and synchronization accuracy depend on the lyrics available from LRCLIB.

## Repository

GitHub:

[JoyBoyuuu/Spotify-Mini-player-Lyrics](https://github.com/JoyBoyuuu/Spotify-Mini-player-Lyrics)

## Disclaimer

Spotify-Mini-player-Lyrics is an unofficial community project.

It is not affiliated with, endorsed by, or associated with Spotify, Spicetify, or LRCLIB.
