(function () {
    function createToastRoot() {
        let root = document.getElementById("toastRoot");
        if (!root) {
            root = document.createElement("div");
            root.id = "toastRoot";
            root.className = "toast-root";
            document.body.appendChild(root);
        }
        return root;
    }

    function toast(message, variant = "info") {
        const root = createToastRoot();
        const item = document.createElement("div");
        item.className = `toast toast-${variant}`;
        item.textContent = message;
        root.appendChild(item);
        requestAnimationFrame(() => item.classList.add("show"));
        setTimeout(() => {
            item.classList.remove("show");
            setTimeout(() => item.remove(), 220);
        }, 2800);
    }

    function setLoading(button, loadingText) {
        if (!button) return () => {};
        const prev = { text: button.textContent, disabled: button.disabled };
        button.textContent = loadingText || prev.text;
        button.disabled = true;
        button.classList.add("is-loading");
        return () => {
            button.textContent = prev.text;
            button.disabled = prev.disabled;
            button.classList.remove("is-loading");
        };
    }

    window.UI = { toast, setLoading };
})();
