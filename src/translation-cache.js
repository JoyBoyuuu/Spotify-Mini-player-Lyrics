    function getTranslationCacheKey(track) {
        return (
            NETEASE_TRANSLATION_CACHE_PREFIX +
            encodeURIComponent(
                track?.uri ||
                `${track?.title || ""}|${track?.artist || ""}`
            )
        );
    }

    function readCachedTranslations(track) {
        try {
            const key =
                getTranslationCacheKey(
                    track
                );

            const raw =
                localStorage.getItem(
                    key
                );

            if (!raw) {
                return null;
            }

            const parsed =
                JSON.parse(raw);

            if (
                !Array.isArray(parsed) ||
                parsed.length !==
                    lyricLines.length ||
                !parsed.some(Boolean)
            ) {
                return null;
            }

            const language =
                detectLyricsLanguage(
                    lyricLines
                );

            const translatedCount =
                parsed.filter(
                    value =>
                        String(
                            value || ""
                        ).trim()
                ).length;

            const eligibleCount =
                lyricLines.filter(
                    line =>
                        lineNeedsChineseTranslation(
                            line.text,
                            language
                        )
                ).length;

            const minimumUseful =
                (
                    language === "es" ||
                    language === "other"
                )
                    ? Math.max(
                        3,
                        Math.ceil(
                            eligibleCount * 0.12
                        )
                    )
                    : 1;

            if (
                translatedCount <
                minimumUseful
            ) {
                console.log(
                    "[MiniLyrics] Ignoring sparse translation cache:",
                    {
                        language,
                        translatedCount,
                        eligibleCount,
                        minimumUseful
                    }
                );

                localStorage.removeItem(
                    key
                );

                return null;
            }

            console.log(
                "[MiniLyrics] Translation cache coverage:",
                {
                    language,
                    translatedCount,
                    eligibleCount
                }
            );

            return parsed;
        } catch {
            return null;
        }
    }

    function writeCachedTranslations(
        track,
        translations
    ) {
        if (!translations?.some(Boolean)) {
            return;
        }

        try {
            localStorage.setItem(
                getTranslationCacheKey(track),
                JSON.stringify(translations)
            );
        } catch {
            // Cache failure should never stop lyrics.
        }
    }

    function applyTranslationArray(translations) {
        if (!Array.isArray(translations)) {
            return false;
        }

        let changed = false;

        lyricLines.forEach(
            (line, index) => {
                const value =
                    String(
                        translations[index] || ""
                    ).trim();

                if (value) {
                    line.translation = value;
                    changed = true;
                }
            }
        );

        if (changed) {
            lastRenderedPiPIndex = null;
            renderPiPLyrics(
                currentLineIndex
            );

            /*
             * NetEase finishes asynchronously. Re-run once after the PiP
             * document has painted so translations also appear when the
             * current lyric index itself did not change.
             */
            if (pipWindow && pipDocument) {
                requestAnimationFrame(() => {
                    lastRenderedPiPIndex = null;
                    renderPiPLyrics(
                        currentLineIndex
                    );
                });
            }
        }

        return changed;
    }

