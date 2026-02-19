import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import './Dashboard.css';
import config from './config.js';
import {
    getAccountabilityContact,
    inviteAccountabilityContact,
    removeAccountabilityContact,
    requestUnlock,
    getUnlockStatus,
    resendInvitation,
    requestEmergencyRecovery,
} from './api/accountability';
import { activateStrictMode } from './api/strictMode';
import { getReferralCode, getReferralStats, getReferralLink } from './api/referral';

// --- Direct Extension Messaging for Pause Sync ---
function syncPauseToExtension(paused) {
    const marker = document.getElementById('beacon-extension-status');
    const extensionId = marker?.getAttribute('data-extension-id');

    console.log('[SETTINGS] syncPauseToExtension called, paused:', paused, 'extensionId:', extensionId);

    if (extensionId && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
            chrome.runtime.sendMessage(
                extensionId,
                { type: 'SYNC_PAUSE', paused: paused },
                (response) => {
                    if (chrome.runtime.lastError) {
                        console.log('[SETTINGS] Direct pause sync failed:', chrome.runtime.lastError.message);
                        document.dispatchEvent(new CustomEvent('BEACON_PAUSE_SYNC', { detail: { paused } }));
                    } else {
                        console.log('[SETTINGS] Pause sync response:', response);
                    }
                }
            );
        } catch (e) {
            console.log('[SETTINGS] chrome.runtime error:', e);
            document.dispatchEvent(new CustomEvent('BEACON_PAUSE_SYNC', { detail: { paused } }));
        }
    } else {
        console.log('[SETTINGS] Using CustomEvent fallback for pause sync');
        document.dispatchEvent(new CustomEvent('BEACON_PAUSE_SYNC', { detail: { paused } }));
    }
}

