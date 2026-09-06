    async function resolveNeteaseSongWithLyrics(track) {
        const excluded =
            new Set();

        let bestPartial = null;

        for (
            let attempt = 1;
            attempt <= 6;
            attempt++
        ) {
            const song =
                await searchNeteaseTrack(
                    track,
                    excluded
                );

            if (!song?.id) {
                break;
            }

            try {
                const data =
                    await fetchNeteaseLyrics(
                        song.id
                    );

                const inspected =
                    inspectNeteaseLyricPayload(
                        data
                    );

                const originalCount =
                    Math.max(
                        inspected.lrcLines.length,
                        inspected.yrcLines.length
                    );

                const translatedCount =
                    inspected.translatedLines.length;

                const translationCoverage =
                    translatedCount /
                    Math.max(
                        1,
                        originalCount
                    );

                const countFit =
                    originalCount
                        ? Math.min(
                            originalCount,
                            lyricLines.length
                        ) /
                        Math.max(
                            originalCount,
                            lyricLines.length
                        )
                        : 0;

                const metadata =
                    scoreNeteaseSong(
                        track,
                        song
                    );

                const candidateOriginalLines =
                    inspected.yrcLines.length
                        ? inspected.yrcLines
                        : inspected.lrcLines;

                const candidateLanguage =
                    detectLyricsLanguage(
                        candidateOriginalLines
                    );

                const lrclibLanguage =
                    detectLyricsLanguage(
                        lyricLines
                    );

                const lrclibLooksRomanizedKorean =
                    looksLikeRomanizedKoreanTrack(
                        lyricLines
                    );

                let languageBonus = 0;

                if (
                    lrclibLooksRomanizedKorean &&
                    candidateLanguage === "ko"
                ) {
                    languageBonus += 18;
                } else if (
                    lrclibLooksRomanizedKorean &&
                    candidateLanguage === "en"
                ) {
                    languageBonus -= 24;
                }

                if (
                    lrclibLanguage === "ko" &&
                    candidateLanguage === "ko"
                ) {
                    languageBonus += 10;
                } else if (
                    lrclibLanguage === "ko" &&
                    candidateLanguage === "en"
                ) {
                    languageBonus -= 18;
                }

                if (
                    lrclibLanguage === "ja" &&
                    candidateLanguage === "ja"
                ) {
                    languageBonus += 10;
                } else if (
                    lrclibLanguage === "ja" &&
                    candidateLanguage === "en"
                ) {
                    languageBonus -= 18;
                }

                const quality =
                    metadata.total +
                    translationCoverage * 24 +
                    countFit * 6 +
                    languageBonus;

                const candidate = {
                    song,
                    data,
                    inspected,
                    quality,
                    translationCoverage,
                    originalCount,
                    translatedCount,
                    candidateLanguage,
                    languageBonus
                };

                console.log(
                    "[MiniLyrics] NetEase candidate lyric quality:",
                    song?.name,
                    {
                        metadata:
                            metadata.total,
                        originalCount,
                        translatedCount,
                        translationCoverage:
                            Number(
                                translationCoverage.toFixed(3)
                            ),
                        candidateLanguage,
                        languageBonus,
                        quality:
                            Number(
                                quality.toFixed(2)
                            )
                    }
                );

                if (
                    !bestPartial ||
                    candidate.quality >
                        bestPartial.quality
                ) {
                    bestPartial = candidate;
                }

                const enoughTranslation =
                    translatedCount >=
                        Math.max(
                            8,
                            Math.round(
                                lyricLines.length * 0.45
                            )
                        ) ||
                    translationCoverage >= 0.45;

                const languageCompatible =
                    !(
                        looksLikeRomanizedKoreanTrack(
                            lyricLines
                        ) &&
                        candidateLanguage === "en"
                    );

                if (
                    enoughTranslation &&
                    languageCompatible
                ) {
                    writeCachedNeteaseSong(
                        track,
                        song
                    );

                    return {
                        song,
                        data
                    };
                }

                excluded.add(
                    String(song.id)
                );

                invalidateCachedNeteaseSong(
                    track
                );

                console.log(
                    `[MiniLyrics] NetEase candidate has sparse translated lyrics (${translatedCount}/${originalCount}); trying another safe version`
                );

            } catch (error) {
                excluded.add(
                    String(song.id)
                );

                invalidateCachedNeteaseSong(
                    track
                );

                console.warn(
                    `[MiniLyrics] NetEase candidate ${song?.name || song.id} has unusable lyrics; trying another safe match:`,
                    error?.message || error
                );
            }
        }

        if (bestPartial) {
            writeCachedNeteaseSong(
                track,
                bestPartial.song
            );

            console.log(
                "[MiniLyrics] Using best partial NetEase translation source:",
                bestPartial.song?.name,
                {
                    translated:
                        bestPartial.translatedCount,
                    original:
                        bestPartial.originalCount,
                    coverage:
                        Number(
                            bestPartial.translationCoverage.toFixed(3)
                        )
                }
            );

            return {
                song:
                    bestPartial.song,
                data:
                    bestPartial.data
            };
        }

        return null;
    }

    async function loadNeteaseTranslation(
        track,
        parentRequestId
    ) {
        if (
            !shouldProbeNeteaseTranslation(
                lyricLines
            )
        ) {
            return;
        }

        const lrclibLanguage =
            detectLyricsLanguage(
                lyricLines
            );

        const cached =
            readCachedTranslations(
                track
            );

        if (cached) {
            console.log(
                "[MiniLyrics] NetEase translation cache hit"
            );

            applyTranslationArray(
                cached
            );

            return;
        }

        console.log(
            "[MiniLyrics] Probing NetEase with per-line mixed-language handling"
        );

        if (!getNeteaseProxyUrl()) {
            console.log(
                "[MiniLyrics] NetEase translation skipped: proxy not configured"
            );
            return;
        }

        const myTranslationRequest =
            ++translationRequestId;

        try {
            const resolved =
                await resolveNeteaseSongWithLyrics(
                    track
                );

            if (
                parentRequestId !== requestId ||
                myTranslationRequest !==
                    translationRequestId
            ) {
                return;
            }

            if (!resolved?.song?.id) {
                return;
            }

            const song =
                resolved.song;

            const data =
                resolved.data;

            if (
                parentRequestId !== requestId ||
                myTranslationRequest !==
                    translationRequestId
            ) {
                return;
            }

            const originalInfo =
                chooseNeteaseOriginalLines(
                    data
                );

            let originalLines =
                originalInfo.lines;

            let neteaseOriginalLanguage =
                originalInfo.language;

            let neteaseOriginalSource =
                originalInfo.source;

            const translatedLines =
                parseBestTimedLyrics(
                    data?.ytlrc?.lyric ||
                    data?.tlyric?.lyric ||
                    ""
                );

            const romanizedLines =
                parseBestTimedLyrics(
                    data?.yromalrc?.lyric ||
                    data?.romalrc?.lyric ||
                    ""
                );

            console.log(
                "[MiniLyrics] NetEase lyric fields:",
                {
                    lrc:
                        originalInfo.lrcLines.length,
                    yrc:
                        originalInfo.yrcLines.length,
                    translated:
                        translatedLines.length,
                    romanized:
                        romanizedLines.length
                }
            );

            /*
             * If NetEase has no usable original line track, do NOT treat
             * "unknown" as proof that the song is English. v6 did that and
             * incorrectly skipped tracks whose native lyric lived only in YRC.
             *
             * For an LRCLIB track that is already visibly Korean/Japanese/
             * Spanish/other, LRCLIB itself is a safe original-time fallback.
             */
            if (
                neteaseOriginalLanguage === "unknown" &&
                (
                    lrclibLanguage === "ko" ||
                    lrclibLanguage === "ja" ||
                    lrclibLanguage === "es" ||
                    lrclibLanguage === "other"
                )
            ) {
                originalLines =
                    lyricLines.map(
                        line => ({
                            timeMs:
                                line.timeMs,
                            text:
                                line.text
                        })
                    );

                neteaseOriginalLanguage =
                    lrclibLanguage;

                neteaseOriginalSource =
                    "lrclib-fallback";
            }

            /*
             * A romanization field is explicit evidence that NetEase knows a
             * non-native-script reading for the song. If the native original
             * is missing but LRCLIB looks Latin, use that romanization track
             * for timestamp alignment instead of declaring the song English.
             */
            if (
                neteaseOriginalLanguage === "unknown" &&
                romanizedLines.length &&
                translatedLines.length
            ) {
                originalLines =
                    romanizedLines;

                neteaseOriginalLanguage =
                    "romanized";

                neteaseOriginalSource =
                    "romalrc";
            }

            if (
                neteaseOriginalLanguage === "unknown" &&
                translatedLines.length &&
                looksLikeRomanizedKoreanTrack(
                    lyricLines
                )
            ) {
                originalLines =
                    lyricLines.map(
                        line => ({
                            timeMs:
                                line.timeMs,
                            text:
                                line.text
                        })
                    );

                neteaseOriginalLanguage =
                    "romanized";

                neteaseOriginalSource =
                    "lrclib-romanized-evidence";

                console.log(
                    "[MiniLyrics] LRCLIB contains strong Korean romanization evidence; aligning timed NetEase translation directly"
                );
            }

            console.log(
                "[MiniLyrics] NetEase original lyric source:",
                neteaseOriginalSource
            );

            console.log(
                "[MiniLyrics] NetEase original lyric language:",
                neteaseOriginalLanguage
            );

            /*
             * If LRCLIB looked English but NetEase's real lyric contains
             * Korean/Japanese script, this is a romanized or mixed-language
             * song. Use NetEase native-script lyrics where timestamps line up.
             */
            const frozenLrclibNeteaseOffsetMs =
                estimateNeteaseTimeOffset(
                    originalLines
                );

            console.log(
                "[MiniLyrics] Frozen LRCLIB↔NetEase offset:",
                frozenLrclibNeteaseOffsetMs
            );

            if (
                neteaseOriginalLanguage === "ko" ||
                neteaseOriginalLanguage === "ja"
            ) {
                replaceRomanizedLinesWithNeteaseOriginal(
                    originalLines,
                    neteaseOriginalLanguage,
                    frozenLrclibNeteaseOffsetMs
                );
            }

            if (
                neteaseOriginalLanguage === "en"
            ) {
                console.log(
                    "[MiniLyrics] NetEase confirms English lyrics; Chinese translation skipped"
                );
                return;
            }

            if (
                neteaseOriginalLanguage === "unknown"
            ) {
                console.log(
                    "[MiniLyrics] NetEase original lyric is unavailable; skipped to avoid translating a true English song"
                );
                return;
            }

            if (!translatedLines.length) {
                console.log(
                    "[MiniLyrics] NetEase matched the track but has no translated lyrics"
                );
                return;
            }

            const neteaseLines =
                mergeNeteaseTranslation(
                    originalLines,
                    translatedLines
                );

            let translations =
                alignNeteaseToLrclib(
                    neteaseLines,
                    neteaseOriginalLanguage,
                    frozenLrclibNeteaseOffsetMs
                );

            if (!translations.some(Boolean)) {
                console.log(
                    "[MiniLyrics] NetEase translation exists but could not be aligned safely"
                );
                return;
            }

            translations =
                await convertTranslationsToTraditional(
                    translations
                );

            if (
                parentRequestId !== requestId ||
                myTranslationRequest !==
                    translationRequestId
            ) {
                return;
            }

            writeCachedTranslations(
                track,
                translations
            );

            applyTranslationArray(
                translations
            );

            console.log(
                `[MiniLyrics] Added Traditional Chinese translations to ${translations.filter(Boolean).length}/${translations.length} lines (mixed-language per-line mode)`
            );

            if (
                neteaseOriginalLanguage === "es"
            ) {
                const eligibleSpanish =
                    lyricLines.filter(
                        line =>
                            lineNeedsChineseTranslation(
                                line.text,
                                "es"
                            )
                    ).length;

                console.log(
                    "[MiniLyrics] Spanish translation coverage:",
                    {
                        added:
                            translations.filter(
                                Boolean
                            ).length,
                        eligible:
                            eligibleSpanish,
                        total:
                            lyricLines.length
                    }
                );
            }
        } catch (error) {
            console.warn(
                "[MiniLyrics] NetEase translation unavailable:",
                error
            );
        }
    }

