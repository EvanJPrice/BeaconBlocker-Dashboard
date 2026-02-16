import React, { useState, useEffect } from 'react';
import { getReferralCode, getReferralStats } from './api/referral';

function ReferralBanner({ session, onOpenSubscription }) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!session) return;

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const [, statsData] = await Promise.all([
                    getReferralCode(session), // Still fetch to generate code if needed
                    getReferralStats(session)
                ]);
                setStats(statsData);
            } catch (err) {
                console.error('Failed to fetch referral data:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [session]);

    const handleClick = () => {
        if (onOpenSubscription) {
            onOpenSubscription();
        }
    };

    // Build banner text based on user state
    let bannerText = 'Loading...';
    if (!loading && stats) {
        if (stats.referee_bonus_pending) {
            if (stats.is_subscribed) {
                // Already subscribed - show they earned it (asterisk signals more details in Settings)
                bannerText = <>+14 bonus days earned!<sup style={{ fontSize: '0.6em', marginLeft: '1px' }}>*</sup></>;
            } else {
                // Not yet subscribed - encourage them
                bannerText = 'Subscribe to unlock 2 weeks free!';
            }
        } else if (stats.total_days_earned > 0) {
            // User has credited referral bonus days
            bannerText = `+${stats.total_days_earned} bonus days earned!`;
        } else if (stats.pending > 0) {
            // User has pending referrals (signed up with code but haven't subscribed yet)
            bannerText = `FREE February • ${stats.pending} pending`;
        } else {
            // Default state - encourage sharing
            bannerText = 'FREE February promo';
        }
    }

    return (
        <button
            onClick={handleClick}
            style={bannerStyles}
            onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 0 12px rgba(37, 99, 235, 0.4)';
                e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'none';
            }}
            title="Click to view subscription & referral details"
        >
            {bannerText}
        </button>
    );
}

// Styles - Using blue theme
const bannerStyles = {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 14px',
    borderRadius: '20px',
    fontSize: '0.8rem',
    fontWeight: '500',
    background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1), rgba(59, 130, 246, 0.15))',
    border: '1px solid rgba(37, 99, 235, 0.3)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap'
};

export default ReferralBanner;
