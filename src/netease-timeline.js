    function countLyricRows(raw, parser = parseBestTimedLyrics) {
        try {
            return parser(raw || "").length;
        } catch {
            return 0;
        }
    }

    function getLocalLineTolerance(
        lines,
        index,
        minMs = 520,
        maxMs = 1500
    ) {
        const current =
            lines?.[index];

        if (!current) {
            return maxMs;
        }

        const previous =
            lines[index - 1];

        const next =
            lines[index + 1];

        const gaps = [];

        if (previous) {
            gaps.push(
                Math.max(
                    0,
                    current.timeMs -
                    previous.timeMs
                )
            );
        }

        if (next) {
            gaps.push(
                Math.max(
                    0,
                    next.timeMs -
                    current.timeMs
                )
            );
        }

        const localGap =
            gaps.length
                ? Math.min(...gaps)
                : maxMs * 2;

        return Math.max(
            minMs,
            Math.min(
                maxMs,
                localGap * 0.46
            )
        );
    }

    function nearestLineIndexByTime(
        lines,
        timeMs
    ) {
        let bestIndex = -1;
        let bestDiff = Infinity;

        for (
            let i = 0;
            i < (lines || []).length;
            i++
        ) {
            const diff =
                Math.abs(
                    lines[i].timeMs -
                    timeMs
                );

            if (diff < bestDiff) {
                bestDiff = diff;
                bestIndex = i;
            }
        }

        return {
            index: bestIndex,
            diff: bestDiff
        };
    }

    function estimateTimelineOffset(
        referenceLines,
        movingLines
    ) {
        if (
            !referenceLines?.length ||
            !movingLines?.length
        ) {
            return 0;
        }

        const offsets = [];

        for (
            const moving of
            movingLines
        ) {
            const nearest =
                nearestLineIndexByTime(
                    referenceLines,
                    moving.timeMs
                );

            if (
                nearest.index >= 0 &&
                nearest.diff <= 2200
            ) {
                offsets.push(
                    moving.timeMs -
                    referenceLines[
                        nearest.index
                    ].timeMs
                );
            }
        }

        if (offsets.length < 3) {
            return 0;
        }

        const median =
            medianNumber(offsets);

        const inliers =
            offsets.filter(
                value =>
                    Math.abs(
                        value - median
                    ) <= 650
            );

        if (
            inliers.length <
            Math.max(
                3,
                Math.floor(
                    offsets.length * 0.35
                )
            )
        ) {
            return 0;
        }

        return Math.round(
            medianNumber(inliers)
        );
    }

    function mergeNeteaseTranslation(
        originalLines,
        translatedLines
    ) {
        if (
            !translatedLines.length
        ) {
            return [];
        }

        if (!originalLines.length) {
            return translatedLines.map(
                line => ({
                    timeMs:
                        line.timeMs,
                    text: "",
                    translation:
                        line.text
                })
            );
        }

        const offsetMs =
            estimateTimelineOffset(
                originalLines,
                translatedLines
            );

        const groups =
            originalLines.map(
                () => []
            );

        let assigned = 0;

        for (
            const translated of
            translatedLines
        ) {
            const correctedTime =
                translated.timeMs -
                offsetMs;

            const nearest =
                nearestLineIndexByTime(
                    originalLines,
                    correctedTime
                );

            if (nearest.index < 0) {
                continue;
            }

            const tolerance =
                getLocalLineTolerance(
                    originalLines,
                    nearest.index,
                    520,
                    NETEASE_TRANSLATION_TOLERANCE_MS
                );

            if (
                nearest.diff >
                tolerance
            ) {
                continue;
            }

            groups[
                nearest.index
            ].push(translated);

            assigned++;
        }

        let joined = 0;
        let originalsWithTranslation = 0;

        const merged =
            originalLines.map(
                (line, index) => {
                    const pieces = [];
                    const seen = new Set();

                    for (
                        const translated of
                        groups[index]
                    ) {
                        const value =
                            String(
                                translated?.text || ""
                            ).trim();

                        if (!value) {
                            continue;
                        }

                        const key =
                            normalizeText(value);

                        if (
                            !key ||
                            seen.has(key)
                        ) {
                            continue;
                        }

                        seen.add(key);
                        pieces.push(value);
                    }

                    if (pieces.length) {
                        originalsWithTranslation++;
                    }

                    if (pieces.length > 1) {
                        joined++;
                    }

                    return {
                        timeMs:
                            line.timeMs,
                        text:
                            line.text,
                        translation:
                            pieces.join(" ")
                    };
                }
            );

        console.log(
            "[MiniLyrics] NetEase original/translation pairing:",
            {
                offsetMs,
                original:
                    originalLines.length,
                translated:
                    translatedLines.length,
                assigned,
                originalsWithTranslation,
                joined
            }
        );

        return merged;
    }

