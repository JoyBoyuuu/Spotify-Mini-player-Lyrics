    // =========================================================
    // Start
    // =========================================================

    initPiPDetection();

    const startupTimer =
        setInterval(
            async () => {
                const ready =
                    await loadCurrentTrack();

                if (ready) {
                    clearInterval(
                        startupTimer
                    );
                }
            },
            500
        );

    setTimeout(
        () => {
            clearInterval(
                startupTimer
            );
        },
        15000
    );

    Spicetify.Player.addEventListener(
        "songchange",
        () => {
            setTimeout(
                loadCurrentTrack,
                300
            );
        }
    );
})();
