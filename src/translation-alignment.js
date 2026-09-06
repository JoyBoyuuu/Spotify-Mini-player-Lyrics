    function getLrclibLineWindow(index) {
        const current =
            lyricLines[index];

        const previous =
            lyricLines[index - 1];

        const next =
            lyricLines[index + 1];

        const previousGap =
            previous
                ? Math.max(
                    0,
                    current.timeMs -
                    previous.timeMs
                )
                : 1600;

        const nextGap =
            next
                ? Math.max(
                    0,
                    next.timeMs -
                    current.timeMs
                )
                : 3200;

        /*
         * Use the LRCLIB line as a time interval, not a single timestamp.
         * This is important when NetEase splits one LRCLIB lyric into two
         * or three shorter native-script lines.
         */
        const start =
            current.timeMs -
            Math.min(
                650,
                previousGap * 0.25
            );

        const end =
            next
                ? next.timeMs -
                    Math.min(
                        180,
                        nextGap * 0.08
                    )
                : current.timeMs + 3600;

        return {
            start,
            end:
                Math.max(
                    start + 500,
                    end
                )
        };
    }

    function medianNumber(values) {
        const sorted =
            (values || [])
                .filter(
                    Number.isFinite
                )
                .sort(
                    (a, b) => a - b
                );

        if (!sorted.length) {
            return 0;
        }

        const middle =
            Math.floor(
                sorted.length / 2
            );

        if (
            sorted.length % 2
        ) {
            return sorted[middle];
        }

        return (
            sorted[middle - 1] +
            sorted[middle]
        ) / 2;
    }

    function estimateNeteaseTimeOffset(
        originalLines
    ) {
        const offsets = [];

        for (
            const target of
            lyricLines
        ) {
            const targetNative =
                hasNativeEastAsianScript(
                    target?.text
                );

            if (!targetNative) {
                continue;
            }

            let best = null;
            let bestTextScore = 0;

            for (
                const candidate of
                originalLines || []
            ) {
                if (
                    !hasNativeEastAsianScript(
                        candidate?.text
                    )
                ) {
                    continue;
                }

                const score =
                    textMatchScore(
                        target.text,
                        candidate.text
                    );

                if (
                    score > bestTextScore
                ) {
                    best = candidate;
                    bestTextScore = score;
                }
            }

            if (
                best &&
                bestTextScore >= 0.72
            ) {
                offsets.push(
                    best.timeMs -
                    target.timeMs
                );
            }
        }

        /*
         * A single lyric line can repeat in a chorus, so require at least two
         * anchors before trusting a global offset. Median is robust to one
         * repeated-line mismatch.
         */
        if (offsets.length < 2) {
            return 0;
        }

        const median =
            medianNumber(offsets);

        const inliers =
            offsets.filter(
                value =>
                    Math.abs(
                        value - median
                    ) <= 900
            );

        return (
            inliers.length >= 2
                ? Math.round(
                    medianNumber(inliers)
                )
                : 0
        );
    }

    function candidateSupportsTarget(
        candidateText,
        targetText,
        neteaseLanguage
    ) {
        const candidate =
            String(
                candidateText || ""
            ).trim();

        const target =
            String(
                targetText || ""
            ).trim();

        if (
            !candidate ||
            !target
        ) {
            return false;
        }

        if (
            neteaseLanguage === "ko"
        ) {
            /*
             * Critical precision gate: a Korean/romanized target must not
             * borrow the Chinese translation attached to a neighbouring
             * pure-English NetEase line. This was the source of occasional
             * one-line shifts in v10.1.
             */
            return (
                hasHangul(candidate) ||
                looksLikeKoreanRomanizationLine(
                    candidate
                )
            );
        }

        if (
            neteaseLanguage === "ja"
        ) {
            return (
                hasKana(candidate) ||
                hasHan(candidate) ||
                !looksPlainEnglishLine(
                    candidate
                )
            );
        }

        if (
            neteaseLanguage === "romanized"
        ) {
            return (
                looksLikeKoreanRomanizationLine(
                    candidate
                ) ||
                !looksPlainEnglishLine(
                    candidate
                )
            );
        }

        if (
            neteaseLanguage === "es"
        ) {
            return (
                looksLikeSpanishLine(
                    candidate
                ) ||
                !looksLikeStrongEnglishLine(
                    candidate
                )
            );
        }

        if (
            neteaseLanguage === "other"
        ) {
            return !looksLikeStrongEnglishLine(
                candidate
            );
        }

        return true;
    }

    function getNeteaseWindowForLrclib(
        index,
        offsetMs
    ) {
        const window =
            getLrclibLineWindow(index);

        return {
            start:
                window.start +
                offsetMs,
            end:
                window.end +
                offsetMs
        };
    }

    function getNearestLrclibIndex(
        candidateTimeMs,
        offsetMs = 0
    ) {
        if (!lyricLines.length) {
            return {
                index: -1,
                diff: Infinity
            };
        }

        let bestIndex = -1;
        let bestDiff = Infinity;

        for (
            let i = 0;
            i < lyricLines.length;
            i++
        ) {
            const expected =
                lyricLines[i].timeMs +
                offsetMs;

            const diff =
                Math.abs(
                    candidateTimeMs -
                    expected
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

    function getAdaptiveAssignmentTolerance(
        index
    ) {
        const current =
            lyricLines[index];

        if (!current) {
            return 1400;
        }

        const previous =
            lyricLines[index - 1];

        const next =
            lyricLines[index + 1];

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
                : 2800;

        /*
         * Close lyric lines need a tighter gate; sparse lyric regions may
         * safely use a wider tolerance. Clamp to avoid absurd matches.
         */
        return Math.max(
            650,
            Math.min(
                1650,
                localGap * 0.48
            )
        );
    }

    function assignNeteaseLinesToLrclib(
        candidates,
        offsetMs = 0
    ) {
        const groups =
            lyricLines.map(
                () => []
            );

        for (
            const candidate of
            candidates || []
        ) {
            if (
                !candidate ||
                !Number.isFinite(
                    candidate.timeMs
                )
            ) {
                continue;
            }

            const nearest =
                getNearestLrclibIndex(
                    candidate.timeMs,
                    offsetMs
                );

            if (
                nearest.index < 0
            ) {
                continue;
            }

            const tolerance =
                getAdaptiveAssignmentTolerance(
                    nearest.index
                );

            if (
                nearest.diff >
                tolerance
            ) {
                continue;
            }

            groups[
                nearest.index
            ].push({
                ...candidate,
                __assignmentDiff:
                    nearest.diff
            });
        }

        for (const group of groups) {
            group.sort(
                (a, b) =>
                    a.timeMs -
                    b.timeMs
            );
        }

        return groups;
    }

    function isNetEaseCandidateNativeForLanguage(
        text,
        neteaseLanguage
    ) {
        const value =
            String(
                text || ""
            ).trim();

        if (!value) {
            return false;
        }

        if (
            neteaseLanguage === "ko"
        ) {
            return (
                hasHangul(value) ||
                looksLikeKoreanRomanizationLine(
                    value
                )
            );
        }

        if (
            neteaseLanguage === "ja"
        ) {
            return (
                hasKana(value) ||
                hasHan(value)
            );
        }

        if (
            neteaseLanguage === "romanized"
        ) {
            return (
                looksLikeKoreanRomanizationLine(
                    value
                )
            );
        }

        if (
            neteaseLanguage === "es"
        ) {
            return (
                looksLikeSpanishLine(
                    value
                ) ||
                !looksLikeStrongEnglishLine(
                    value
                )
            );
        }

        if (
            neteaseLanguage === "other"
        ) {
            return !looksLikeStrongEnglishLine(
                value
            );
        }

        return false;
    }

    function getBestEnglishMatchScore(
        targetText,
        candidates
    ) {
        let best = 0;

        for (
            const candidate of
            candidates || []
        ) {
            const text =
                String(
                    candidate?.text || ""
                ).trim();

            if (
                !text ||
                !looksPlainEnglishLine(
                    text
                )
            ) {
                continue;
            }

            best =
                Math.max(
                    best,
                    textMatchScore(
                        targetText,
                        text
                    )
                );
        }

        return best;
    }

    function shouldTreatTargetAsForeignByAssignment(
        target,
        group,
        neteaseLanguage
    ) {
        const targetText =
            String(
                target?.text || ""
            ).trim();

        if (!targetText) {
            return false;
        }

        if (
            hasHangul(targetText) ||
            hasKana(targetText)
        ) {
            return true;
        }

        if (
            neteaseLanguage === "ko" &&
            looksLikeKoreanRomanizationLine(
                targetText
            )
        ) {
            return true;
        }

        if (
            neteaseLanguage === "ja" &&
            (
                hasHan(targetText) ||
                !looksPlainEnglishLine(
                    targetText
                )
            )
        ) {
            return true;
        }

        if (
            neteaseLanguage === "es"
        ) {
            return (
                looksLikeSpanishLine(
                    targetText
                ) ||
                !looksLikeStrongEnglishLine(
                    targetText
                )
            );
        }

        if (
            neteaseLanguage === "other"
        ) {
            return !looksLikeStrongEnglishLine(
                targetText
            );
        }

        const foreignCandidates =
            (group || []).filter(
                candidate =>
                    isNetEaseCandidateNativeForLanguage(
                        candidate.text,
                        neteaseLanguage
                    )
            );

        if (!foreignCandidates.length) {
            return false;
        }

        /*
         * If NetEase has a strong literal English match for this LRCLIB line,
         * then this is genuinely an English segment. Do not let a neighbouring
         * Korean/Japanese candidate force translation onto it.
         */
        const englishMatch =
            getBestEnglishMatchScore(
                targetText,
                group
            );

        if (englishMatch >= 0.62) {
            return false;
        }

        /*
         * Rescue romanization lines the text classifier misses:
         * a very close native-script NetEase line is strong evidence that the
         * LRCLIB Latin text is a romanized foreign lyric rather than English.
         */
        const closestForeignDiff =
            Math.min(
                ...foreignCandidates.map(
                    candidate =>
                        candidate.__assignmentDiff ??
                        Infinity
                )
            );

        return (
            isMostlyLatinText(
                targetText
            ) &&
            closestForeignDiff <= 900
        );
    }

    function candidateIsPlainEnglish(
        candidate
    ) {
        return Boolean(
            candidate?.text &&
            looksPlainEnglishLine(
                candidate.text
            )
        );
    }

    function targetCandidateContainmentScore(
        targetText,
        candidateText
    ) {
        const target =
            normalizeText(
                targetText
            );

        const candidate =
            normalizeText(
                candidateText
            );

        if (
            !target ||
            !candidate
        ) {
            return 0;
        }

        if (
            target.includes(candidate) ||
            candidate.includes(target)
        ) {
            return (
                Math.min(
                    target.length,
                    candidate.length
                ) /
                Math.max(
                    target.length,
                    candidate.length
                )
            );
        }

        const targetWords =
            new Set(
                target
                    .split(/\s+/)
                    .filter(Boolean)
            );

        const candidateWords =
            candidate
                .split(/\s+/)
                .filter(Boolean);

        if (!candidateWords.length) {
            return 0;
        }

        const overlap =
            candidateWords.filter(
                word =>
                    targetWords.has(word)
            ).length;

        return (
            overlap /
            candidateWords.length
        );
    }

    function groupHasStrongEnglishAnchor(
        targetText,
        group
    ) {
        return (
            (group || []).some(
                candidate =>
                    candidateIsPlainEnglish(
                        candidate
                    ) &&
                    targetCandidateContainmentScore(
                        targetText,
                        candidate.text
                    ) >= 0.55
            )
        );
    }

    function rebalanceMixedForeignGroups(
        groups,
        neteaseLanguage
    ) {
        if (
            neteaseLanguage !== "ko" &&
            neteaseLanguage !== "ja"
        ) {
            return {
                movedFromPrevious: 0,
                movedFromNext: 0
            };
        }

        let movedFromPrevious = 0;
        let movedFromNext = 0;

        for (
            let i = 0;
            i < lyricLines.length;
            i++
        ) {
            const target =
                lyricLines[i];

            const targetText =
                String(
                    target?.text || ""
                ).trim();

            if (
                !targetText ||
                !isMostlyLatinText(
                    targetText
                )
            ) {
                continue;
            }

            const looksRomanized =
                neteaseLanguage === "ko"
                    ? looksLikeKoreanRomanizationLine(
                        targetText
                    )
                    : true;

            if (!looksRomanized) {
                continue;
            }

            const current =
                groups[i] || [];

            if (
                !groupHasStrongEnglishAnchor(
                    targetText,
                    current
                )
            ) {
                continue;
            }

            const currentForeign =
                current.filter(
                    candidate =>
                        isNetEaseCandidateNativeForLanguage(
                            candidate.text,
                            neteaseLanguage
                        )
                );

            if (currentForeign.length) {
                continue;
            }

            const currentEnglish =
                current
                    .filter(
                        candidateIsPlainEnglish
                    )
                    .sort(
                        (a, b) =>
                            a.timeMs -
                            b.timeMs
                    );

            if (!currentEnglish.length) {
                continue;
            }

            const anchorTime =
                currentEnglish[0]
                    .timeMs;

            /*
             * Most mixed K-pop/J-pop lines put the foreign fragment before
             * the English fragment. Prefer moving the last extra foreign
             * fragment from the previous group.
             */
            const previous =
                groups[i - 1];

            if (previous?.length) {
                const foreignIndices = [];

                previous.forEach(
                    (candidate, index) => {
                        if (
                            isNetEaseCandidateNativeForLanguage(
                                candidate.text,
                                neteaseLanguage
                            )
                        ) {
                            foreignIndices.push(
                                index
                            );
                        }
                    }
                );

                if (
                    foreignIndices.length >= 2
                ) {
                    const moveIndex =
                        foreignIndices[
                            foreignIndices.length - 1
                        ];

                    const candidate =
                        previous[
                            moveIndex
                        ];

                    if (
                        Math.abs(
                            anchorTime -
                            candidate.timeMs
                        ) <= 1900
                    ) {
                        previous.splice(
                            moveIndex,
                            1
                        );

                        current.unshift(
                            candidate
                        );

                        movedFromPrevious++;
                        continue;
                    }
                }
            }

            /*
             * Less common reverse ordering: English first, foreign fragment
             * immediately after. Pull the first extra native fragment from the
             * next group when it is very close.
             */
            const next =
                groups[i + 1];

            if (next?.length) {
                const foreignIndices = [];

                next.forEach(
                    (candidate, index) => {
                        if (
                            isNetEaseCandidateNativeForLanguage(
                                candidate.text,
                                neteaseLanguage
                            )
                        ) {
                            foreignIndices.push(
                                index
                            );
                        }
                    }
                );

                if (
                    foreignIndices.length >= 2
                ) {
                    const moveIndex =
                        foreignIndices[0];

                    const candidate =
                        next[
                            moveIndex
                        ];

                    if (
                        Math.abs(
                            candidate.timeMs -
                            anchorTime
                        ) <= 1900
                    ) {
                        next.splice(
                            moveIndex,
                            1
                        );

                        current.push(
                            candidate
                        );

                        movedFromNext++;
                    }
                }
            }
        }

        for (const group of groups) {
            group.sort(
                (a, b) =>
                    a.timeMs -
                    b.timeMs
            );
        }

        return {
            movedFromPrevious,
            movedFromNext
        };
    }

    function replaceRomanizedLinesWithNeteaseOriginal(
        originalLines,
        neteaseLanguage,
        frozenOffsetMs = null
    ) {
        if (!originalLines?.length) {
            return 0;
        }

        if (
            neteaseLanguage !== "ko" &&
            neteaseLanguage !== "ja"
        ) {
            return 0;
        }

        const offsetMs =
            Number.isFinite(
                frozenOffsetMs
            )
                ? frozenOffsetMs
                : estimateNeteaseTimeOffset(
                    originalLines
                );

        const groups =
            assignNeteaseLinesToLrclib(
                originalLines,
                offsetMs
            );

        const rebalance =
            rebalanceMixedForeignGroups(
                groups,
                neteaseLanguage
            );

        let replaced = 0;
        let rescuedByAssignment = 0;
        let mixedRebuilt = 0;

        for (
            let i = 0;
            i < lyricLines.length;
            i++
        ) {
            const target =
                lyricLines[i];

            const group =
                groups[i] || [];

            if (!group.length) {
                continue;
            }

            const nativeCandidates =
                group.filter(
                    candidate =>
                        isNetEaseCandidateNativeForLanguage(
                            candidate.text,
                            neteaseLanguage
                        )
                );

            if (!nativeCandidates.length) {
                continue;
            }

            const obviousRomanization =
                neteaseLanguage === "ko"
                    ? looksLikeKoreanRomanizationLine(
                        target.text
                    )
                    : isMostlyLatinText(
                        target.text
                    );

            const assignmentRescue =
                shouldTreatTargetAsForeignByAssignment(
                    target,
                    group,
                    neteaseLanguage
                );

            if (
                !obviousRomanization &&
                !assignmentRescue
            ) {
                continue;
            }

            /*
             * Rebuild from every assigned NetEase original fragment, not only
             * the native-script fragments. This preserves an English fragment
             * in a mixed lyric while replacing the romanized foreign fragment.
             *
             * Example conceptually:
             * LRCLIB: "Got me feeling you, Neodo malhaejullae?"
             * NetEase fragments: "Got me feeling you" + "너도 말해줄래"
             * Result: "Got me feeling you 너도 말해줄래"
             */
            const rebuilt =
                joinUniqueLyricTexts(
                    group
                );

            if (!rebuilt) {
                continue;
            }

            const originalTargetText =
                target.text;

            target.romanizedText =
                originalTargetText;

            target.text =
                rebuilt;

            replaced++;

            if (
                !obviousRomanization &&
                assignmentRescue
            ) {
                rescuedByAssignment++;
            }

            if (
                group.some(
                    candidate =>
                        looksPlainEnglishLine(
                            candidate.text
                        )
                ) &&
                nativeCandidates.length
            ) {
                mixedRebuilt++;
            }
        }

        console.log(
            "[MiniLyrics] Native-script assignment alignment:",
            {
                offsetMs,
                replaced,
                rescuedByAssignment,
                mixedRebuilt,
                movedFromPrevious:
                    rebalance.movedFromPrevious,
                movedFromNext:
                    rebalance.movedFromNext
            }
        );

        if (replaced) {
            lastRenderedPiPIndex =
                null;

            renderPiPLyrics(
                currentLineIndex
            );
        }

        return replaced;
    }

