    function alignNeteaseToLrclib(
        neteaseLines,
        neteaseLanguage,
        frozenOffsetMs = null
    ) {
        const translations =
            lyricLines.map(() => "");

        const usable =
            (neteaseLines || [])
                .filter(
                    candidate =>
                        candidate?.translation
                )
                .sort(
                    (a, b) =>
                        a.timeMs -
                        b.timeMs
                );

        if (!usable.length) {
            return translations;
        }

        const offsetMs =
            Number.isFinite(
                frozenOffsetMs
            )
                ? frozenOffsetMs
                : estimateNeteaseTimeOffset(
                    usable.filter(
                        candidate =>
                            candidate?.text
                    )
                );

        const groups =
            assignNeteaseLinesToLrclib(
                usable,
                offsetMs
            );

        const rebalance =
            rebalanceMixedForeignGroups(
                groups,
                neteaseLanguage
            );

        let filled = 0;
        let rescuedByAssignment = 0;
        let protectedEnglish = 0;
        let joinedFragments = 0;

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

            const foreignCandidates =
                group.filter(
                    candidate =>
                        isNetEaseCandidateNativeForLanguage(
                            candidate.text,
                            neteaseLanguage
                        )
                );

            if (!foreignCandidates.length) {
                continue;
            }

            const obviousForeign =
                targetNeedsTranslation(
                    target.text,
                    neteaseLanguage
                );

            const englishMatch =
                getBestEnglishMatchScore(
                    target.text,
                    group
                );

            const assignmentRescue =
                shouldTreatTargetAsForeignByAssignment(
                    target,
                    group,
                    neteaseLanguage
                );

            if (
                !obviousForeign &&
                !assignmentRescue
            ) {
                if (englishMatch >= 0.62) {
                    protectedEnglish++;
                }

                continue;
            }

            /*
             * Only use translation attached to foreign/native NetEase source
             * fragments. A neighbouring English line can sit in the same time
             * region, but its Chinese translation must never be appended to a
             * Korean/Japanese target.
             */
            const pieces = [];
            const seen = new Set();

            for (
                const candidate of
                foreignCandidates
            ) {
                const value =
                    String(
                        candidate.translation || ""
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

            if (!pieces.length) {
                continue;
            }

            translations[i] =
                pieces.join(" ");

            filled++;

            if (
                !obviousForeign &&
                assignmentRescue
            ) {
                rescuedByAssignment++;
            }

            if (pieces.length > 1) {
                joinedFragments++;
            }
        }

        console.log(
            "[MiniLyrics] Translation exclusive assignment:",
            {
                offsetMs,
                total:
                    filled,
                lrclib:
                    lyricLines.length,
                netease:
                    usable.length,
                rescuedByAssignment,
                protectedEnglish,
                joinedFragments,
                movedFromPrevious:
                    rebalance.movedFromPrevious,
                movedFromNext:
                    rebalance.movedFromNext
            }
        );

        return translations;
    }

