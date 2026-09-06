    async function ensureOpenCC() {
        if (openCCConverter) {
            return openCCConverter;
        }

        if (
            window.OpenCC?.Converter
        ) {
            openCCConverter =
                window.OpenCC.Converter({
                    from: "cn",
                    to: "tw"
                });

            return openCCConverter;
        }

        if (!openCCLoadPromise) {
            openCCLoadPromise =
                new Promise(
                    (resolve, reject) => {
                        const existing =
                            document.querySelector(
                                "script[data-minilyrics-opencc]"
                            );

                        const finish = () => {
                            if (
                                window.OpenCC?.Converter
                            ) {
                                openCCConverter =
                                    window.OpenCC.Converter({
                                        from: "cn",
                                        to: "tw"
                                    });

                                resolve(
                                    openCCConverter
                                );
                            } else {
                                reject(
                                    new Error(
                                        "OpenCC loaded without a global API"
                                    )
                                );
                            }
                        };

                        if (existing) {
                            existing.addEventListener(
                                "load",
                                finish,
                                { once: true }
                            );

                            existing.addEventListener(
                                "error",
                                () => reject(
                                    new Error(
                                        "OpenCC script load failed"
                                    )
                                ),
                                { once: true }
                            );

                            return;
                        }

                        const script =
                            document.createElement(
                                "script"
                            );

                        script.src =
                            OPENCC_SCRIPT_URL;

                        script.defer = true;
                        script.dataset.minilyricsOpencc =
                            "1";

                        script.addEventListener(
                            "load",
                            finish,
                            { once: true }
                        );

                        script.addEventListener(
                            "error",
                            () => reject(
                                new Error(
                                    "OpenCC script load failed"
                                )
                            ),
                            { once: true }
                        );

                        document.body.appendChild(
                            script
                        );
                    }
                );
        }

        return await openCCLoadPromise;
    }

    async function convertTranslationsToTraditional(
        translations
    ) {
        if (!translations?.some(Boolean)) {
            return translations || [];
        }

        try {
            const converter =
                await ensureOpenCC();

            return translations.map(
                text =>
                    text
                        ? converter(text)
                        : ""
            );
        } catch (error) {
            console.warn(
                "[MiniLyrics] OpenCC unavailable; hiding Simplified Chinese translation:",
                error
            );

            // The user preference is Traditional Chinese only.
            // If OpenCC cannot load, keep the original lyrics instead
            // of showing Simplified Chinese.
            return translations.map(() => "");
        }
    }

