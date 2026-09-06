    // =========================================================
    // Synchronization
    // =========================================================

    function findCurrentLine(
        progressMs
    ) {
        if (!lyricLines.length) {
            return -1;
        }

        let low = 0;
        let high =
            lyricLines.length - 1;

        let answer = -1;

        while (low <= high) {
            const mid =
                Math.floor(
                    (low + high) / 2
                );

            if (
                lyricLines[mid].timeMs
                <= progressMs
            ) {
                answer = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        return answer;
    }

    function updateLyrics() {
        if (!lyricLines.length) {
            return;
        }

        // PiP React rerender 後，
        // 如果我們的元素被移掉，
        // 就自動補回去。
        if (
            pipDocument?.body &&
            !pipDocument.getElementById(
                PIP_ROOT_ID
            )
        ) {
            createPiPUI(
                pipDocument
            );
        }

        const progress =
            Spicetify.Player
                .getProgress?.() || 0;

        const index =
            findCurrentLine(
                progress
            );

        if (
            index ===
            currentLineIndex
        ) {
            return;
        }

        currentLineIndex =
            index;

        renderPiPLyrics(index);

        if (index >= 0) {
            console.log(
                "[MiniLyrics] ♪",
                lyricLines[index].text
            );

            const translation =
                lyricLines[index]
                    ?.translation || "";

            if (translation) {
                console.log(
                    "[MiniLyrics] ↳ zh-Hant:",
                    translation
                );
            }
        }
    }

    function startSync() {
        if (syncTimer) {
            clearInterval(
                syncTimer
            );
        }

        syncTimer =
            setInterval(
                updateLyrics,
                100
            );

        updateLyrics();
    }
