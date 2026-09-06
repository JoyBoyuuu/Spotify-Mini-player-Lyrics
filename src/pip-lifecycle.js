    // =========================================================
    // PiP Detection
    // =========================================================

    function cleanupPiP() {
        cleanupLyricsHoverReveal();
        pipWindow = null;
        pipDocument = null;
        lastRenderedPiPIndex = null;
    }

    function attachToPiP(win) {
        if (!win) {
            return;
        }

        if (pipWindow === win) {
            return;
        }

        pipWindow = win;
        pipDocument = win.document;

        console.log(
            "[MiniLyrics] Attached to Spotify Mini Player"
        );

        createPiPUI(
            pipDocument
        );

        if (lyricLines.length) {
            renderPiPLyrics(
                currentLineIndex
            );

            const currentTranslation =
                lyricLines[currentLineIndex]
                    ?.translation || "";

            if (currentTranslation) {
                console.log(
                    "[MiniLyrics] Current Traditional Chinese translation:",
                    currentTranslation
                );
            }
        } else {
            renderPiPStatus(
                displayStatus
            );
        }

        const onClose = () => {
            if (pipWindow === win) {
                console.log(
                    "[MiniLyrics] Mini Player closed"
                );

                cleanupPiP();
            }
        };

        win.addEventListener(
            "pagehide",
            onClose
        );

        win.addEventListener(
            "unload",
            onClose
        );
    }

    function checkPiP() {
        const api =
            window.documentPictureInPicture;

        if (!api) {
            return;
        }

        const win =
            api.window;

        if (
            win &&
            win !== pipWindow
        ) {
            attachToPiP(win);
        }

        if (
            !win &&
            pipWindow
        ) {
            cleanupPiP();
        }
    }

    function initPiPDetection() {
        const api =
            window.documentPictureInPicture;

        if (api) {
            api.addEventListener(
                "enter",
                event => {
                    if (event.window) {
                        attachToPiP(
                            event.window
                        );
                    }
                }
            );
        }

        pipPollTimer =
            setInterval(
                checkPiP,
                500
            );

        checkPiP();

        console.log(
            "[MiniLyrics] PiP detection ready"
        );
    }
