    function parseTimedLRC(raw) {
        const lines = [];

        String(raw || "")
            .split(/\r?\n/)
            .forEach(row => {
                const timestamps = [
                    ...row.matchAll(
                        /\[(\d{1,2}:\d{2}(?:[.:]\d{1,3})?)\]/g
                    )
                ];

                if (!timestamps.length) {
                    return;
                }

                const text =
                    row
                        .replace(/\[[^\]]+\]/g, "")
                        .trim();

                if (!text) {
                    return;
                }

                for (const match of timestamps) {
                    const parts =
                        match[1].match(
                            /^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/
                        );

                    if (!parts) {
                        continue;
                    }

                    const minutes =
                        Number(parts[1]);

                    const seconds =
                        Number(parts[2]);

                    const fraction =
                        String(parts[3] || "0")
                            .padEnd(3, "0")
                            .slice(0, 3);

                    lines.push({
                        timeMs:
                            minutes * 60000 +
                            seconds * 1000 +
                            Number(fraction),
                        text
                    });
                }
            });

        return lines.sort(
            (a, b) =>
                a.timeMs - b.timeMs
        );
    }


    /*
     * NetEase's newer lyric payload may store the real native-script lyric
     * only in `yrc` (word-by-word lyric) while `lrc` is empty or incomplete.
     *
     * Typical YRC line:
     * [16210,3460](16210,670,0)还(16880,410,0)没...
     *
     * We only need the line start time and reconstructed text because the
     * MiniLyrics renderer is line-synced, not word-synced.
     */
    function parseTimedYRC(raw) {
        const lines = [];
        const value = String(raw || "");

        for (const rowRaw of value.split(/\r?\n/)) {
            const row = rowRaw.trim();

            if (!row) {
                continue;
            }

            // New YRC payloads may include JSON metadata rows.
            if (
                row.startsWith("{") &&
                row.endsWith("}")
            ) {
                continue;
            }

            const match =
                row.match(
                    /^\[(\d+),(\d+)\](.*)$/
                );

            if (!match) {
                continue;
            }

            const timeMs =
                Number(match[1]);

            if (!Number.isFinite(timeMs)) {
                continue;
            }

            const text =
                String(match[3] || "")
                    .replace(
                        /\(\d+,\d+,\d+\)/g,
                        ""
                    )
                    .replace(/\u200b/g, "")
                    .trim();

            if (!text) {
                continue;
            }

            lines.push({
                timeMs,
                text
            });
        }

        /*
         * Some responses expose an LRC-like value under a YRC-named field.
         * Accept that shape as a fallback instead of treating it as empty.
         */
        if (!lines.length) {
            return parseTimedLRC(value);
        }

        return lines.sort(
            (a, b) =>
                a.timeMs - b.timeMs
        );
    }

    function parseBestTimedLyrics(raw) {
        const lrcLines =
            parseTimedLRC(raw);

        if (lrcLines.length) {
            return lrcLines;
        }

        return parseTimedYRC(raw);
    }

    function chooseNeteaseOriginalLines(data) {
        const lrcLines =
            parseTimedLRC(
                data?.lrc?.lyric || ""
            );

        const yrcLines =
            parseTimedYRC(
                data?.yrc?.lyric || ""
            );

        const lrcLanguage =
            detectLyricsLanguage(
                lrcLines
            );

        const yrcLanguage =
            detectLyricsLanguage(
                yrcLines
            );

        /*
         * Prefer YRC when it clearly exposes Korean/Japanese native script
         * that the ordinary LRC does not. This is exactly the case that made
         * v6 misclassify some romanized K-pop tracks as "unknown".
         */
        if (
            yrcLines.length &&
            (
                !lrcLines.length ||
                lrcLanguage === "unknown" ||
                (
                    (
                        yrcLanguage === "ko" ||
                        yrcLanguage === "ja"
                    ) &&
                    lrcLanguage !== yrcLanguage
                )
            )
        ) {
            return {
                lines: yrcLines,
                language: yrcLanguage,
                source: "yrc",
                lrcLines,
                yrcLines
            };
        }

        if (lrcLines.length) {
            return {
                lines: lrcLines,
                language: lrcLanguage,
                source: "lrc",
                lrcLines,
                yrcLines
            };
        }

        if (yrcLines.length) {
            return {
                lines: yrcLines,
                language: yrcLanguage,
                source: "yrc",
                lrcLines,
                yrcLines
            };
        }

        return {
            lines: [],
            language: "unknown",
            source: "none",
            lrcLines,
            yrcLines
        };
    }

