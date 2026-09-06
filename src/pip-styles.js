    // =========================================================
    // PiP CSS
    // =========================================================

    function injectPiPStyles(doc) {
        if (
            doc.getElementById(
                PIP_STYLE_ID
            )
        ) {
            return;
        }

        const style =
            doc.createElement("style");

        style.id = PIP_STYLE_ID;

        style.textContent = `
            #${PIP_ROOT_ID} {
                position: fixed;
                inset: 0;
                z-index: 2147483647;

                display: flex;
                flex-direction: column;
                justify-content: flex-end;
                align-items: center;

                box-sizing: border-box;

                padding:
                    16px
                    16px
                    clamp(96px, 36vh, 128px);

                pointer-events: none;

                font-family:
                    "Spotify Mix",
                    "CircularSp",
                    Arial,
                    sans-serif;
            }

            #${PIP_ROOT_ID}
            .minilyrics-shell {
                position: relative;

                width: min(88vw, 680px);
                box-sizing: border-box;

                pointer-events: none;

                transition:
                    opacity 180ms ease,
                    transform 180ms ease;
            }

            #${PIP_ROOT_ID}
            .minilyrics-panel {
                position: relative;
                width: 100%;
                box-sizing: border-box;

                padding: 5px 14px;

                border-radius: 14px;
                color: white;

                /*
                 * v17: lighter glass panel.
                 * Keep enough contrast for white lyrics while allowing much
                 * more of the Spotify artwork/video to remain visible.
                 */
                background:
                    linear-gradient(
                        to bottom,
                        rgba(0,0,0,0.10),
                        rgba(0,0,0,0.30)
                    );

                backdrop-filter: blur(5px);
                -webkit-backdrop-filter: blur(5px);

                border:
                    1px solid rgba(255,255,255,0.06);

                text-shadow:
                    0 1px 4px rgba(0,0,0,0.95);

                overflow: hidden;

                transition:
                    width 200ms ease,
                    height 200ms ease,
                    padding 200ms ease,
                    border-radius 200ms ease;
            }

            #${PIP_ROOT_ID}
            .minilyrics-collapse {
                position: absolute;
                top: 1px;
                right: 7px;
                z-index: 100;

                width: 32px;
                height: 20px;

                display: flex;
                align-items: center;
                justify-content: center;

                padding: 0;
                margin: 0;

                border: 0;
                border-radius: 999px;
                background: transparent;

                cursor: pointer;
                pointer-events: auto;

                opacity: 0.58;

                transition:
                    opacity 140ms ease,
                    transform 140ms ease;

                -webkit-app-region:
                    no-drag;
            }

            #${PIP_ROOT_ID}
            .minilyrics-collapse span {
                display: block;
                width: 20px;
                height: 2px;
                border-radius: 999px;
                background: rgba(255,255,255,0.82);
                box-shadow: 0 1px 3px rgba(0,0,0,0.72);
            }

            #${PIP_ROOT_ID}
            .minilyrics-collapse:hover {
                opacity: 1;
                transform: scaleX(1.12);
            }

            #${PIP_ROOT_ID}
            .minilyrics-collapse:active {
                transform: scale(0.92);
            }

            #${PIP_ROOT_ID}
            .minilyrics-collapse:focus-visible {
                outline:
                    2px solid rgba(255,255,255,0.72);
                outline-offset: 2px;
            }

            #${PIP_ROOT_ID}.minilyrics-collapsed
            .minilyrics-shell {
                width: 52px;
            }

            #${PIP_ROOT_ID}.minilyrics-collapsed
            .minilyrics-panel {
                width: 52px;
                height: 24px;
                padding: 0;
                border-radius: 12px;
            }

            #${PIP_ROOT_ID}.minilyrics-collapsed
            .minilyrics-collapse {
                inset: 0;
                width: 52px;
                height: 24px;
            }

            #${PIP_ROOT_ID}.minilyrics-collapsed
            .minilyrics-collapse span {
                width: 24px;
            }

            #${PIP_ROOT_ID}.minilyrics-collapsed
            .minilyrics-viewport {
                display: none;
            }

            #${PIP_ROOT_ID}.minilyrics-peek-through
            .minilyrics-shell {
                opacity: 0.08;
            }

            /*
             * 固定高度的歌詞視窗。
             * 每一句都是 absolute positioned，
             * 所以換句時可以真正往上捲動，
             * 而不是直接替換文字。
             */
            #${PIP_ROOT_ID}
            .minilyrics-viewport {
                position: relative;

                width: 100%;
                height: 84px;

                overflow: hidden;

                /*
                 * 長歌詞換行時，viewport 會依目前句高度
                 * 自動平滑伸縮，不再用 ... 截斷。
                 */
                transition:
                    height 420ms
                        cubic-bezier(0.22, 1, 0.36, 1);

                -webkit-mask-image:
                    linear-gradient(
                        to bottom,
                        transparent 0%,
                        black 16%,
                        black 84%,
                        transparent 100%
                    );

                mask-image:
                    linear-gradient(
                        to bottom,
                        transparent 0%,
                        black 16%,
                        black 84%,
                        transparent 100%
                    );
            }

            #${PIP_ROOT_ID}
            .minilyrics-line {
                position: absolute;

                left: 0;
                right: 0;
                top: 50%;

                padding: 0 5px;

                text-align: center;

                /*
                 * 不截斷長歌詞：
                 * 允許完整換行顯示，不使用 ellipsis。
                 */
                white-space: normal;
                overflow: visible;
                text-overflow: clip;
                overflow-wrap: anywhere;
                word-break: normal;

                font-size:
                    clamp(
                        12px,
                        3.8vw,
                        17px
                    );

                font-weight: 550;
                line-height: 1.28;

                opacity: 0;

                /*
                 * 主要動畫：
                 * 快速起步、柔順收尾。
                 */
                transition:
                    transform 540ms
                        cubic-bezier(0.22, 1, 0.36, 1),
                    opacity 420ms ease,
                    filter 460ms ease;

                will-change:
                    transform,
                    opacity,
                    filter;

                transform-origin:
                    center center;
            }

            #${PIP_ROOT_ID}
            .minilyrics-line.current {
                font-weight: 760;

                text-shadow:
                    0 1px 5px
                        rgba(0,0,0,0.95),
                    0 0 10px
                        rgba(255,255,255,0.08);
            }

            #${PIP_ROOT_ID}
            .minilyrics-status {
                min-height: 54px;

                display: flex;
                justify-content: center;
                align-items: center;

                padding: 0 8px;

                text-align: center;

                opacity: 0.72;

                font-size: 13px;
                font-weight: 500;
            }

            #${PIP_ROOT_ID}
            .minilyrics-translation {
                display: block;
                visibility: hidden;
                opacity: 0;
                max-height: 0;
                overflow: hidden;
                margin-top: 0;
                padding: 0 2px;
                transform: translateY(4px);

                font-size: 0.80em;
                line-height: 1.26;
                font-weight: 520;
                letter-spacing: 0;

                color: rgba(255,255,255,0.82);
                text-shadow:
                    0 1px 4px rgba(0,0,0,0.9);

                transition:
                    opacity 240ms ease,
                    transform 320ms cubic-bezier(0.22, 1, 0.36, 1),
                    max-height 320ms cubic-bezier(0.22, 1, 0.36, 1),
                    margin-top 320ms cubic-bezier(0.22, 1, 0.36, 1);
            }

            #${PIP_ROOT_ID}
            .minilyrics-line.current
            .minilyrics-translation:not(:empty) {
                visibility: visible;
                opacity: 1;
                max-height: 120px;
                margin-top: 4px;
                transform: translateY(0);
            }

            /* Searching: three dots move like a small wave. */
            #${PIP_ROOT_ID}
            .minilyrics-searching {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                max-width: 100%;
            }

            #${PIP_ROOT_ID}
            .minilyrics-status-text {
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
            }

            #${PIP_ROOT_ID}
            .minilyrics-search-dots {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                flex: 0 0 auto;
                height: 16px;
            }

            #${PIP_ROOT_ID}
            .minilyrics-search-dot {
                width: 5px;
                height: 5px;
                border-radius: 999px;
                background: currentColor;
                opacity: 0.35;
                animation:
                    minilyrics-search-wave
                    900ms
                    cubic-bezier(0.4, 0, 0.2, 1)
                    infinite;
                will-change: transform, opacity;
            }

            #${PIP_ROOT_ID}
            .minilyrics-search-dot:nth-child(2) {
                animation-delay: 120ms;
            }

            #${PIP_ROOT_ID}
            .minilyrics-search-dot:nth-child(3) {
                animation-delay: 240ms;
            }

            @keyframes minilyrics-search-wave {
                0%,
                60%,
                100% {
                    transform:
                        translateY(2px)
                        scale(0.86);
                    opacity: 0.32;
                }

                30% {
                    transform:
                        translateY(-6px)
                        scale(1);
                    opacity: 1;
                }
            }

            /*
             * 橫向 Mini Player
             */
            @media
            (min-aspect-ratio: 1/1) {

                #${PIP_ROOT_ID} {
                    padding-bottom:
                        clamp(92px, 34vh, 118px);
                }

                #${PIP_ROOT_ID}
                .minilyrics-shell {
                    width: min(84vw, 680px);
                }

                #${PIP_ROOT_ID}
                .minilyrics-panel {
                    padding: 4px 12px;
                }

                #${PIP_ROOT_ID}
                .minilyrics-viewport {
                    height: 80px;
                }

                #${PIP_ROOT_ID}
                .minilyrics-line {
                    font-size:
                        clamp(
                            12px,
                            3.2vw,
                            17px
                        );

                    line-height: 1.28;
                }
            }

            @media
            (prefers-reduced-motion: reduce) {

                #${PIP_ROOT_ID}
                .minilyrics-line {
                    transition:
                        opacity 160ms linear;
                }

                #${PIP_ROOT_ID}
                .minilyrics-search-dot {
                    animation: none;
                    transform: none;
                    opacity: 0.65;
                }

            }
        `;

        doc.head.appendChild(style);
    }
