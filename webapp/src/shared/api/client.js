(function () {
    async function request(path, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (options.body && !(options.body instanceof FormData)) {
            headers["Content-Type"] = headers["Content-Type"] || "application/json";
        }
        const response = await fetch(path, { ...options, headers });
        const text = await response.text();
        const data = text ? JSON.parse(text) : null;
        if (!response.ok) {
            const error = new Error(data?.error || "Request failed");
            error.status = response.status;
            error.payload = data;
            throw error;
        }
        return data;
    }

    const withUser = (path, userId) => {
        const separator = path.includes("?") ? "&" : "?";
        return `${path}${separator}user_id=${encodeURIComponent(userId || 0)}`;
    };

    window.ApiClient = {
        get: path => request(path),
        post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body || {}) }),
        delete: (path, body) => request(path, { method: "DELETE", body: JSON.stringify(body || {}) }),
        withUser
    };
})();
