// FILE: src/api/referral.js
import config from '../config.js';
const API_BASE = config.BACKEND_URL;

function getAuthHeader(session) {
    if (!session?.access_token) return {};
    return { 'Authorization': `Bearer ${session.access_token}` };
}

// Get or create user's referral code
export async function getReferralCode(session) {
    const response = await fetch(`${API_BASE}/api/referral/code`, {
        method: 'GET',
        headers: getAuthHeader(session)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get referral code');
    }
    return response.json();
}

// Apply a referral code (for new users)
export async function applyReferralCode(session, code) {
    const response = await fetch(`${API_BASE}/api/referral/apply`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(session)
        },
        body: JSON.stringify({ code })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to apply referral code');
    }
    return response.json();
}

// Get referral statistics
export async function getReferralStats(session) {
    const response = await fetch(`${API_BASE}/api/referral/stats`, {
        method: 'GET',
        headers: getAuthHeader(session)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get referral stats');
    }
    return response.json();
}

// Generate shareable referral link
export function getReferralLink(code) {
    // Using the dashboard URL for signups
    // No need for /signup path - the SPA will detect the ref param
    const baseUrl = 'https://beaconblocker.vercel.app';
    return `${baseUrl}/?ref=${code}`;
}
