    function detectLyricsLanguage(lines) {
        const text =
            lines
                .map(line => line.text || "")
                .join(" ")
                .normalize("NFKC");

        if (!text.trim()) {
            return "unknown";
        }

        if (/[\uac00-\ud7af]/.test(text)) {
            return "ko";
        }

        if (/[\u3040-\u30ff]/.test(text)) {
            return "ja";
        }

        const hanCount =
            (text.match(/[\u3400-\u9fff]/g) || [])
                .length;

        const latinCount =
            (text.match(/[A-Za-zÀ-ÿ]/g) || [])
                .length;

        if (
            hanCount >= 8 &&
            hanCount > latinCount * 0.45
        ) {
            return "zh";
        }

        const words =
            text
                .toLowerCase()
                .replace(/[^a-zà-ÿ'’]+/g, " ")
                .split(/\s+/)
                .filter(Boolean);

        if (!words.length) {
            return "other";
        }

        const englishWords =
            new Set([
                "the", "and", "you", "i", "to", "a", "of", "in",
                "my", "me", "your", "is", "it", "for", "on", "that",
                "we", "be", "with", "this", "love", "know", "want",
                "just", "but", "don't", "dont", "i'm", "im", "not",
                "can", "can't", "cant", "all", "so", "when", "what",
                "like", "feel", "never", "let", "go", "baby", "yeah"
            ]);

        const spanishWords =
            new Set([
                "el", "la", "los", "las", "de", "que", "y", "en",
                "un", "una", "por", "para", "con", "no", "me", "te",
                "mi", "tu", "es", "soy", "eres", "quiero", "como",
                "pero", "si", "se", "lo", "le", "del", "al", "porque",
                "cuando", "más", "mas", "ya", "yo", "tú", "esta",
                "está", "todo", "nada", "amor", "quieres", "quiero"
            ]);

        let englishScore = 0;
        let spanishScore = 0;

        for (const word of words) {
            if (englishWords.has(word)) {
                englishScore++;
            }

            if (spanishWords.has(word)) {
                spanishScore++;
            }
        }

        if (/[áéíóúñü¿¡]/i.test(text)) {
            spanishScore += 5;
        }

        if (
            englishScore >= 4 &&
            englishScore >=
                spanishScore * 1.2
        ) {
            return "en";
        }

        if (
            spanishScore >= 3 &&
            spanishScore > englishScore
        ) {
            return "es";
        }

        return "other";
    }

    function shouldProbeNeteaseTranslation(lines) {
        const language =
            detectLyricsLanguage(lines);

        console.log(
            "[MiniLyrics] Detected LRCLIB lyric language:",
            language
        );

        return lines.some(line => lineNeedsChineseTranslation(line.text, language));
    }

    function hasHangul(text) {
        return /[\uac00-\ud7af]/.test(
            String(text || "")
        );
    }

    function hasKana(text) {
        return /[\u3040-\u30ff]/.test(
            String(text || "")
        );
    }

    function isMostlyLatinText(text) {
        const value =
            String(text || "")
                .normalize("NFKC");

        const latin =
            (value.match(/[A-Za-zÀ-ÿ]/g) || [])
                .length;

        const nonLatinLetters =
            (
                value.match(
                    /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g
                ) || []
            ).length;

        return (
            latin >= 3 &&
            latin >
                nonLatinLetters * 2
        );
    }

    function hasNativeEastAsianScript(text) {
        return (
            hasHangul(text) ||
            hasKana(text)
        );
    }

    function looksLikeKoreanRomanizationLine(text) {
        const value =
            String(text || "")
                .normalize("NFKC")
                .toLowerCase()
                .replace(/[^a-z' -]+/g, " ")
                .trim();

        if (
            !value ||
            !isMostlyLatinText(value)
        ) {
            return false;
        }

        const words =
            value
                .split(/\s+/)
                .filter(Boolean);

        if (!words.length) {
            return false;
        }

        /*
         * Precision-first Korean romanization detector.
         *
         * This is deliberately language-level rather than song-level:
         * it scores Revised-Romanization-like vowel clusters, consonant
         * patterns, particles and endings. A mixed English/Korean line can
         * therefore be detected even when most characters are Latin.
         */
        const rareClusters = [
            /eo/,
            /eu/,
            /ui/,
            /yeo/,
            /wae/,
            /gye/,
            /ryeo/,
            /myeo/,
            /deu/,
            /tteu/,
            /kk/,
            /tt/,
            /pp/,
            /jj/
        ];

        const commonEndings = [
            /eun$/,
            /neun$/,
            /eul$/,
            /reul$/,
            /eseo$/,
            /euro$/,
            /ro$/,
            /deon$/,
            /myeon$/,
            /geoya$/,
            /goya$/,
            /jullae$/,
            /hae$/,
            /haeyo$/,
            /hada$/,
            /haneun$/,
            /cheoreom$/,
            /boda$/,
            /gama$/,
            /gayo$/,
            /jiman$/,
            /ji$/,
            /kka$/,
            /kkae$/
        ];

        const grammarWords =
            new Set([
                "na", "nae", "nan",
                "neo", "neon", "neodo",
                "naneun", "neoneun",
                "uri", "uril",
                "nuga", "naega", "naege",
                "niga", "nege",
                "nal", "geon",
                "tto", "deo",
                "han", "beon",
                "bwa", "jigeum",
                "sarang", "eolmana",
                "deudieo", "deureobwa",
                "nuneul", "gama",
                "saebyeok", "saenggak",
                "saenggage", "allyeojul",
                "mweo", "mwo"
            ]);

        let score = 0;
        let strongWords = 0;

        for (const word of words) {
            let wordScore = 0;

            const clusterHits =
                rareClusters.filter(
                    pattern =>
                        pattern.test(word)
                ).length;

            if (clusterHits >= 2) {
                wordScore += 2;
            } else if (clusterHits === 1) {
                wordScore += 1;
            }

            if (
                commonEndings.some(
                    pattern =>
                        pattern.test(word)
                )
            ) {
                wordScore += 1.5;
            }

            if (grammarWords.has(word)) {
                wordScore += 1.5;
            }

            /*
             * Long tokens with several RR-like syllables are strong evidence
             * even when embedded in an otherwise English line, e.g.
             * "Euiminhadae" or "Namdeulgwaneun".
             */
            if (
                word.length >= 8 &&
                (
                    clusterHits >= 1 ||
                    /(hada|deul|gwan|saeng|myeon|jull|rye|tteu)/.test(
                        word
                    )
                )
            ) {
                wordScore += 1.5;
            }

            if (wordScore >= 2) {
                strongWords++;
            }

            score += wordScore;
        }

        /*
         * Require either two Korean-looking tokens or one very strong token.
         * This keeps ordinary English lines such as "Maybe you could be the
         * one" from being treated as Korean.
         */
        return (
            strongWords >= 2 ||
            score >= 4 ||
            (
                strongWords >= 1 &&
                score >= 3
            )
        );
    }

    function looksLikeRomanizedKoreanTrack(lines) {
        let strongLines = 0;

        for (const line of lines || []) {
            if (
                looksLikeKoreanRomanizationLine(
                    line?.text
                )
            ) {
                strongLines++;

                if (strongLines >= 2) {
                    return true;
                }
            }
        }

        return false;
    }


    function joinUniqueLyricTexts(lines) {
        const result = [];
        const seen = new Set();

        for (const line of lines || []) {
            const text =
                String(
                    line?.text || ""
                ).trim();

            if (!text) {
                continue;
            }

            const key =
                normalizeText(text);

            if (
                !key ||
                seen.has(key)
            ) {
                continue;
            }

            seen.add(key);
            result.push(text);
        }

        return result.join(" ");
    }

