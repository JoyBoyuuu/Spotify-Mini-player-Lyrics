    // =========================================================
    // PiP UI
    // =========================================================

    function readPiPCollapsed() {
        try {
            return localStorage.getItem(
                PIP_COLLAPSED_STORAGE_KEY
            ) === "true";
        } catch {
            return false;
        }
    }

    function setPiPCollapsed(
        root,
        collapsed,
        persist = true
    ) {
        root.classList.toggle(
            "minilyrics-collapsed",
            collapsed
        );

        const button = root.querySelector(
            ".minilyrics-collapse"
        );

        if (button) {
            button.setAttribute(
                "aria-expanded",
                String(!collapsed)
            );
            button.setAttribute(
                "aria-label",
                collapsed
                    ? "Expand lyrics"
                    : "Collapse lyrics"
            );
            button.title = collapsed
                ? "Expand lyrics"
                : "Collapse lyrics";
        }

        if (!persist) {
            return;
        }

        try {
            localStorage.setItem(
                PIP_COLLAPSED_STORAGE_KEY,
                String(collapsed)
            );
        } catch {
            // Storage failure should not affect the lyrics UI.
        }
    }

    function resetLyricsHoverReveal(root) {
        if (pipHoverTimer) {
            clearTimeout(pipHoverTimer);
            pipHoverTimer = null;
        }

        root?.classList.remove(
            "minilyrics-peek-through"
        );
    }

    function cleanupLyricsHoverReveal() {
        if (pipHoverCleanup) {
            pipHoverCleanup();
            pipHoverCleanup = null;
        }

        if (pipHoverTimer) {
            clearTimeout(pipHoverTimer);
            pipHoverTimer = null;
        }
    }

    function initLyricsHoverReveal(root, doc) {
        cleanupLyricsHoverReveal();

        let pointerInside = false;

        const onPointerMove = event => {
            const shell = root.querySelector(
                ".minilyrics-shell"
            );

            if (
                !shell ||
                root.classList.contains(
                    "minilyrics-collapsed"
                )
            ) {
                pointerInside = false;
                resetLyricsHoverReveal(root);
                return;
            }

            const rect =
                shell.getBoundingClientRect();

            const inside =
                event.clientX >= rect.left &&
                event.clientX <= rect.right &&
                event.clientY >= rect.top &&
                event.clientY <= rect.bottom;

            if (!inside) {
                pointerInside = false;
                resetLyricsHoverReveal(root);
                return;
            }

            pointerInside = true;

            if (
                pipHoverTimer ||
                root.classList.contains(
                    "minilyrics-peek-through"
                )
            ) {
                return;
            }

            pipHoverTimer = setTimeout(
                () => {
                    pipHoverTimer = null;

                    if (
                        pointerInside &&
                        root.isConnected &&
                        !root.classList.contains(
                            "minilyrics-collapsed"
                        )
                    ) {
                        root.classList.add(
                            "minilyrics-peek-through"
                        );
                    }
                },
                2000
            );
        };

        const onPointerLeave = () => {
            pointerInside = false;
            resetLyricsHoverReveal(root);
        };

        doc.addEventListener(
            "pointermove",
            onPointerMove,
            { passive: true }
        );

        doc.addEventListener(
            "pointerleave",
            onPointerLeave
        );

        pipHoverCleanup = () => {
            doc.removeEventListener(
                "pointermove",
                onPointerMove
            );
            doc.removeEventListener(
                "pointerleave",
                onPointerLeave
            );
            resetLyricsHoverReveal(root);
        };
    }

    function createPiPUI(doc) {
        injectPiPStyles(doc);

        let root =
            doc.getElementById(
                PIP_ROOT_ID
            );

        if (root) {
            return root;
        }

        root =
            doc.createElement("div");

        root.id =
            PIP_ROOT_ID;

        root.innerHTML = `
            <div class="minilyrics-shell">
                <button
                    class="minilyrics-collapse"
                    type="button"
                    aria-label="Collapse lyrics"
                    aria-expanded="true"
                    title="Collapse lyrics">
                    <span></span>
                </button>

                <div class="minilyrics-panel">
                    <div
                        class="minilyrics-viewport">
                    </div>
                </div>
            </div>
        `;

        const collapseButton =
            root.querySelector(
                ".minilyrics-collapse"
            );

        collapseButton?.addEventListener(
            "click",
            event => {
                event.preventDefault();
                event.stopPropagation();

                const collapse =
                    !root.classList.contains(
                        "minilyrics-collapsed"
                    );

                resetLyricsHoverReveal(root);
                setPiPCollapsed(root, collapse);

                if (
                    !collapse &&
                    lyricLines.length
                ) {
                    lastRenderedPiPIndex = null;

                    requestAnimationFrame(
                        () => renderPiPLyrics(
                            currentLineIndex
                        )
                    );
                } else if (!collapse) {
                    renderPiPStatus(displayStatus);
                }
            }
        );

        doc.body.appendChild(root);

        setPiPCollapsed(
            root,
            readPiPCollapsed(),
            false
        );

        initLyricsHoverReveal(root, doc);

        return root;
    }

    function renderPiPStatus(text) {
        displayStatus = text;

        if (
            !pipDocument ||
            !pipDocument.body
        ) {
            return;
        }

        const root =
            createPiPUI(
                pipDocument
            );

        if (
            root.classList.contains(
                "minilyrics-collapsed"
            )
        ) {
            lastRenderedPiPIndex = null;
            return;
        }

        const panel =
            root.querySelector(
                ".minilyrics-panel"
            );

        const isSearching =
            /^Searching(?::|\b)/i
                .test(text);

        if (isSearching) {
            panel.innerHTML = `
                <div
                    class="minilyrics-status">
                    <div
                        class="minilyrics-searching">
                        <span
                            class="minilyrics-status-text">
                        </span>
                        <span
                            class="minilyrics-search-dots"
                            aria-hidden="true">
                            <span
                                class="minilyrics-search-dot">
                            </span>
                            <span
                                class="minilyrics-search-dot">
                            </span>
                            <span
                                class="minilyrics-search-dot">
                            </span>
                        </span>
                    </div>
                </div>
            `;

            panel
                .querySelector(
                    ".minilyrics-status-text"
                )
                .textContent = text;

            return;
        }

        panel.innerHTML = `
            <div
                class="minilyrics-status">
            </div>
        `;

        panel
            .querySelector(
                ".minilyrics-status"
            )
            .textContent = text;
    }

    function setLinePosition(
        element,
        offset,
        animate = true,
        yOverride = null
    ) {
        /*
         * yOverride 由實際文字高度計算。
         * 如果沒有提供，就用 fallback 距離，
         * 主要給剛建立的透明預備行使用。
         */
        const FALLBACK_DISTANCE = 40;

        const y =
            Number.isFinite(yOverride)
                ? yOverride
                : offset * FALLBACK_DISTANCE;

        let scale = 0.88;
        let opacity = 0;
        let blur = 1;

        if (offset === 0) {
            scale = 1;
            opacity = 1;
            blur = 0;
        } else if (
            Math.abs(offset) === 1
        ) {
            scale = 0.92;
            opacity = 0.43;
            blur = 0.25;
        } else if (
            Math.abs(offset) === 2
        ) {
            scale = 0.88;
            opacity = 0;
            blur = 0.8;
        }

        if (!animate) {
            element.style.transition =
                "none";
        }

        element.style.transform =
            `translateY(calc(-50% + ${y}px)) ` +
            `scale(${scale})`;

        element.style.opacity =
            String(opacity);

        element.style.filter =
            `blur(${blur}px)`;

        element.style.zIndex =
            String(
                10 -
                Math.abs(offset)
            );

        if (!animate) {
            /*
             * 強制 browser 套用無動畫的位置，
             * 下一 frame 再恢復 CSS transition。
             */
            void element.offsetHeight;

            requestAnimationFrame(
                () => {
                    element.style.transition =
                        "";
                }
            );
        }
    }

    /*
     * 依每一句「實際換行後的高度」計算位置。
     *
     * 這樣即使 current lyric 有 2~4 行，
     * prev / next 也不會疊在它上面。
     */
    function layoutLyricLines(
        viewport,
        activeIndex,
        animate = true
    ) {
        const elements = [
            ...viewport.querySelectorAll(
                ".minilyrics-line"
            )
        ];

        if (!elements.length) {
            return;
        }

        const byIndex =
            new Map();

        for (const element of elements) {
            byIndex.set(
                Number(
                    element.dataset
                        .lyricIndex
                ),
                element
            );
        }

        const current =
            byIndex.get(activeIndex);

        if (!current) {
            return;
        }

        /*
         * 行與行之間保留真正的空隙。
         * 位置由元素的 offsetHeight 決定，
         * 不再假設每一句只有單行。
         */
        const GAP = 6;
        const positions =
            new Map();

        positions.set(
            activeIndex,
            0
        );

        let previousIndex =
            activeIndex;

        let previousY = 0;

        for (
            let lyricIndex =
                activeIndex + 1;
            lyricIndex <=
                activeIndex + 2;
            lyricIndex++
        ) {
            const previous =
                byIndex.get(
                    previousIndex
                );

            const currentLine =
                byIndex.get(
                    lyricIndex
                );

            if (
                !previous ||
                !currentLine
            ) {
                continue;
            }

            previousY +=
                previous.offsetHeight / 2 +
                currentLine.offsetHeight / 2 +
                GAP;

            positions.set(
                lyricIndex,
                previousY
            );

            previousIndex =
                lyricIndex;
        }

        previousIndex =
            activeIndex;

        previousY = 0;

        for (
            let lyricIndex =
                activeIndex - 1;
            lyricIndex >=
                activeIndex - 2;
            lyricIndex--
        ) {
            const previous =
                byIndex.get(
                    previousIndex
                );

            const currentLine =
                byIndex.get(
                    lyricIndex
                );

            if (
                !previous ||
                !currentLine
            ) {
                continue;
            }

            previousY -=
                previous.offsetHeight / 2 +
                currentLine.offsetHeight / 2 +
                GAP;

            positions.set(
                lyricIndex,
                previousY
            );

            previousIndex =
                lyricIndex;
        }

        /*
         * viewport 也跟著 current lyric 的實際高度調整。
         * current 無論多長都完整顯示，不會出現 ...
         */
        const previous =
            byIndex.get(
                activeIndex - 1
            );

        const next =
            byIndex.get(
                activeIndex + 1
            );

        const currentHeight =
            current.offsetHeight;

        const contextAbove =
            previous
                ? Math.min(
                    previous.offsetHeight,
                    22
                )
                : 0;

        const contextBelow =
            next
                ? Math.min(
                    next.offsetHeight,
                    22
                )
                : 0;

        const viewportHeight =
            Math.max(
                84,
                Math.ceil(
                    currentHeight +
                    contextAbove +
                    contextBelow +
                    16
                )
            );

        viewport.style.height =
            `${viewportHeight}px`;

        for (const element of elements) {
            const lyricIndex =
                Number(
                    element.dataset
                        .lyricIndex
                );

            const offset =
                lyricIndex -
                activeIndex;

            const y =
                positions.has(
                    lyricIndex
                )
                    ? positions.get(
                        lyricIndex
                    )
                    : offset * 50;

            setLinePosition(
                element,
                offset,
                animate,
                y
            );
        }
    }

    function setTranslationVisibility(
        node,
        text,
        isCurrent
    ) {
        if (!node) {
            return;
        }

        const value =
            String(text || "").trim();

        node.textContent = value;

        const visible =
            Boolean(value) && isCurrent;

        /*
         * Do not use display:none. Keeping the node mounted makes PiP
         * rendering much more reliable and lets the line height animate.
         */
        node.style.setProperty(
            "display",
            "block",
            "important"
        );
        node.style.setProperty(
            "visibility",
            visible ? "visible" : "hidden",
            "important"
        );
        node.style.setProperty(
            "opacity",
            visible ? "1" : "0",
            "important"
        );
        node.style.setProperty(
            "max-height",
            visible ? "120px" : "0px",
            "important"
        );
        node.style.setProperty(
            "margin-top",
            visible ? "4px" : "0px",
            "important"
        );
        node.style.setProperty(
            "transform",
            visible
                ? "translateY(0)"
                : "translateY(4px)",
            "important"
        );
    }

    function createLyricLine(
        viewport,
        lyricIndex,
        activeIndex,
        animate
    ) {
        const element =
            pipDocument.createElement(
                "div"
            );

        element.className =
            "minilyrics-line";

        element.dataset.lyricIndex =
            String(lyricIndex);

        const lyric =
            lyricLines[lyricIndex] || {};

        const original =
            pipDocument.createElement(
                "div"
            );

        original.className =
            "minilyrics-original";

        original.textContent =
            lyric.text || "";

        const translation =
            pipDocument.createElement(
                "div"
            );

        translation.className =
            "minilyrics-translation";

        translation.lang =
            "zh-Hant";

        translation.textContent =
            lyric.translation || "";

        /*
         * Keep the translation node in layout at all times and let the
         * current-line state reveal it.  We use !important inline values
         * because Spotify's PiP document can inject styles after our CSS.
         */
        setTranslationVisibility(
            translation,
            lyric.translation || "",
            lyricIndex === activeIndex
        );

        element.appendChild(
            original
        );

        element.appendChild(
            translation
        );

        viewport.appendChild(
            element
        );

        setLinePosition(
            element,
            lyricIndex - activeIndex,
            animate
        );

        element.classList.toggle(
            "current",
            lyricIndex === activeIndex
        );

        return element;
    }

    function rebuildPiPLyrics(
        viewport,
        index
    ) {
        viewport.innerHTML = "";

        for (
            let lyricIndex = index - 2;
            lyricIndex <= index + 2;
            lyricIndex++
        ) {
            if (
                lyricIndex < 0 ||
                lyricIndex >= lyricLines.length
            ) {
                continue;
            }

            createLyricLine(
                viewport,
                lyricIndex,
                index,
                false
            );
        }

        /*
         * 所有 DOM 都建立後，再依實際文字高度排版。
         */
        layoutLyricLines(
            viewport,
            index,
            false
        );

        lastRenderedPiPIndex =
            index;
    }

    function renderPiPLyrics(index) {
        if (
            !pipDocument ||
            !pipDocument.body ||
            !lyricLines.length
        ) {
            return;
        }

        const root =
            createPiPUI(
                pipDocument
            );

        if (
            root.classList.contains(
                "minilyrics-collapsed"
            )
        ) {
            lastRenderedPiPIndex = null;
            return;
        }

        const panel =
            root.querySelector(
                ".minilyrics-panel"
            );

        /*
         * renderPiPStatus() 會換掉 panel 內容，
         * 因此歌詞開始時需要重新建立 viewport。
         */
        let viewport =
            panel.querySelector(
                ".minilyrics-viewport"
            );

        if (!viewport) {
            panel.innerHTML = `
                <div
                    class="minilyrics-viewport">
                </div>
            `;

            viewport =
                panel.querySelector(
                    ".minilyrics-viewport"
                );

            lastRenderedPiPIndex =
                null;
        }

        /*
         * 還沒進第一句時，
         * 先把第一句放在中央下方等待。
         */
        const activeIndex =
            index < 0 ? 0 : index;

        /*
         * 第一次 render、倒帶、拖曳進度，
         * 或一次跳超過一行時不要讓文字飛過整個畫面；
         * 直接重建到正確位置。
         */
        const isNormalStep =
            lastRenderedPiPIndex !== null &&
            activeIndex -
                lastRenderedPiPIndex === 1;

        if (!isNormalStep) {
            rebuildPiPLyrics(
                viewport,
                activeIndex
            );

            return;
        }

        /*
         * 預先建立新的 +2 行。
         * 它從 viewport 下方的透明位置開始，
         * 下一次換句時會自然滑入。
         */
        for (
            let lyricIndex =
                activeIndex - 2;
            lyricIndex <=
                activeIndex + 2;
            lyricIndex++
        ) {
            if (
                lyricIndex < 0 ||
                lyricIndex >=
                    lyricLines.length
            ) {
                continue;
            }

            let element =
                viewport.querySelector(
                    `[data-lyric-index="${lyricIndex}"]`
                );

            if (!element) {
                element =
                    createLyricLine(
                        viewport,
                        lyricIndex,
                        activeIndex,
                        false
                    );
            }
        }

        /*
         * 這裡才是真正的 rolling：
         *
         * 舊 current：0 -> -1
         * 舊 next：   +1 -> 0
         * 新句：      +2 -> +1
         */
        const allLines =
            viewport.querySelectorAll(
                ".minilyrics-line"
            );

        for (
            const element of allLines
        ) {
            const lyricIndex =
                Number(
                    element.dataset
                        .lyricIndex
                );

            const offset =
                lyricIndex -
                activeIndex;

            element.classList.toggle(
                "current",
                offset === 0
            );

            /*
             * Refresh translation text and visibility on every roll.
             * NetEase translation is loaded asynchronously, so the DOM may
             * have been created before line.translation was available.
             */
            const translationElement =
                element.querySelector(
                    ".minilyrics-translation"
                );

            if (translationElement) {
                const translationText =
                    lyricLines[lyricIndex]
                        ?.translation || "";

                setTranslationVisibility(
                    translationElement,
                    translationText,
                    offset === 0
                );
            }

            /*
             * 真正的位置會在 loop 後由
             * layoutLyricLines() 使用實際文字高度統一計算。
             */

            /*
             * 已經滑出頂部的舊句，
             * 等 transition 完成再移除。
             */
            if (offset < -2) {
                setTimeout(
                    () => {
                        if (
                            element
                                .parentElement &&
                            Number(
                                element.dataset
                                    .lyricIndex
                            ) <
                                activeIndex - 2
                        ) {
                            element.remove();
                        }
                    },
                    620
                );
            }
        }

        /*
         * 依 current / prev / next 的實際換行高度，
         * 一次更新所有位置，讓長句也能平滑捲動。
         */
        layoutLyricLines(
            viewport,
            activeIndex,
            true
        );

        lastRenderedPiPIndex =
            activeIndex;
    }
