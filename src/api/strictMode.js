// FILE: src/api/strictMode.js
import config from '../config.js';
const API_BASE = config.BACKEND_URL;

function getAuthHeader(session) {
    if (!session?.access_token) return {};
    return { 'Authorization': `Bearer ${session.access_token}` };
}

export async function activateStrictMode(session, durationMinutes) {
    const response = await fetch(`${API_BASE}/api/strict-mode/activate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(session)
        },
        body: JSON.stringify({ durationMinutes })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to activate strict mode');
    }
    return response.json();
}

export async function extendStrictMode(session, durationMinutes) {
    const response = await fetch(`${API_BASE}/api/strict-mode/extend`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(session)
        },
        body: JSON.stringify({ durationMinutes })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to extend strict mode');
    }
    return response.json();
}

export async function deactivateStrictMode(session) {
    const response = await fetch(`${API_BASE}/api/strict-mode/deactivate`, {
        method: 'DELETE',
        headers: getAuthHeader(session)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to deactivate strict mode');
    }
    return response.json();
}
