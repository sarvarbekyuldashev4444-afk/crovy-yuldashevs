(function () {
    window.MotionPresets = {
        press: {
            transform: "scale(0.985)",
            duration: window.MotionDurations?.fast || 140
        },
        hoverLift: {
            transform: "translateY(-1px)",
            duration: window.MotionDurations?.base || 210
        },
        listEnter: {
            from: "translateY(6px)",
            to: "translateY(0) scale(1)"
        },
        modalEnter: {
            from: "translateY(10px) scale(0.992)",
            to: "translateY(0) scale(1)"
        },
        dropdownEnter: {
            from: "translateY(-4px) scale(0.996)",
            to: "translateY(0) scale(1)"
        }
    };
})();
