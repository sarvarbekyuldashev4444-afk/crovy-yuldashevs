(function () {
    const durations = window.MotionDurations || {};

    function prefersReducedMotion() {
        return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
    }

    function close(node, className = "open", afterClose) {
        if (!node) return;
        if (prefersReducedMotion()) {
            node.classList.remove(className);
            node.classList.remove("motion-closing");
            if (afterClose) afterClose();
            return;
        }
        node.classList.add("motion-closing");
        window.setTimeout(() => {
            node.classList.remove(className);
            node.classList.remove("motion-closing");
            if (afterClose) afterClose();
        }, durations.modal || 520);
    }

    function open(node, className = "open") {
        if (!node) return;
        node.classList.remove("motion-closing");
        node.classList.add(className);
    }

    function pulse(node) {
        if (!node || prefersReducedMotion()) return;
        node.classList.remove("motion-pulse-once");
        void node.offsetWidth;
        node.classList.add("motion-pulse-once");
    }

    function markDynamicChildren(root, selector) {
        if (!root) return;
        root.querySelectorAll(selector).forEach((node, index) => {
            if (node.dataset.motionReady === "1") return;
            node.dataset.motionReady = "1";
            node.style.setProperty("--motion-index", Math.min(index, 10));
        });
    }

    function boot() {
        document.documentElement.classList.add("motion-ready");
        markDynamicChildren(document, ".product-card, .cart-item, .office-card, .branch-card, .profile-card, .adm-order-card, .adm-product-card, .adm-user-card, .adm-carousel-item, .order-history-item");

        const observer = new MutationObserver(records => {
            records.forEach(record => {
                record.addedNodes.forEach(node => {
                    if (!(node instanceof Element)) return;
                    if (node.matches?.(".product-card, .cart-item, .office-card, .branch-card, .profile-card, .adm-order-card, .adm-product-card, .adm-user-card, .adm-carousel-item, .order-history-item")) {
                        node.dataset.motionReady = "1";
                    }
                    markDynamicChildren(node, ".product-card, .cart-item, .office-card, .branch-card, .profile-card, .adm-order-card, .adm-product-card, .adm-user-card, .adm-carousel-item, .order-history-item");
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    window.Motion = { open, close, pulse, prefersReducedMotion, boot };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
