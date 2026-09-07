    // =========================================================
    // Load song
    // =========================================================

    async function loadCurrentTrack() {
        const track =
            getCurrentTrack();

        if (
            !track ||
            !track.uri
        ) {
            return false;
        }

        if (
            track.uri ===
            currentTrackUri
        ) {
            return true;
        }

        currentTrackUri =
            track.uri;

        currentTrack =
            track;
        missingLyricsMessage = "";

        const myRequestId =
            ++requestId;

        // Cancel any translation request belonging to the previous song.
        ++translationRequestId;

        lyricLines = [];
        currentLineIndex = -1;
        lastRenderedPiPIndex = null;

        if (syncTimer) {
            clearInterval(
                syncTimer
            );

            syncTimer = null;
        }

        console.log(
            "[MiniLyrics] TRACK:",
            track
        );

        renderPiPStatus(
            `Searching: ${track.title}`
        );

        try {
            const result =
                await fetchLyrics(
                    track
                );

            if (
                myRequestId !==
                requestId
            ) {
                return true;
            }

            if (
                !result ||
                !result.syncedLyrics
            ) {
                console.warn(
                    "[MiniLyrics] No synchronized lyrics"
                );

                renderPiPStatus(
                    "No synchronized lyrics"
                );

                return true;
            }

            lyricLines =
                parseLRC(
                    result.syncedLyrics
                );

            console.log(
                `[MiniLyrics] Loaded ${lyricLines.length} lines`
            );

            if (!lyricLines.length) {
                renderPiPStatus(
                    "Unable to parse lyrics"
                );

                return true;
            }

            displayStatus = "";

            /*
             * 歌詞載入成功後直接開始同步。
             * 不再跳 Spotify 白色 "Lyrics ready" 通知。
             */
            console.log(
                `[MiniLyrics] Lyrics ready: ${track.title}`
            );

            const cachedTranslations =
                readCachedTranslations(
                    track
                );

            if (translationsEnabled && cachedTranslations) {
                applyTranslationArray(
                    cachedTranslations
                );
            }

            startSync();

            /*
             * Translation is intentionally background-only:
             * original LRCLIB lyrics start immediately and never wait
             * for NetEase or OpenCC.
             */
            loadNeteaseTranslation(
                track,
                myRequestId
            );

            return true;

        } catch (error) {
            if (myRequestId !== requestId) return true;
            console.error(
                "[MiniLyrics] Lyrics error:",
                error
            );

            renderPiPStatus(
                "Lyrics request failed"
            );

            return true;
        }
    }

