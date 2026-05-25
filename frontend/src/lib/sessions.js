import { getAuthToken } from "./auth";

const API_URL = import.meta.env.PROD ? "/api" : "http://localhost:3000/api";

async function fetchWithAuth(endpoint, options = {}) {
    const token = getAuthToken();

    const headers = {
        "Content-Type": "application/json",
        ...options.headers,
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Request failed");
    }

    return res.json();
}

export async function saveSession(sessionData) {
    return fetchWithAuth("/sessions", {
        method: "POST",
        body: JSON.stringify(sessionData),
    });
}

export async function getSessions() {
    return fetchWithAuth("/sessions");
}