function SettingsModal({ isOpen, onClose, settings, onSave, storageUsage, userEmail, session, onDeleteAccount, initialTab, onRestartTour, theme, onThemeChange }) {
    const [activeTab, setActiveTab] = useState('analytics');
    const [localSettings, setLocalSettings] = useState(settings);
    const [strictModeClickedOnce, setStrictModeClickedOnce] = useState(false);

    // Sync localSettings when settings prop changes (e.g., from dashboard Resume button)
    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen && initialTab) {
            setActiveTab(initialTab);
        } else if (isOpen) {
            // Default to analytics if no specific tab requested
            // Only reset if we are opening fresh (optional, existing logic handles mounting)
        }

        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(localSettings);
        onClose();
    };

    const updateSetting = (key, value) => {
        setLocalSettings(prev => ({ ...prev, [key]: value }));

        if (key === 'strictModeUntil') {
            // Do nothing for DB interactions here.
            // StrictMode updates are now handled via secure API calls only.
            // The local state update above (setLocalSettings) is sufficient for UI.
        }
    };

    // Strict Mode activation handler with double-click pattern
    const handleActivateStrictMode = () => {
        if (!strictModeClickedOnce) {
            setStrictModeClickedOnce(true);
            // Reset after 3 seconds if they don't click again
            setTimeout(() => setStrictModeClickedOnce(false), 3000);
            return;
        }

        // Second click - actually activate
        let endTime;
        const isIndefinite = localSettings.strictModeIndefinite;

        if (isIndefinite) {
            // For indefinite mode, set end time to 100 years from now (effectively forever)
            endTime = Date.now() + (100 * 365 * 24 * 60 * 60 * 1000);
        } else {
            const durationMs =
                ((localSettings.strictModeDurationHours || 0) * 60 * 60 * 1000) +
                ((localSettings.strictModeDurationMinutes || 0) * 60 * 1000);
            endTime = Date.now() + durationMs;
        }

        setLocalSettings(prev => ({
            ...prev,
            strictModeUntil: endTime,
            strictMode: true,
            strictModeIndefinite: isIndefinite
        }));

        setStrictModeClickedOnce(false);

        // Save to localStorage immediately
        onSave({
            ...localSettings,
            strictModeUntil: endTime,
            strictMode: true,
            strictModeIndefinite: isIndefinite
        });

        // Call secure API to activate
        activateStrictMode(session, isIndefinite ? 52560000 : ((localSettings.strictModeDurationHours || 0) * 60 + (localSettings.strictModeDurationMinutes || 0)))
            .then(data => {
                console.log('[SETTINGS] Secure Strict Mode Activated via API:', data);
                // Ensure local state matches server time
                if (data.strict_mode_until) {
                    const serverEndTime = new Date(data.strict_mode_until).getTime();
                    updateSetting('strictModeUntil', serverEndTime);
                }
            })
            .catch(err => {
                console.error('[SETTINGS] Failed to activate strict mode via API:', err);
                // Revert local state if API fails?
                alert('Failed to activate strict mode: ' + err.message);
                updateSetting('strictMode', false);
                updateSetting('strictModeUntil', null);
            });
    };

    const tabs = [
        { id: 'analytics', label: 'Analytics & Insights' },
        { id: 'activity', label: 'Activity & Privacy' },
        { id: 'blocking', label: 'Blocking Behavior' },
        { id: 'account', label: 'Account' },
        { id: 'appearance', label: 'Appearance' },
        { id: 'subscription', label: 'Subscription & Billing' },
        { id: 'advanced', label: 'Advanced' }
    ];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content settings-modal"
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxWidth: '900px',
                    height: '85vh',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                {/* Header */}
                <div className="modal-header">
                    <h2>Settings</h2>
                    <button className="modal-close-button" onClick={onClose}>✕</button>
                </div>

                {/* Body with sidebar and content */}
                <div style={{
                    display: 'flex',
                    flex: 1,
                    overflow: 'hidden',
                    gap: '1.5rem'
                }}>
                    {/* Left Sidebar - Tabs */}
                    <div className="settings-modal-sidebar" style={{
                        width: '240px',
                        borderRight: '1px solid var(--border-color)',
                        overflowY: 'auto',
                        padding: '8px 8px 0 8px'
                    }}>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                className={`settings-category-tab ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    width: '100%',
                                    padding: '14px 18px',
                                    marginBottom: '12px',
                                    border: 'none',
                                    borderRadius: '10px',
                                    background: activeTab === tab.id ? 'var(--accent-bg, rgba(37, 99, 235, 0.1))' : 'transparent',
                                    color: activeTab === tab.id ? 'var(--primary-color, #2563eb)' : 'var(--text-primary)',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    fontSize: '1rem',
                                    fontWeight: activeTab === tab.id ? '600' : '400',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Right Content Area */}
                    <div className="settings-content" style={{
                        flex: 1,
                        overflowY: 'auto',
                        paddingRight: '1rem'
                    }}>
                        {activeTab === 'analytics' && (
                            <AnalyticsTab settings={localSettings} updateSetting={updateSetting} session={session} />
                        )}
                        {activeTab === 'subscription' && (
                            <SubscriptionTab session={session} />
                        )}
                        {activeTab === 'activity' && (
                            <ActivityTab settings={localSettings} updateSetting={updateSetting} storageUsage={storageUsage} />
                        )}
                        {activeTab === 'blocking' && (
                            <BlockingTab
                                settings={localSettings}
                                updateSetting={updateSetting}
                                onActivateStrictMode={handleActivateStrictMode}
                                strictModeClickedOnce={strictModeClickedOnce}
                                session={session}
                            />
                        )}
                        {activeTab === 'account' && (
                            <AccountTab
                                userEmail={userEmail}
                                onDeleteAccount={onDeleteAccount}
                                onResetDefaults={() => {
                                    const defaultSettings = {
                                        analyticsEnabled: true,
                                        censorBlockedTabs: true,
                                        censorBlockedPreviews: false,
                                        strictMode: false,
                                        strictModeUntil: null,
                                        strictModeIndefinite: false,
                                        strictModeDurationHours: 4,
                                        strictModeDurationMinutes: 0,
                                        accountabilityContactRequired: false,
                                        accountabilityContactName: '',
                                        accountabilityContactMethod: 'email',
                                        accountabilityContactValue: '',
                                        accountabilityContactVerified: false,
                                        lastEmergencyExit: null,
                                        optimisticBlocking: false,
                                        blockingPaused: false
                                    };
                                    setLocalSettings(prev => ({ ...prev, ...defaultSettings }));
                                }}
                                onRestartTour={onRestartTour}
                                onClose={onClose}
                            />
                        )}
                        {activeTab === 'appearance' && (
                            <AppearanceTab
                                settings={localSettings}
                                updateSetting={updateSetting}
                                theme={theme}
                                onThemeChange={onThemeChange}
                            />
                        )}
                        {activeTab === 'advanced' && (
                            <AdvancedTab
                                settings={localSettings}
                                updateSetting={updateSetting}
                            />
                        )}
                    </div>
                </div>

                {/* Footer with Save/Cancel */}
                <div style={{
                    borderTop: '1px solid var(--border-color)',
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px'
                }}>
                    <button className="neutral-button" onClick={onClose}>Cancel</button>
                    <button
                        className="primary-button"
                        onClick={handleSave}
                        style={{
                            background: JSON.stringify(localSettings) !== JSON.stringify(settings)
                                ? '#22c55e'
                                : undefined,
                            borderColor: JSON.stringify(localSettings) !== JSON.stringify(settings)
                                ? '#22c55e'
                                : undefined
                        }}
                    >
                        Save Changes
                    </button>
                </div>
            </div>


        </div>
    );
}



// Subscription Tab
function SubscriptionTab({ session }) {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [priceIds, setPriceIds] = useState({ monthly: '', yearly: '' }); // Dynamic IDs
    const [referralCode, setReferralCode] = useState(null);
    const [referralStats, setReferralStats] = useState(null);
    const [copied, setCopied] = useState(false);

    // Referral code state (inline on subscription page)
    const [checkoutReferralCode, setCheckoutReferralCode] = useState('');
    const [applyingReferral, setApplyingReferral] = useState(false);
    const [referralApplied, setReferralApplied] = useState(false);
    const [referralError, setReferralError] = useState('');

    const fetchStatusAndConfig = async () => {
        try {
            // Fetch user status
            const resStatus = await fetch(`${config.BACKEND_URL}/api/payments/status`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            let statusData = null;
            if (resStatus.ok) {
                statusData = await resStatus.json();
                setStatus(statusData);
            }

            // Fetch public config (Price IDs)
            const resConfig = await fetch(`${config.BACKEND_URL}/api/payments/config`);
            if (resConfig.ok) {
                const configData = await resConfig.json();
                setPriceIds({
                    monthly: configData.monthlyPriceId,
                    yearly: configData.yearlyPriceId
                });
            }

            // Fetch referral stats for all users (to check if they've already applied a code)
            // But only fetch/generate referral code for paying members
            try {
                const statsData = await getReferralStats(session);
                setReferralStats(statsData);

                // If user was already referred, mark as applied
                if (statsData?.was_referred) {
                    setReferralApplied(true);
                }

                // Only fetch referral code for paying members (plan_tier: 'paid')
                if (statusData?.plan_tier === 'paid') {
                    const codeData = await getReferralCode(session);
                    setReferralCode(codeData.code);
                }
            } catch (refError) {
                console.error('Referral fetch error:', refError);
            }
        } catch (e) {
            console.error('Fetch error:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatusAndConfig();
    }, [session]);

    const handleCopyReferral = async () => {
        if (!referralCode) return;
        try {
            await navigator.clipboard.writeText(referralCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            const textArea = document.createElement('textarea');
            textArea.value = referralCode;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    // Apply referral code
    const applyCheckoutReferral = async () => {
        if (!checkoutReferralCode.trim()) return;
        setApplyingReferral(true);
        setReferralError('');
        try {
            const res = await fetch(`${config.BACKEND_URL}/api/referral/apply`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ code: checkoutReferralCode.trim() })
            });
            const data = await res.json();
            if (res.ok) {
                setReferralApplied(true);
            } else {
                setReferralError(data.error || 'Invalid code');
            }
        } catch (e) {
            setReferralError('Failed to apply code');
        }
        setApplyingReferral(false);
    };

    // Go straight to Stripe checkout
    const handleCheckout = async (priceId) => {
        try {
            const res = await fetch(`${config.BACKEND_URL}/api/payments/create-checkout-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ priceId })
            });
            const data = await res.json();
            if (data.url) window.location.href = data.url;
        } catch (e) {
            alert('Checkout failed: ' + e.message);
        }
    };

    const handlePortal = async () => {
        try {
            const res = await fetch(`${config.BACKEND_URL}/api/payments/portal`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            const data = await res.json();
            if (data.url) window.location.href = data.url;
        } catch (e) {
            alert('Portal failed: ' + e.message);
        }
    };

    const [switchingPlan, setSwitchingPlan] = useState(false);
    const [confirmingUpgrade, setConfirmingUpgrade] = useState(false);
    const [switchError, setSwitchError] = useState(null);

    const handleSwitchToAnnual = async () => {
        if (!confirmingUpgrade) {
            setConfirmingUpgrade(true);
            setSwitchError(null);
            return;
        }
        setSwitchingPlan(true);
        setSwitchError(null);
        try {
            const res = await fetch(`${config.BACKEND_URL}/api/payments/switch-plan`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ targetPriceId: priceIds.yearly })
            });
            const data = await res.json();
            if (data.success) {
                fetchStatusAndConfig();
            } else {
                setSwitchError(data.error || 'Failed to switch plan');
                setConfirmingUpgrade(false);
            }
        } catch (e) {
            setSwitchError('Network error — please try again');
            setConfirmingUpgrade(false);
        } finally {
            setSwitchingPlan(false);
        }
    };

    if (loading) return <div className="settings-tab-content">Loading...</div>;

    // Determine subscription state
    const hasStripeSubscription = status?.status && status.status !== 'none';
    const isActive = status?.is_pro; // active or trialing through Stripe
    const isTrial = status?.trial_active;
    const hasNoSubscription = !status || status.status === 'none';

    // Check if we're still in February promo period
    const now = new Date();
    const marchFirst = new Date('2026-03-01T00:00:00Z');
    const isFebruaryPromo = now < marchFirst;

    return (
        <div className="settings-tab-content">
            <h3 style={{ marginTop: 0 }}>Subscription & Billing</h3>

            <div style={{
                padding: '1.5rem',
                background: isActive ? 'rgba(34, 197, 94, 0.1)' : 'var(--input-bg)',
                border: `1px solid ${isActive ? '#22c55e' : 'var(--border-color)'}`,
                borderRadius: '12px',
                marginBottom: '2rem'
            }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {hasNoSubscription
                        ? 'Free February Access'
                        : isTrial
                            ? 'Trial Active'
                            : `Subscribed — ${status?.billing_interval === 'year' ? 'Annual' : 'Monthly'}`}
                    {isTrial && isFebruaryPromo && (
                        <span style={{
                            fontSize: '0.75rem',
                            background: 'rgba(37, 99, 235, 0.1)',
                            color: '#2563eb',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: '600'
                        }}>
                            FREE February promo
                        </span>
                    )}
                    {status?.cancel_at_period_end && (
                        <span style={{
                            fontSize: '0.75rem',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#dc2626',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: '600'
                        }}>
                            Canceling
                        </span>
                    )}
                </h4>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    {hasNoSubscription
                        ? (isFebruaryPromo
                            ? 'Subscribe now to lock in our launch price — prices may increase after launch. Your free access continues until March 1st.'
                            : 'Subscribe to unlock all features.')
                        : isTrial
                            ? (isFebruaryPromo
                                ? 'Subscribe now to lock in our launch price — prices may increase after launch. Your free access continues until March 1st.'
                                : `Trial active until ${new Date(status.current_period_end).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric' })}`)
                            : status?.cancel_at_period_end
                                ? `Access until ${new Date(status.current_period_end).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })}`
                                : `Renews ${new Date(status.current_period_end).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })}`}
                </p>

                {/* Manage Subscription for paying users */}
                {status?.plan_tier === 'paid' && hasStripeSubscription && (
                    <button
                        className="neutral-button"
                        onClick={handlePortal}
                        style={{ marginTop: '1rem' }}
                    >
                        Manage Subscription
                    </button>
                )}
            </div>

            {/* Upgrade to Annual nudge - only for monthly subscribers */}
            {status?.plan_tier === 'paid' && status?.billing_interval === 'month' && (
                <div style={{
                    padding: '1rem 1.25rem',
                    background: confirmingUpgrade ? 'rgba(37, 99, 235, 0.1)' : 'rgba(37, 99, 235, 0.05)',
                    border: `1px solid rgba(37, 99, 235, ${confirmingUpgrade ? '0.4' : '0.2'})`,
                    borderRadius: '12px',
                    marginBottom: '2rem',
                    transition: 'all 0.2s ease'
                }}>
                    {!confirmingUpgrade ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <p style={{ margin: 0, fontWeight: '600', fontSize: '0.95rem' }}>
                                    Switch to Annual & Save 17%
                                </p>
                                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    $49.99/yr instead of $59.88/yr
                                </p>
                            </div>
                            <button className="primary-button" onClick={handleSwitchToAnnual} style={{ whiteSpace: 'nowrap' }}>
                                Upgrade
                            </button>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ margin: '0 0 0.75rem', fontWeight: '600', fontSize: '0.95rem' }}>
                                Switch to annual billing — $49.99/yr?
                            </p>
                            <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                You'll be credited for your remaining monthly balance.
                            </p>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                                <button
                                    className="primary-button"
                                    onClick={handleSwitchToAnnual}
                                    disabled={switchingPlan}
                                    style={{ minWidth: '100px' }}
                                >
                                    {switchingPlan ? 'Switching...' : 'Confirm'}
                                </button>
                                <button
                                    className="neutral-button"
                                    onClick={() => { setConfirmingUpgrade(false); setSwitchError(null); }}
                                    disabled={switchingPlan}
                                >
                                    Cancel
                                </button>
                            </div>
                            {switchError && (
                                <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#dc2626' }}>
                                    {switchError}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Referee Bonus Section - Show for subscribed users who were referred and have pending bonus */}
            {referralStats?.referee_bonus_pending && referralStats?.is_subscribed && (
                <div style={{
                    padding: '1rem 1.25rem',
                    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.05), rgba(34, 197, 94, 0.1))',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: '12px',
                    marginBottom: '2rem'
                }}>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem', color: '#16a34a' }}>
                        Referral bonus unlocked!
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Free days will be applied to the start of your first paid period.
                    </p>
                </div>
            )}

            {/* Referral Section - Only shown to paying members */}
            {status?.plan_tier === 'paid' && (
            <div style={{
                padding: '1.5rem',
                background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.05), rgba(59, 130, 246, 0.08))',
                border: '1px solid rgba(37, 99, 235, 0.2)',
                borderRadius: '12px',
                marginBottom: '2rem'
            }}>
                <h4 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Refer up to 4 friends
                </h4>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    When they subscribe, you <strong>BOTH</strong> get free days!
                </p>

                {referralCode && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
                        <input
                            type="text"
                            readOnly
                            value={referralCode}
                            onClick={(e) => e.target.select()}
                            style={{
                                flex: 1,
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--input-bg)',
                                color: 'var(--text-primary)',
                                fontSize: '0.85rem',
                                fontFamily: 'monospace'
                            }}
                        />
                        <button
                            onClick={handleCopyReferral}
                            className={copied ? 'primary-button' : 'neutral-button'}
                            style={{
                                minWidth: '80px',
                                background: copied ? '#2563eb' : undefined,
                                borderColor: copied ? '#2563eb' : undefined
                            }}
                        >
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                )}

                {referralStats && (
                    <div style={{ marginTop: '0.75rem' }}>
                        {/* Progress bar for referrals */}
                        <div style={{ marginBottom: '0.75rem' }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: '0.35rem',
                                fontSize: '0.85rem'
                            }}>
                                <span style={{ color: 'var(--text-secondary)' }}>
                                    Referrals: <strong style={{ color: 'var(--text-primary)' }}>{referralStats.converted || 0}</strong> / {referralStats.max_referrals || 4}
                                </span>
                                {referralStats.is_capped ? (
                                    <span style={{ color: '#f59e0b', fontWeight: '600' }}>Maximum reached</span>
                                ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>
                                        {referralStats.referrals_remaining || 4} remaining
                                    </span>
                                )}
                            </div>
                            <div style={{
                                height: '8px',
                                background: 'rgba(37, 99, 235, 0.1)',
                                borderRadius: '4px',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    height: '100%',
                                    width: `${Math.min(100, ((referralStats.converted || 0) / (referralStats.max_referrals || 4)) * 100)}%`,
                                    background: referralStats.is_capped ? '#f59e0b' : '#2563eb',
                                    borderRadius: '4px',
                                    transition: 'width 0.3s ease'
                                }} />
                            </div>
                        </div>

                        {/* Stats row */}
                        <div style={{
                            display: 'flex',
                            gap: '1.5rem',
                            fontSize: '0.85rem',
                            color: 'var(--text-secondary)'
                        }}>
                            {referralStats.pending > 0 && (
                                <div>
                                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{referralStats.pending}</span> pending
                                </div>
                            )}
                            {/* Show earned bonus days */}
                            {(referralStats.total_days_earned || 0) > 0 && (
                                <div style={{ color: '#16a34a' }}>
                                    <span style={{ fontWeight: '600' }}>+{referralStats.total_days_earned}</span> days earned
                                </div>
                            )}
                            {/* Show pending bonus days */}
                            {(referralStats.pending_days || 0) > 0 && (
                                <div style={{ color: '#d97706' }}>
                                    <span style={{ fontWeight: '600' }}>+{referralStats.pending_days}</span> days pending<sup style={{ fontSize: '0.6em', marginLeft: '1px' }}>*</sup>
                                </div>
                            )}
                        </div>
                        {/* Show note for pending bonus days */}
                        {referralStats.pending_days > 0 && (
                            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                *Pending days are activated when your referee starts their first paid period, and applied to the start of yours.
                            </p>
                        )}
                    </div>
                )}
            </div>
            )}

            {/* Show plan selection for trial users (plan_tier: 'free') or users without subscription */}
            {(status?.plan_tier === 'free' || hasNoSubscription) && (
                <div>
                    <h4 style={{ marginBottom: '0.5rem' }}>
                        Choose Your Plan
                    </h4>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
                        {isFebruaryPromo
                            ? 'Subscribe now. Billing starts March 1st.'
                            : 'Your card will be charged after your trial ends.'}
                    </p>

                    {/* Referral code section - inline on the page */}
                    {!referralApplied && (
                        <div style={{
                            padding: '1rem 1.25rem',
                            background: 'var(--input-bg)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '10px',
                            marginBottom: '1.5rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ fontSize: '0.95rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                    Referral code?
                                </span>
                                <input
                                    type="text"
                                    placeholder="BEACON-XXXXXX"
                                    value={checkoutReferralCode}
                                    onChange={(e) => {
                                        let value = e.target.value.toUpperCase();
                                        if (value.includes('REF=')) {
                                            const match = value.match(/REF=(BEACON-[A-Z0-9]+)/i);
                                            if (match) value = match[1].toUpperCase();
                                        }
                                        setCheckoutReferralCode(value);
                                    }}
                                    style={{
                                        flex: 1,
                                        padding: '0.5rem 0.75rem',
                                        fontSize: '0.9rem',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)',
                                        textTransform: 'uppercase',
                                        background: 'var(--card-bg)',
                                        color: 'var(--text-primary)',
                                        fontFamily: 'monospace'
                                    }}
                                />
                                <button
                                    onClick={applyCheckoutReferral}
                                    disabled={applyingReferral || !checkoutReferralCode.trim()}
                                    className="primary-button"
                                    style={{
                                        padding: '0.5rem 1rem',
                                        opacity: applyingReferral || !checkoutReferralCode.trim() ? 0.5 : 1
                                    }}
                                >
                                    {applyingReferral ? '...' : 'Apply'}
                                </button>
                            </div>
                            {referralError && (
                                <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>{referralError}</p>
                            )}
                        </div>
                    )}

                    {referralApplied && (
                        <div style={{
                            padding: '0.75rem 1rem',
                            background: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid #22c55e',
                            borderRadius: '8px',
                            marginBottom: '1.5rem',
                            color: '#16a34a',
                            fontSize: '0.95rem'
                        }}>
                            ✓ Referral code applied! You'll both get at least 2 weeks free!
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div style={{
                            padding: '1.5rem', border: '1px solid var(--border-color)', borderRadius: '12px',
                            background: 'var(--card-bg)'
                        }}>
                            <h3 style={{ marginTop: 0 }}>Monthly</h3>
                            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.5rem 0' }}>$4.99<span style={{ fontSize: '1rem', fontWeight: 'normal' }}>/mo</span></p>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                Billed monthly
                            </p>
                            <button
                                className="primary-button"
                                style={{ width: '100%', opacity: !priceIds.monthly ? 0.5 : 1 }}
                                disabled={!priceIds.monthly}
                                onClick={() => handleCheckout(priceIds.monthly)}
                            >
                                {isTrial ? 'Select Monthly' : 'Get Started'}
                            </button>
                        </div>
                        <div style={{
                            padding: '1.5rem', border: '2px solid var(--primary-blue)', borderRadius: '12px',
                            background: 'rgba(37, 99, 235, 0.05)', position: 'relative'
                        }}>
                            <div style={{
                                position: 'absolute', top: '-10px', right: '20px', background: 'var(--primary-blue)', color: 'white',
                                padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold'
                            }}>SAVE 17%</div>
                            <h3 style={{ marginTop: 0 }}>Yearly</h3>
                            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.5rem 0' }}>$49.99<span style={{ fontSize: '1rem', fontWeight: 'normal' }}>/yr</span></p>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                Billed annually
                            </p>
                            <button
                                className="primary-button"
                                style={{ width: '100%', opacity: !priceIds.yearly ? 0.5 : 1 }}
                                disabled={!priceIds.yearly}
                                onClick={() => handleCheckout(priceIds.yearly)}
                            >
                                {isTrial ? 'Select Yearly' : 'Get Started'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Analytics & Insights Tab
function AnalyticsTab({ settings, updateSetting, session }) {
    const [weeklyReportEnabled, setWeeklyReportEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [currentStats, setCurrentStats] = useState(null);

    // Fetch email preferences and current stats on mount
    useEffect(() => {
        const fetchData = async () => {
            try {
                const token = session?.access_token;
                if (!token) return;

                const headers = { 'Authorization': `Bearer ${token}` };

                // Fetch email preferences
                const prefsRes = await fetch(`${config.BACKEND_URL}/api/email-preferences`, { headers });
                if (prefsRes.ok) {
                    const prefs = await prefsRes.json();
                    setWeeklyReportEnabled(prefs.weekly_report_enabled || false);
                }

                // Fetch current week stats
                const statsRes = await fetch(`${config.BACKEND_URL}/api/weekly-stats/current`, { headers });
                if (statsRes.ok) {
                    const stats = await statsRes.json();
                    setCurrentStats(stats);
                }
            } catch (error) {
                console.error('Error fetching analytics data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [session]);

    const toggleWeeklyReport = async () => {
        setSaving(true);
        try {
            const token = session?.access_token;
            const newValue = !weeklyReportEnabled;

            const res = await fetch(`${config.BACKEND_URL}/api/email-preferences`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ weekly_report_enabled: newValue })
            });

            if (res.ok) {
                setWeeklyReportEnabled(newValue);
            }
        } catch (error) {
            console.error('Error updating email preferences:', error);
        } finally {
            setSaving(false);
        }
    };

    // Category label mapping
    const categoryLabels = {
        social: 'Social Media',
        shorts: 'Short-Form Videos',
        news: 'News',
        entertainment: 'Entertainment',
        streaming: 'Streaming',
        games: 'Gaming',
        shopping: 'Shopping',
        forums: 'Forums',
        ai_chatbots: 'AI / Chatbots',
        communication: 'Communication',
        wikis: 'Wikis / Rabbit Holes',
        mature: 'Mature Content',
        productivity: 'Productivity',
        block_list: 'Block List',
        other: 'Other'
    };

    return (
        <div className="settings-tab-content">
            <h3 style={{ marginTop: 0 }}>Analytics & Insights</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem' }}>
                Track your productivity and get personalized weekly reports.
            </p>

            {/* Weekly Report Opt-in */}
            <div style={{
                marginBottom: '2rem',
                padding: '1.5rem',
                background: 'var(--input-bg)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                        <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Weekly Focus Report
                        </h4>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                            Get a personalized email every Monday with your focus stats, top distractions blocked, and how you compare to other users.
                        </p>
                    </div>
                    <label className="toggle-switch" style={{ marginLeft: '16px' }}>
                        <input
                            type="checkbox"
                            checked={weeklyReportEnabled}
                            onChange={toggleWeeklyReport}
                            disabled={loading || saving}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </div>
                {weeklyReportEnabled && (
                    <div style={{
                        marginTop: '1rem',
                        padding: '12px',
                        background: 'rgba(34, 197, 94, 0.1)',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        color: '#166534'
                    }}>
                        You'll receive your first report next Monday at 9 AM (UTC).
                    </div>
                )}

            </div>

            {/* Current Week Stats */}
            <div style={{
                padding: '1.5rem',
                background: 'var(--input-bg)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)'
            }}>
                <h4 style={{ marginTop: 0, marginBottom: '1rem' }}>This Week's Progress</h4>
                {loading ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading stats...</p>
                ) : currentStats && (currentStats.total_blocks > 0 || currentStats.total_allows > 0) ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
                        <div style={{
                            padding: '1rem',
                            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            borderRadius: '10px',
                            color: 'white',
                            textAlign: 'center'
                        }}>
                            <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>{currentStats.total_blocks}</p>
                            <p style={{ fontSize: '0.85rem', margin: '4px 0 0 0', opacity: 0.9 }}>Distractions Blocked</p>
                        </div>
                        <div style={{
                            padding: '1rem',
                            background: 'var(--card-bg)',
                            borderRadius: '10px',
                            border: '1px solid var(--border-color)',
                            textAlign: 'center'
                        }}>
                            <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0, color: 'var(--text-primary)' }}>{currentStats.consecutive_active_days || 0}</p>
                            <p style={{ fontSize: '0.85rem', margin: '4px 0 0 0', color: 'var(--text-secondary)' }}>Day Streak</p>
                        </div>
                        {currentStats.blocks_by_category && Object.keys(currentStats.blocks_by_category).length > 0 && (
                            <div style={{ gridColumn: 'span 2' }}>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Top Blocked Categories:</p>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {Object.entries(currentStats.blocks_by_category)
                                        .filter(([cat]) => cat !== 'other')
                                        .sort((a, b) => b[1] - a[1])
                                        .slice(0, 3)
                                        .map(([cat, count]) => (
                                            <span key={cat} style={{
                                                padding: '4px 12px',
                                                background: 'var(--hover-bg)',
                                                borderRadius: '12px',
                                                fontSize: '0.85rem',
                                                color: 'var(--text-primary)'
                                            }}>
                                                {categoryLabels[cat] || cat}: {count}
                                            </span>
                                        ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                        <p style={{ fontSize: '2.5rem', margin: '0 0 12px 0' }}>🎯</p>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                            No blocking activity yet this week.<br />
                            Start browsing and your stats will appear here!
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

// Activity & Privacy Tab
function ActivityTab({ settings, updateSetting, storageUsage }) {
    // Our block history limit is ~750KB (1000 entries × 750 bytes average)
    const ourMaxBytes = 768000; // 750 KB
    const storagePercent = storageUsage ? (storageUsage.used / ourMaxBytes) * 100 : 0;
    const storageMB = storageUsage ? (storageUsage.used / 1024 / 1024).toFixed(2) : '0';
    const storageKB = storageUsage ? (storageUsage.used / 1024).toFixed(1) : '0';
    const maxKB = (ourMaxBytes / 1024).toFixed(0);

    // Use KB for values under 0.1 MB
    const displaySize = parseFloat(storageMB) < 0.1 ? `${storageKB} KB` : `${storageMB} MB`;
    // Minimum 2% width so tiny amounts are visible
    const barWidth = Math.max(storagePercent, storagePercent > 0 ? 2 : 0);

    // Two-click confirmation for Clear All History
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    return (
        <div className="settings-tab-content">
            <h3 style={{ marginTop: 0 }}>Activity & Privacy</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem' }}>
                Manage your browsing history and storage
            </p>

            <div style={{ marginBottom: '2rem' }}>
                <h4>Storage Usage</h4>
                <div style={{ marginTop: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.9rem' }}>Browsing Activity</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>{displaySize} / {maxKB} KB</span>
                    </div>
                    <div className="storage-progress-bar" style={{
                        width: '100%',
                        height: '8px',
                        background: 'var(--border-color)',
                        borderRadius: '4px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            width: `${barWidth}%`,
                            height: '100%',
                            background: storagePercent > 80 ? '#ef4444' : storagePercent > 50 ? '#f59e0b' : '#10b981',
                            transition: 'width 0.3s ease'
                        }}></div>
                    </div>
                    {storagePercent > 80 && (
                        <p style={{ fontSize: '0.85rem', color: '#ef4444', marginTop: '8px' }}>
                            ⚠️ Storage is nearly full. Consider clearing old history.
                        </p>
                    )}
                </div>

                <button
                    className={`destructive-button ${showClearConfirm ? 'confirming' : ''}`}
                    style={{ marginTop: '1rem' }}
                    onClick={() => {
                        if (showClearConfirm) {
                            // Second click - actually clear
                            document.dispatchEvent(new CustomEvent('BEACON_CLEAR_BLOCK_LOG'));
                            window.dispatchEvent(new CustomEvent('BEACON_RULES_UPDATED'));
                            setShowClearConfirm(false);
                            // Request updated storage usage after a short delay
                            setTimeout(() => {
                                document.dispatchEvent(new CustomEvent('BEACON_GET_STORAGE_USAGE'));
                            }, 500);
                        } else {
                            // First click - show confirmation
                            setShowClearConfirm(true);
                            // Auto-reset after 3 seconds if not clicked
                            setTimeout(() => setShowClearConfirm(false), 3000);
                        }
                    }}
                >
                    {showClearConfirm ? 'Confirm Clear?' : 'Clear History'}
                </button>
            </div>

            {/* Auto-Delete Activity Log Section */}
            <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h4 style={{ margin: 0 }}>Auto-Delete Activity Log</h4>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
                            Automatically remove old entries from your block history for privacy
                        </p>
                    </div>
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={settings.autoDeleteActivityLog ?? false}
                            onChange={(e) => {
                                updateSetting('autoDeleteActivityLog', e.target.checked);
                                // Sync to extension
                                document.dispatchEvent(new CustomEvent('BEACON_ACTIVITY_LOG_SETTINGS_SYNC', {
                                    detail: { autoDelete: e.target.checked, retentionDays: settings.activityLogRetention ?? 7, logAllowDecisions: settings.logAllowDecisions, logCachedDecisions: settings.logCachedDecisions ?? false }
                                }));
                            }}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </div>

                {settings.autoDeleteActivityLog && (
                    <div style={{ marginTop: '1rem', paddingLeft: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', fontWeight: '500' }}>
                            Delete entries older than:
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {[
                                { label: '7 Days', value: 7 },
                                { label: '30 Days', value: 30 },
                            ].map(option => (
                                <button
                                    key={option.value}
                                    className={`preset-btn ${settings.activityLogRetention === option.value ? 'active' : ''}`}
                                    onClick={() => {
                                        updateSetting('activityLogRetention', option.value);
                                        // Sync to extension
                                        document.dispatchEvent(new CustomEvent('BEACON_ACTIVITY_LOG_SETTINGS_SYNC', {
                                            detail: { autoDelete: settings.autoDeleteActivityLog, retentionDays: option.value, logAllowDecisions: settings.logAllowDecisions, logCachedDecisions: settings.logCachedDecisions ?? false }
                                        }));
                                    }}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                            This only affects local data stored in your browser.
                        </p>
                    </div>
                )}
            </div>

            {/* Log Allowed Sites Toggle */}
            <div className="settings-item" style={{ marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                        <h4 style={{ marginBottom: '0.25rem' }}>Log Allowed Sites</h4>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                            When enabled, your browsing activity will include sites that were checked but allowed (not just blocks).
                        </p>
                    </div>
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={settings.logAllowDecisions ?? false}
                            onChange={(e) => {
                                updateSetting('logAllowDecisions', e.target.checked);
                                // Sync to extension
                                document.dispatchEvent(new CustomEvent('BEACON_ACTIVITY_LOG_SETTINGS_SYNC', {
                                    detail: {
                                        autoDelete: settings.autoDeleteActivityLog,
                                        retentionDays: settings.activityLogRetention ?? 7,
                                        logAllowDecisions: e.target.checked,
                                        logCachedDecisions: settings.logCachedDecisions ?? false
                                    }
                                }));
                            }}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </div>
            </div>

            {/* Log Cached Decisions Toggle */}
            <div className="settings-item" style={{ marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                        <h4 style={{ marginBottom: '0.25rem' }}>Log Cached Decisions</h4>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                            When enabled, repeat visits that use a cached result will also appear in your activity log.
                        </p>
                    </div>
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={settings.logCachedDecisions ?? false}
                            onChange={(e) => {
                                updateSetting('logCachedDecisions', e.target.checked);
                                // Sync to extension
                                document.dispatchEvent(new CustomEvent('BEACON_ACTIVITY_LOG_SETTINGS_SYNC', {
                                    detail: {
                                        autoDelete: settings.autoDeleteActivityLog,
                                        retentionDays: settings.activityLogRetention ?? 7,
                                        logAllowDecisions: settings.logAllowDecisions ?? false,
                                        logCachedDecisions: e.target.checked
                                    }
                                }));
                            }}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </div>
            </div>

            <div style={{ marginTop: '2rem' }}>
                <h4>Performance & Caching</h4>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '1rem' }}>
                    Beacon Blocker uses intelligent caching to minimize AI calls and maximize speed:
                </p>
                <ul style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.8', margin: 0, paddingLeft: '1.5rem' }}>
                    <li>Maximum 1,000 recent blocks stored locally (~750KB)</li>
                    <li>Oldest entries automatically removed when limit reached</li>
                    <li>Cache cleared automatically when you update your rules</li>
                    <li>Each preset maintains its own cache for efficiency</li>
                </ul>
            </div>
        </div>
    );
}

// Blocking Behavior Tab
function BlockingTab({ settings, updateSetting, onActivateStrictMode, strictModeClickedOnce, session }) {
    const isStrictModeActive = settings.strictModeUntil && settings.strictModeUntil > Date.now();
    const isIndefinite = settings.strictModeIndefinite || false;

    // Backend contact state
    const [backendContact, setBackendContact] = useState(null);
    const [contactLoading, setContactLoading] = useState(false);
    const [contactError, setContactError] = useState(null);

    // Unlock request state
    const [unlockRequest, setUnlockRequest] = useState(null);
    const [unlockRequestMessage, setUnlockRequestMessage] = useState(''); // New state for reason
    const [unlockLoading, setUnlockLoading] = useState(false);
    const [unlockError, setUnlockError] = useState(null);

    // New actions state
    const [resendLoading, setResendLoading] = useState(false);
    const [resendSuccess, setResendSuccess] = useState(false);
    const [resendError, setResendError] = useState(null);
    const [emergencyLoading, setEmergencyLoading] = useState(false);
    const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);
    const [emergencyBypassInfo, setEmergencyBypassInfo] = useState({ available: true, cooldown: null });
    const [toast, setToast] = useState(null); // { type: 'success' | 'error', message: string }

    // Fetch backend contact and unlock status on mount
    useEffect(() => {
        if (session) {
            fetchContact();
            fetchUnlockStatus(); // Fetch emergency bypass availability on mount
        }
    }, [session]);

    // Track when strict mode was activated to filter out stale requests
    const strictModeActivatedAt = React.useRef(null);
    const previousUnlockStatus = React.useRef(null);

    // Poll for unlock status when strict mode active and request pending
    useEffect(() => {
        // When strict mode becomes active, record the activation time and clear old state
        if (isStrictModeActive && !strictModeActivatedAt.current) {
            strictModeActivatedAt.current = Date.now();
            setUnlockRequest(null); // Clear any stale requests
            previousUnlockStatus.current = null; // Reset the transition tracker
        }
        // When strict mode becomes inactive, clear the activation time
        if (!isStrictModeActive) {
            strictModeActivatedAt.current = null;
        }

        // Fetch status when strict mode is active (with small delay to let state settle)
        if (isStrictModeActive) {
            setTimeout(() => fetchUnlockStatus(), 100);
        }
        // Then poll only if there's a pending request
        if (isStrictModeActive && unlockRequest?.status === 'pending') {
            const interval = setInterval(fetchUnlockStatus, 10000);
            return () => clearInterval(interval);
        }
    }, [isStrictModeActive, unlockRequest?.status]);

    // AUTO-DEACTIVATE: When unlock request changes from pending to approved, deactivate strict mode
    // We use a ref to track the previous status so we only trigger on NEW approvals
    // NOTE: previousUnlockStatus is declared near strictModeActivatedAt ref above
    useEffect(() => {
        const currentStatus = unlockRequest?.status;
        const wasJustApproved = previousUnlockStatus.current === 'pending' && currentStatus === 'approved';

        if (wasJustApproved && isStrictModeActive) {
            console.log('[UNLOCK] Request just approved - deactivating Strict Mode');
            // Deactivate strict mode by clearing the timer
            updateSetting('strictModeUntil', null);
            updateSetting('strictModeIndefinite', false);
            // Show success toast
            setToast({ type: 'success', message: 'Strict Mode deactivated! Your request was approved.' });
            setTimeout(() => setToast(null), 5000);
            // Clear the unlock request state
            setUnlockRequest(null);
        }

        // Track the status for next comparison
        previousUnlockStatus.current = currentStatus;
    }, [unlockRequest?.status, isStrictModeActive]);

    const fetchContact = async () => {
        try {
            setContactLoading(true);
            const data = await getAccountabilityContact(session);
            setBackendContact(data.contact);
            setContactError(null);
        } catch (err) {
            console.error('Error fetching contact:', err);
            setContactError(err.message);
        } finally {
            setContactLoading(false);
        }
    };

    const fetchUnlockStatus = async () => {
        try {
            const data = await getUnlockStatus(session);
            setUnlockRequest(data.request);
            if (data.emergencyBypass) {
                setEmergencyBypassInfo(data.emergencyBypass);
            }
        } catch (err) {
            console.error('Error fetching unlock status:', err);
        }
    };

    const handleInviteContact = async () => {
        if (!settings.accountabilityContactName || !settings.accountabilityContactValue) {
            setContactError('Please enter contact name and email');
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(settings.accountabilityContactValue)) {
            setContactError('Please enter a valid email address');
            return;
        }
        try {
            setContactLoading(true);
            setContactError(null);
            await inviteAccountabilityContact(
                session,
                settings.accountabilityContactName,
                settings.accountabilityContactValue
            );
            await fetchContact();
        } catch (err) {
            setContactError(err.message);
        } finally {
            setContactLoading(false);
        }
    };

    const handleRemoveContact = async () => {
        if (isStrictModeActive) {
            setContactError('Cannot remove contact while Strict Mode is active');
            return;
        }
        try {
            setContactLoading(true);
            await removeAccountabilityContact(session);
            setBackendContact(null);
            setContactError(null);
        } catch (err) {
            setContactError(err.message);
        } finally {
            setContactLoading(false);
        }
    };

    const handleRequestUnlock = async () => {
        try {
            setUnlockLoading(true);
            setUnlockError(null);
            // Pass the message to the API
            const data = await requestUnlock(session, unlockRequestMessage);
            setUnlockRequest(data);
            // Clear message
            setUnlockRequestMessage('');
        } catch (err) {
            setUnlockError(err.message);
        } finally {
            setUnlockLoading(false);
        }
    };

    const handleResendInvite = async () => {
        try {
            setResendLoading(true);
            setResendSuccess(false);
            setResendError(null);
            await resendInvitation(session);
            setResendSuccess(true);
            setTimeout(() => setResendSuccess(false), 5000); // Clear success after 5s
        } catch (err) {
            setResendError(err.message);
            setTimeout(() => setResendError(null), 5000);
        } finally {
            setResendLoading(false);
        }
    };

    const handleEmergencyRecovery = async () => {
        // Note: UI confirmation is already handled by showEmergencyConfirm state
        try {
            setEmergencyLoading(true);
            const data = await requestEmergencyRecovery(session);
            setUnlockRequest(data); // Updates the UI with key info
            setShowEmergencyConfirm(false); // Close the confirm UI

            // Deactivate strict mode locally (backend already cleared it)
            if (data.strictModeDisabled) {
                updateSetting('strictModeUntil', null);
                updateSetting('strictModeIndefinite', false);
            }

            // Show toast with the API message
            setToast({ type: 'success', message: data.message || 'Emergency recovery started.' });
            // Auto-dismiss toast after 5 seconds
            setTimeout(() => setToast(null), 5000);
        } catch (err) {
            setToast({ type: 'error', message: 'Failed to start recovery: ' + err.message });
            setTimeout(() => setToast(null), 5000);
        } finally {
            setEmergencyLoading(false);
        }
    };

    // Countdown timer logic
    const [remainingTime, setRemainingTime] = useState(0);

    useEffect(() => {
        if (!isStrictModeActive || !settings.strictModeUntil) return;

        const updateTimer = () => {
            const now = Date.now();
            const end = settings.strictModeUntil;
            const diff = Math.max(0, Math.floor((end - now) / 1000));
            setRemainingTime(diff);
        };

        updateTimer(); // Initial call
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [isStrictModeActive, settings.strictModeUntil]);

    // calculate derived hours/minutes for other uses if needed, or remove if unused.
    // For now, removing the old getTimeRemaining as we use remainingTime state directly.

    // Preset button handler
    const setPresetDuration = (hours) => {
        updateSetting('strictModeDurationHours', hours);
        updateSetting('strictModeDurationMinutes', 0);
        updateSetting('strictModeIndefinite', false);
    };

    // Check if a preset is selected
    const isPresetSelected = (hours) => {
        return !isIndefinite &&
            settings.strictModeDurationHours === hours &&
            (settings.strictModeDurationMinutes === 0 || !settings.strictModeDurationMinutes);
    };

    // Toggle indefinite mode
    const toggleIndefinite = () => {
        const newValue = !isIndefinite;
        updateSetting('strictModeIndefinite', newValue);
        if (newValue) {
            // Indefinite mode requires accountability contact
            updateSetting('accountabilityContactRequired', true);
        }
    };

    // Validate and check if can activate
    const canActivate = () => {
        const hasValidDuration = isIndefinite ||
            (settings.strictModeDurationHours || 0) > 0 ||
            (settings.strictModeDurationMinutes || 0) > 0;

        // If indefinite, must have verified backend contact
        if (isIndefinite && (!backendContact || backendContact.status !== 'verified')) {
            return false;
        }

        return hasValidDuration;
    };

    return (
        <div className="settings-tab-content">
            {/* Toast Notification */}
            {toast && (
                <div className={`toast-notification ${toast.type}`}>
                    <span className="toast-message">{toast.message}</span>
                    <button className="toast-close" onClick={() => setToast(null)}>×</button>
                </div>
            )}

            {/* Emergency Bypass Active Banner */}
            {unlockRequest?.isEmergency && unlockRequest?.status === 'pending' && (() => {
                const expiresAt = new Date(unlockRequest.expiresAt);
                const now = new Date();
                const hoursRemaining = Math.max(0, Math.ceil((expiresAt - now) / (1000 * 60 * 60)));

                return (
                    <div style={{
                        background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                        border: '2px solid #f59e0b',
                        borderRadius: '12px',
                        padding: '1rem',
                        marginBottom: '1.5rem',
                        textAlign: 'center'
                    }}>
                        <p style={{ margin: '0 0 8px 0', fontWeight: '600', color: '#92400e', fontSize: '1rem' }}>
                            ⏳ Emergency Bypass Active
                        </p>
                        <p style={{ margin: 0, color: '#b45309', fontSize: '1.1rem', fontWeight: '600' }}>
                            {hoursRemaining > 0
                                ? `${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''} remaining`
                                : 'Expiring soon...'
                            }
                        </p>
                        {backendContact?.status === 'verified' && (
                            <p style={{ margin: '8px 0 0 0', color: '#92400e', fontSize: '0.8rem' }}>
                                Your contact has been notified and can cancel this.
                            </p>
                        )}
                    </div>
                );
            })()}

            <h3 style={{ marginTop: 0 }}>Blocking Behavior</h3>

            {/* --- PAUSE BLOCKING CARD --- */}
            <div className={`settings-card ${settings.blockingPaused ? 'highlight-warning' : ''}`} style={{ opacity: isStrictModeActive ? 0.5 : 1 }}>
                <div className="settings-card-header">
                    <div>
                        <h4 className="settings-card-title">
                            {settings.blockingPaused ? 'Blocking is Paused' : 'Blocking is Active'}
                        </h4>
                        <p className="settings-card-desc">
                            {isStrictModeActive
                                ? 'Cannot pause while Strict Mode is active'
                                : settings.blockingPaused
                                    ? 'All pages will load normally without blocking'
                                    : 'Beacon Blocker is actively filtering content'
                            }
                        </p>
                    </div>
                    <button
                        className={settings.blockingPaused ? 'success-button fixed-action-btn' : 'neutral-button fixed-action-btn'}
                        onClick={() => {
                            if (isStrictModeActive) return;
                            const newPaused = !settings.blockingPaused;
                            updateSetting('blockingPaused', newPaused);
                            syncPauseToExtension(newPaused);
                        }}
                        disabled={isStrictModeActive}
                    >
                        {settings.blockingPaused ? 'Resume' : 'Pause'}
                    </button>
                </div>
            </div>

            {/* --- STRICT MODE CARD --- */}
            <div className="settings-card">
                <div className="settings-card-header">
                    <div>
                        <label className="settings-card-title" style={{ display: 'block' }}>
                            Strict Mode: {isStrictModeActive ? 'Active' : 'Inactive'}
                        </label>
                        <p className="settings-card-desc">
                            {isStrictModeActive
                                ? (isIndefinite
                                    ? 'Indefinite mode — your rules are locked until unlocked by your accountability contact'
                                    : 'Your rules are locked until the timer expires')
                                : 'Lock your rules for a set duration to prevent changes'}
                        </p>
                    </div>
                </div>

                {/* Active Mode Timer (Centered Below Header) */}
                {isStrictModeActive && (
                    <div className="strict-mode-timer-v2" style={{ marginTop: '1rem', width: '100%', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
                        {isIndefinite ? (
                            <span className="timer-value" style={{ fontSize: '1.5rem', letterSpacing: '1px' }}>
                                STRICT MODE
                            </span>
                        ) : (
                            <span className="timer-value">
                                {String(Math.floor(remainingTime / 3600)).padStart(2, '0')}:
                                {String(Math.floor((remainingTime % 3600) / 60)).padStart(2, '0')}:
                                {String(remainingTime % 60).padStart(2, '0')}
                            </span>
                        )}
                    </div>
                )}

                {/* Active Mode: Unlock Options */}
                {isStrictModeActive ? (
                    <div style={{ marginTop: '1rem' }}>

                        {/* === SECTION A: Contact-Based Unlock (if contact exists) === */}
                        {backendContact?.status === 'verified' && (
                            <div style={{
                                background: 'rgba(37, 99, 235, 0.05)',
                                border: '1px solid rgba(37, 99, 235, 0.2)',
                                borderRadius: '8px',
                                padding: '1rem',
                                marginBottom: '1rem'
                            }}>
                                <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: '600' }}>
                                    Request Unlock from {backendContact.name || 'Contact'}
                                </h5>

                                {/* Error display */}
                                {unlockError && (
                                    <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{unlockError}</p>
                                )}

                                {/* Status display with refresh */}
                                {unlockRequest?.status === 'pending' ? (
                                    <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '6px' }}>
                                        <p style={{ margin: 0, fontWeight: '500', color: 'var(--text-primary)' }}>
                                            Waiting for {backendContact.name || 'contact'}...
                                        </p>
                                        <p className="settings-card-desc" style={{ marginTop: '4px', marginBottom: '8px' }}>
                                            Expires: {new Date(unlockRequest.expiresAt).toLocaleString()}
                                        </p>
                                        <button
                                            className="neutral-button"
                                            onClick={fetchUnlockStatus}
                                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                        >
                                            Refresh Status
                                        </button>

                                    </div>
                                ) : unlockRequest?.status === 'approved' ? (
                                    <div style={{ textAlign: 'center' }}>
                                        <p style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: '#10b981' }}>Request Approved!</p>
                                        <p className="settings-card-desc">Strict Mode will be disabled shortly.</p>
                                    </div>
                                ) : unlockRequest?.status === 'denied' ? (
                                    <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
                                        <p style={{ margin: 0, fontSize: '0.9rem', color: '#ef4444', marginBottom: '8px' }}>Request denied by {backendContact.name || 'contact'}.</p>
                                    </div>
                                ) : null}

                                {/* Reason field + Send button (show when not pending) */}
                                {unlockRequest?.status !== 'pending' && unlockRequest?.status !== 'approved' && (
                                    <>
                                        <textarea
                                            className="prompt-textarea"
                                            placeholder="Why do you need to unlock early? (optional)"
                                            value={unlockRequestMessage}
                                            onChange={(e) => setUnlockRequestMessage(e.target.value)}
                                            rows={2}
                                            style={{ fontSize: '0.9rem', marginBottom: '0.75rem', width: '100%', boxSizing: 'border-box' }}
                                            disabled={unlockLoading}
                                        />
                                        <button
                                            className="primary-button"
                                            onClick={handleRequestUnlock}
                                            disabled={unlockLoading}
                                            style={{ width: '100%', justifyContent: 'center' }}
                                        >
                                            {unlockLoading ? 'Sending Request...' : 'Request Early Unlock'}
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Message when no contact is set up */}
                        {(!backendContact || backendContact.status !== 'verified') && (
                            <p className="settings-card-desc" style={{ marginBottom: '1rem', textAlign: 'center', fontStyle: 'italic' }}>
                                Set up an accountability contact to enable instant unlock requests.
                            </p>
                        )}

                        {/* === SECTION B: Emergency Bypass === */}
                        <div style={{
                            paddingTop: '1rem',
                            borderTop: '1px solid var(--border-color)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <h5 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                                    Emergency Bypass
                                </h5>
                                {emergencyBypassInfo.available ? (
                                    <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '10px',
                                        fontSize: '0.7rem',
                                        fontWeight: '600',
                                        background: 'rgba(34, 197, 94, 0.15)',
                                        color: '#166534'
                                    }}>
                                        1 Available
                                    </span>
                                ) : (
                                    <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '10px',
                                        fontSize: '0.7rem',
                                        fontWeight: '600',
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        color: '#991b1b'
                                    }}>
                                        {emergencyBypassInfo.cooldown?.days > 0
                                            ? `${emergencyBypassInfo.cooldown.days}d ${emergencyBypassInfo.cooldown.hours}h`
                                            : `${emergencyBypassInfo.cooldown?.hours || 0}h`
                                        } cooldown
                                    </span>
                                )}
                            </div>
                            <p className="settings-card-desc" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>
                                Immediately disable Strict Mode.
                                {backendContact?.status === 'verified' && ' Your contact will be notified.'}
                            </p>

                            {!showEmergencyConfirm ? (
                                <button
                                    className="destructive-button"
                                    onClick={() => setShowEmergencyConfirm(true)}
                                    disabled={emergencyLoading || !emergencyBypassInfo.available}
                                    style={{ width: '100%', justifyContent: 'center', opacity: !emergencyBypassInfo.available ? 0.5 : 1 }}
                                >
                                    {emergencyBypassInfo.available ? 'Start Emergency Bypass' : 'On Cooldown'}
                                </button>
                            ) : (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        className="neutral-button"
                                        onClick={() => setShowEmergencyConfirm(false)}
                                        style={{ flex: 1 }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className="destructive-button"
                                        onClick={handleEmergencyRecovery}
                                        disabled={emergencyLoading}
                                        style={{ flex: 1, justifyContent: 'center' }}
                                    >
                                        {emergencyLoading ? 'Starting...' : 'Confirm'}
                                    </button>
                                </div>
                            )}
                            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                Available once per week
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Configuration Controls */}
                        <div style={{
                            background: '#fef3c7',
                            border: '1px solid #f59e0b',
                            borderRadius: '8px',
                            padding: '1rem',
                            marginBottom: '1.5rem'
                        }}>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: '#92400e', fontWeight: '500' }}>
                                Once activated, you cannot disable Strict Mode until the timer expires.
                            </p>
                        </div>

                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Duration</label>
                        <div className="duration-inputs">
                            <div className="duration-field">
                                <button
                                    className="stepper-btn"
                                    disabled={isIndefinite || (settings.strictModeDurationHours || 0) <= 0}
                                    onClick={() => updateSetting('strictModeDurationHours', Math.max(0, (settings.strictModeDurationHours || 0) - 1))}
                                >−</button>
                                <span className="duration-value">{isIndefinite ? '–' : (settings.strictModeDurationHours || 0)}</span>
                                <button
                                    className="stepper-btn"
                                    disabled={isIndefinite || (settings.strictModeDurationHours || 0) >= 24}
                                    onClick={() => updateSetting('strictModeDurationHours', Math.min(24, (settings.strictModeDurationHours || 0) + 1))}
                                >+</button>
                                <span style={{ color: 'var(--text-secondary)' }}>hr</span>
                            </div>
                            <div className="duration-field">
                                <button
                                    className="stepper-btn"
                                    disabled={isIndefinite}
                                    onClick={() => {
                                        const currentMin = settings.strictModeDurationMinutes || 0;
                                        const currentHr = settings.strictModeDurationHours || 0;
                                        if (currentMin <= 0) {
                                            if (currentHr > 0) {
                                                updateSetting('strictModeDurationMinutes', 55);
                                                updateSetting('strictModeDurationHours', currentHr - 1);
                                            }
                                        } else {
                                            updateSetting('strictModeDurationMinutes', currentMin - 5);
                                        }
                                    }}
                                >−</button>
                                <span className="duration-value">{isIndefinite ? '–' : (settings.strictModeDurationMinutes || 0)}</span>
                                <button
                                    className="stepper-btn"
                                    disabled={isIndefinite}
                                    onClick={() => {
                                        const currentMin = settings.strictModeDurationMinutes || 0;
                                        const currentHr = settings.strictModeDurationHours || 0;
                                        if (currentMin >= 55) {
                                            if (currentHr < 24) {
                                                updateSetting('strictModeDurationMinutes', 0);
                                                updateSetting('strictModeDurationHours', currentHr + 1);
                                            }
                                        } else {
                                            updateSetting('strictModeDurationMinutes', currentMin + 5);
                                        }
                                    }}
                                >+</button>
                                <span style={{ color: 'var(--text-secondary)' }}>min</span>
                            </div>
                        </div>

                        {/* Presets */}
                        <div className="preset-grid">
                            {[1, 2, 4, 8].map((hours) => (
                                <button
                                    key={hours}
                                    className={`preset-btn ${isPresetSelected(hours) ? 'active' : ''}`}
                                    onClick={() => !isPresetSelected(hours) && setPresetDuration(hours)}
                                >
                                    {hours}h
                                </button>
                            ))}
                            <button
                                className={`preset-btn ${isIndefinite ? 'indefinite-active' : ''}`}
                                onClick={() => !isIndefinite && toggleIndefinite()}
                                title="Indefinite mode"
                                style={{ fontSize: '1.2rem', padding: '6px 16px' }}
                            >
                                ∞
                            </button>
                        </div>

                        {/* Indefinite Warning */}
                        {isIndefinite && (
                            <div className="settings-card highlight-danger" style={{ padding: '1rem', marginBottom: '1.5rem', background: '#fee2e2' }}>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: '#991b1b', fontWeight: '500' }}>
                                    Indefinite mode has no timer. You must set up an Accountability Contact below.
                                </p>
                            </div>
                        )}

                        {/* Activate Button */}
                        <button
                            className={`destructive-button ${strictModeClickedOnce ? 'confirming' : ''}`}
                            onClick={onActivateStrictMode}
                            disabled={!canActivate()}
                            style={{ width: '100%' }}
                        >
                            {strictModeClickedOnce
                                ? 'Click again to confirm'
                                : (isIndefinite ? 'Activate Indefinite Mode' : 'Activate Strict Mode')
                            }
                        </button>
                    </>
                )}
            </div>

            {/* --- ACCOUNTABILITY CARD --- */}
            <div className="settings-card">
                <div style={{ marginBottom: '1.5rem' }}>
                    <label className="settings-card-title" style={{ display: 'block' }}>
                        Accountability Contact {isIndefinite && <span style={{ color: '#ef4444' }}>(Required)</span>}
                    </label>
                    <p className="settings-card-desc">
                        A trusted person who can approve early unlock requests
                    </p>
                </div>

                {/* Contact Input or Status */}
                <div style={{
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '1rem'
                }}>
                    {backendContact ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <p style={{ margin: 0, fontWeight: '500', color: 'var(--text-primary)' }}>{backendContact.name}</p>
                                <p className="settings-card-desc">{backendContact.email || backendContact.maskedEmail}</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                                    <span className={`status-badge ${backendContact.status === 'verified' ? 'success' : 'warning'}`}>
                                        {backendContact.status === 'verified' ? '✓ Verified' : '⏳ Pending'}
                                    </span>
                                    {backendContact.status === 'pending' && (
                                        <button
                                            onClick={handleResendInvite}
                                            disabled={resendLoading || resendSuccess}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                padding: 0,
                                                color: resendSuccess ? '#10b981' : (resendError ? '#ef4444' : 'var(--primary-color)'),
                                                fontSize: '0.75rem',
                                                cursor: (resendLoading || resendSuccess) ? 'default' : 'pointer',
                                                textDecoration: resendSuccess ? 'none' : 'underline',
                                                fontWeight: resendSuccess ? '600' : 'normal',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {resendLoading ? 'Sending...' : (resendSuccess ? '✓ Sent!' : (resendError ? 'Retry' : 'Resend Invite'))}
                                        </button>
                                    )}
                                    {resendError && (
                                        <span style={{ fontSize: '0.75rem', color: '#ef4444', marginLeft: '6px' }}>
                                            {resendError}
                                        </span>
                                    )}

                                </div>
                            </div>
                            <button
                                className="destructive-button"
                                onClick={handleRemoveContact}
                                disabled={isStrictModeActive}
                                title={isStrictModeActive ? 'Cannot remove while Strict Mode is active' : 'Remove contact'}
                                style={{
                                    padding: '6px 12px',
                                    fontSize: '0.8rem',
                                    background: 'transparent',
                                    border: '1px solid #ef4444',
                                    color: '#ef4444',
                                    opacity: isStrictModeActive ? 0.5 : 1,
                                    cursor: isStrictModeActive ? 'not-allowed' : 'pointer'
                                }}
                            >
                                Remove
                            </button>
                        </div>
                    ) : (
                        <div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', fontWeight: '500' }}>Contact Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g., Mom, Study Buddy"
                                    className="settings-input"
                                    value={settings.accountabilityContactName || ''}
                                    onChange={(e) => updateSetting('accountabilityContactName', e.target.value)}
                                />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', fontWeight: '500' }}>Email Address</label>
                                <input
                                    type="email"
                                    placeholder="contact@example.com"
                                    className="settings-input"
                                    value={settings.accountabilityContactValue || ''}
                                    onChange={(e) => updateSetting('accountabilityContactValue', e.target.value)}
                                />
                            </div>
                            <button
                                className="primary-button"
                                onClick={handleInviteContact}
                                disabled={contactLoading || !settings.accountabilityContactName || !settings.accountabilityContactValue}
                                style={{ width: '100%' }}
                            >
                                {contactLoading ? 'Sending...' : '✉️ Send Invitation'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
function AccountTab({ userEmail, onDeleteAccount, onResetDefaults, onRestartTour, onClose }) {
    const [confirmReset, setConfirmReset] = useState(false);
    const [passwordResetStatus, setPasswordResetStatus] = useState(null); // null | 'sending' | 'sent' | 'error'

    const handleChangePassword = async () => {
        if (!userEmail) return;

        setPasswordResetStatus('sending');
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
                redirectTo: `${window.location.origin}?type=recovery`
            });

            if (error) {
                console.error('Password reset error:', error);
                setPasswordResetStatus('error');
            } else {
                setPasswordResetStatus('sent');
            }

            // Reset status after 5 seconds
            setTimeout(() => setPasswordResetStatus(null), 5000);
        } catch (e) {
            console.error('Password reset exception:', e);
            setPasswordResetStatus('error');
            setTimeout(() => setPasswordResetStatus(null), 5000);
        }
    };

    return (
        <div className="settings-tab-content">
            <h3 style={{ marginTop: 0 }}>Account</h3>

            <div style={{ marginBottom: '2rem' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                    Email Address
                </label>
                <input
                    type="email"
                    value={userEmail || ''}
                    disabled
                    style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--input-bg)',
                        color: 'var(--text-secondary)',
                        opacity: 0.7,
                        boxSizing: 'border-box'
                    }}
                />
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    Contact support to change your email address
                </p>
            </div>

            <div style={{ marginBottom: '2rem' }}>
                <button
                    className="neutral-button"
                    onClick={handleChangePassword}
                    disabled={passwordResetStatus === 'sending'}
                    style={{ marginBottom: '8px' }}
                >
                    {passwordResetStatus === 'sending' ? 'Sending...' : 'Change Password'}
                </button>
                {passwordResetStatus === 'sent' && (
                    <p style={{ fontSize: '0.85rem', color: '#22c55e', marginTop: '4px' }}>
                        ✓ Password reset link sent to your email!
                    </p>
                )}
                {passwordResetStatus === 'error' && (
                    <p style={{ fontSize: '0.85rem', color: '#ef4444', marginTop: '4px' }}>
                        ✗ Failed to send reset email. Please try again.
                    </p>
                )}
            </div>

            {/* Onboarding Tour */}
            <div style={{ marginBottom: '2rem' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                    Help & Onboarding
                </label>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    Restart the guided tour to learn about Beacon Blocker's features.
                </p>
                <button
                    className="neutral-button"
                    onClick={() => {
                        if (onClose) onClose(); // Close settings modal first
                        if (onRestartTour) onRestartTour();
                    }}
                >
                    Restart Onboarding Tour
                </button>
            </div>

            <div style={{
                marginTop: '3rem',
                padding: '1.5rem',
                background: '#fee2e2',
                borderRadius: '12px',
                border: '1px solid #fecaca'
            }}>
                <h4 style={{ marginTop: 0, color: '#991b1b' }}>Danger Zone</h4>

                {/* Reset to Defaults */}
                <div style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid #fecaca' }}>
                    <p style={{ fontSize: '0.9rem', color: '#7f1d1d', marginBottom: '0.75rem' }}>
                        Reset all settings (theme, blocking behavior, strict mode preferences) to their original defaults.
                        Your presets, prompts, and block history will NOT be affected.
                    </p>
                    <button
                        className="destructive-button"
                        onClick={() => {
                            if (!confirmReset) {
                                setConfirmReset(true);
                                setTimeout(() => setConfirmReset(false), 3000);
                            } else {
                                if (onResetDefaults) onResetDefaults();
                                setConfirmReset(false);
                            }
                        }}
                        style={{
                            background: confirmReset
                                ? 'linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%)'
                                : undefined
                        }}
                    >
                        {confirmReset ? 'Click again to confirm reset' : 'Reset to Defaults'}
                    </button>
                </div>

                {/* Delete Account */}
                <p style={{ fontSize: '0.9rem', color: '#7f1d1d', marginBottom: '0.75rem' }}>
                    Permanently delete your account and all associated data. This cannot be undone.
                </p>
                <button
                    className="destructive-button"
                    onClick={() => {
                        if (onDeleteAccount) onDeleteAccount();
                    }}
                >
                    Delete Account
                </button>
            </div>
        </div>
    );
}

// Appearance Tab
function AppearanceTab({ settings, updateSetting, theme, onThemeChange }) {
    return (
        <div className="settings-tab-content">
            <h3 style={{ marginTop: 0 }}>Appearance</h3>

            {/* Theme Selector */}
            <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '0.75rem' }}>Theme</h4>
                <div style={{ display: 'flex', gap: '8px', background: 'var(--input-bg)', padding: '6px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                    {[
                        { id: 'light', label: 'Light', icon: '☀️' },
                        { id: 'dark', label: 'Dark', icon: '🌙' },
                        { id: 'system', label: 'System', icon: '🖥️' }
                    ].map((mode) => (
                        <button
                            key={mode.id}
                            onClick={() => onThemeChange(mode.id)}
                            style={{
                                flex: 1,
                                border: 'none',
                                background: theme === mode.id ? 'var(--card-bg)' : 'transparent',
                                color: theme === mode.id ? 'var(--primary-color)' : 'var(--text-secondary)',
                                boxShadow: theme === mode.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                borderRadius: '8px',
                                padding: '10px',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                fontWeight: theme === mode.id ? '600' : '400',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <span>{mode.icon}</span>
                            {mode.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Environmental Effects Toggle */}
            <div className="setting-row" style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid var(--border-color)' }}>
                <div>
                    <label style={{ fontWeight: '600', display: 'block', marginBottom: '4px' }}>Environmental Effects</label>
                    <p className="settings-card-desc" style={{ maxWidth: '400px' }}>
                        Display animated clouds and ocean waves on the dashboard.
                    </p>
                </div>
                <label className="toggle-switch">
                    <input
                        type="checkbox"
                        checked={settings.showEnvironment || false}
                        onChange={(e) => updateSetting('showEnvironment', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                </label>
            </div>
        </div>
    );
}



// Advanced Tab
function AdvancedTab({ settings, updateSetting }) {
    const handleExportSettings = () => {
        const dataStr = JSON.stringify(settings, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'beacon-blocker-settings.json';
        link.click();
    };

    return (
        <div className="settings-tab-content">
            <h3 style={{ marginTop: 0 }}>Advanced</h3>

            {/* Export & Import */}
            <div style={{ marginBottom: '2rem' }}>
                <h4>Export & Import</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    Export your settings to a JSON file for backup. You can import this file on another device or after reinstalling.
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="neutral-button" onClick={handleExportSettings}>
                        Export Settings
                    </button>
                    <button className="neutral-button" onClick={() => {
                        // Create a hidden file input
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.json';
                        input.onchange = (e) => {
                            const file = e.target.files[0];
                            if (file) {
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                    try {
                                        const imported = JSON.parse(event.target.result);
                                        // Apply each setting
                                        Object.keys(imported).forEach(key => {
                                            updateSetting(key, imported[key]);
                                        });
                                        alert('Settings imported successfully!');
                                    } catch (err) {
                                        alert('Failed to import settings: Invalid file format');
                                    }
                                };
                                reader.readAsText(file);
                            }
                        };
                        input.click();
                    }}>
                        Import Settings
                    </button>
                </div>
            </div>
        </div>
    );
}
export default SettingsModal;
