// FILE: src/api/accountability.js
// API functions for Accountability Contact and Unlock features

import config from '../config.js';
const API_BASE = config.BACKEND_URL;

// Get auth header
function getAuthHeader(session) {
    if (!session?.access_token) return {};
    return { 'Authorization': `Bearer ${session.access_token}` };
}

// --- Accountability Contact ---

export async function getAccountabilityContact(session) {
    const response = await fetch(`${API_BASE}/api/accountability/contact`, {
        headers: getAuthHeader(session)
    });
    if (!response.ok) throw new Error('Failed to get contact');
    return response.json();
}

export async function inviteAccountabilityContact(session, contactName, contactEmail) {
    const response = await fetch(`${API_BASE}/api/accountability/invite`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(session)
        },
        body: JSON.stringify({ contactName, contactEmail })
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send invitation');
    }
    return response.json();
}

export async function removeAccountabilityContact(session) {
    const response = await fetch(`${API_BASE}/api/accountability/contact`, {
        method: 'DELETE',
        headers: getAuthHeader(session)
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to remove contact');
    }
    return response.json();
}

export async function resendInvitation(session) {
    const response = await fetch(`${API_BASE}/api/accountability/resend-invite`, {
        method: 'POST',
        headers: getAuthHeader(session)
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to resend invitation');
    }
    return response.json();
}

// --- Unlock Requests ---

export async function requestUnlock(session, message = null) {
    const response = await fetch(`${API_BASE}/api/unlock/request`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(session)
        },
        body: JSON.stringify({ message })
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to request unlock');
    }
    return response.json();
}

export async function getUnlockStatus(session) {
    const response = await fetch(`${API_BASE}/api/unlock/status`, {
        headers: getAuthHeader(session)
    });
    if (!response.ok) throw new Error('Failed to get status');
    return response.json();
}

export async function requestEmergencyRecovery(session) {
    const response = await fetch(`${API_BASE}/api/unlock/emergency`, {
        method: 'POST',
        headers: getAuthHeader(session)
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start emergency recovery');
    }
    return response.json();
}

// --- DEV ONLY: Simulate approve/deny for testing ---
export async function devSimulateResponse(session, action) {
    const response = await fetch(`${API_BASE}/api/unlock/dev-respond`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(session)
        },
        body: JSON.stringify({ action }) // 'approve' or 'deny'
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to simulate response');
    }
    return response.json();
}

// --- DEV ONLY: Simulate contact verification ---
export async function devSimulateContactVerification(session, action) {
    const response = await fetch(`${API_BASE}/api/accountability/dev-verify`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(session)
        },
        body: JSON.stringify({ action }) // 'verify' or 'decline'
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to simulate verification');
    }
    return response.json();
}
