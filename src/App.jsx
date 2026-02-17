import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient.js';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import FullHistoryModal from './FullHistoryModal.jsx'; // Import for history modal
import OnboardingTour from './OnboardingTour.jsx';
import BugReportModal from './BugReportModal.jsx'; // Import BugReportModal
import FeatureRequestModal from './FeatureRequestModal.jsx'; // Import FeatureRequestModal
import UnloadPresetModal from './UnloadPresetModal';
import DeleteAccountModal from './DeleteAccountModal';
import config from './config.js'; // Environment config
import { encryptPrompt, decryptPrompt } from './cryptoUtils.js'; // Prompt encryption for privacy

import ProfileDropdown from './ProfileDropdown';
// SavePresetModal removed as part of workflow refactor
import PresetsModal from './PresetsModal';
import SettingsModal from './SettingsModal';
import ReferralBanner from './ReferralBanner';
import { getReferralStats } from './api/referral';
// CSS is imported in main.jsx

// --- Helper: Get base domain ---
function getBaseDomain(urlString) {
    if (!urlString) return null;
    try {
        let fullUrl = urlString.trim();
        if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
            fullUrl = 'http://' + fullUrl;
        }
        const url = new URL(fullUrl);
        const parts = url.hostname.split('.');
        if (parts.length >= 2) {
            if (parts.length > 2 && parts[parts.length - 2].length <= 3 && parts[parts.length - 1].length <= 3) {
                return parts.slice(-3).join('.').toLowerCase(); // e.g., bbc.co.uk
            }
            return parts.slice(-2).join('.').toLowerCase(); // e.g., google.com
        }
        return url.hostname.toLowerCase();
    } catch (e) {
        return null;
    }
}

// --- Helper to get Favicon ---
const getFaviconUrl = (domain) => {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
};

// --- Extension Communication (for local block logs) ---
// Uses CustomEvent bridge via content script

// --- Direct Extension Messaging for Pause Sync ---
// Uses externally_connectable for reliable dashboard->extension communication
function syncPauseToExtension(paused) {
    // Get extension ID from the marker element injected by content script
    const marker = document.getElementById('beacon-extension-status');
    const extensionId = marker?.getAttribute('data-extension-id');

    console.log('[DASHBOARD] syncPauseToExtension called, paused:', paused, 'extensionId:', extensionId);

    // Try direct messaging first (more reliable) - requires extension ID
    if (extensionId && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
            chrome.runtime.sendMessage(
                extensionId,
                { type: 'SYNC_PAUSE', paused: paused },
                (response) => {
                    if (chrome.runtime.lastError) {
                        console.log('[DASHBOARD] Direct pause sync failed:', chrome.runtime.lastError.message);
                        // Fallback to CustomEvent
                        document.dispatchEvent(new CustomEvent('BEACON_PAUSE_SYNC', { detail: { paused } }));
                    } else {
                        console.log('[DASHBOARD] Pause sync response:', response);
                    }
                }
            );
        } catch (e) {
            console.log('[DASHBOARD] chrome.runtime error:', e);
            // Fallback to CustomEvent
            document.dispatchEvent(new CustomEvent('BEACON_PAUSE_SYNC', { detail: { paused } }));
        }
    } else {
        // Fallback to CustomEvent bridge (content script will forward to background)
        console.log('[DASHBOARD] Using CustomEvent fallback for pause sync (no extension ID or chrome.runtime)');
        document.dispatchEvent(new CustomEvent('BEACON_PAUSE_SYNC', { detail: { paused } }));
    }
}

// --- Sync Activity Log Settings to Extension ---
function syncActivityLogSettingsToExtension(autoDelete, retentionDays, logAllowDecisions, logCachedDecisions) {
    // Use CustomEvent bridge (same pattern as pause sync)
    document.dispatchEvent(new CustomEvent('BEACON_ACTIVITY_LOG_SETTINGS_SYNC', {
        detail: { autoDelete, retentionDays, logAllowDecisions, logCachedDecisions }
    }));
}

async function fetchBlockLogsFromExtension() {
    return new Promise((resolve) => {
        let timeoutId = null;
        let resolved = false;

        // Set up one-time listener for response
        const handleResponse = (event) => {
            if (resolved) return; // Already resolved
            resolved = true;
            clearTimeout(timeoutId); // Cancel the timeout
            window.removeEventListener('BEACON_BLOCK_LOG_RESPONSE', handleResponse);
            resolve(event.detail?.logs || []);
        };

        // Listen for response
        window.addEventListener('BEACON_BLOCK_LOG_RESPONSE', handleResponse);

        // Request block logs via CustomEvent (content script bridges to background)
        document.dispatchEvent(new CustomEvent('BEACON_GET_BLOCK_LOG'));

        // Timeout after 2 seconds if no response
        timeoutId = setTimeout(() => {
            if (resolved) return; // Already resolved
            resolved = true;
            window.removeEventListener('BEACON_BLOCK_LOG_RESPONSE', handleResponse);
            resolve([]);
        }, 2000);
    });
}

function clearBlockLog() {
    document.dispatchEvent(new CustomEvent('BEACON_CLEAR_BLOCK_LOG'));
}



// === Define categories for checkboxes ===
const BLOCKED_CATEGORIES = [
    { id: 'social', label: 'Social Media', desc: 'Facebook, Instagram, Twitter' },
    { id: 'shorts', label: 'Shorts & Reels', desc: 'TikTok, YT Shorts, Reels' },
    { id: 'news', label: 'News & Politics', desc: 'CNN, Fox, BBC, NYT' },
    { id: 'entertainment', label: 'Movies & TV', desc: 'Netflix, Hulu, Disney+' },
    { id: 'streaming', label: 'Streaming Services', desc: 'YouTube, Twitch, Netflix' },
    { id: 'games', label: 'Gaming', desc: 'Steam, Roblox, IGN' },
    { id: 'ai_chatbots', label: 'AI / Chatbots', desc: 'ChatGPT, Gemini, Claude' },
    { id: 'communication', label: 'Communication', desc: 'Gmail, Slack, WhatsApp Web' },
    { id: 'wikis', label: 'Wikis / Rabbit Holes', desc: 'Wikipedia, Fandom, WikiHow' },
    { id: 'forums', label: 'Forums', desc: 'Reddit, Quora, StackOverflow' },
    { id: 'shopping', label: 'Shopping', desc: 'Amazon, eBay, Shopify' },
    { id: 'mature', label: 'Mature Content', desc: 'Adult sites, Gambling' }
];

// --- Track last synced auth token to prevent loop ---
let lastSyncedAuthToken = null;

// === Map common names to domains ===
const commonSiteMappings = {
    'wikipedia': 'wikipedia.org', 'youtube': 'youtube.com', 'facebook': 'facebook.com',
    'instagram': 'instagram.com', 'twitter': 'twitter.com', 'x': 'x.com',
    'reddit': 'reddit.com', 'amazon': 'amazon.com', 'google': 'google.com',
    'bbc': 'bbc.com', 'cnn': 'cnn.com', 'nytimes': 'nytimes.com', 'tiktok': 'tiktok.com',
    'netflix': 'netflix.com', 'hulu': 'hulu.com', 'disney': 'disneyplus.com',
    'twitch': 'twitch.tv', 'linkedin': 'linkedin.com', 'github': 'github.com',
    'stackoverflow': 'stackoverflow.com', 'pinterest': 'pinterest.com', 'tumblr': 'tumblr.com',
    'spotify': 'spotify.com', 'whatsapp': 'whatsapp.com', 'discord': 'discord.com',
    'slack': 'slack.com', 'gmail': 'mail.google.com', 'outlook': 'outlook.com',
    'bing': 'bing.com', 'duckduckgo': 'duckduckgo.com', 'quora': 'quora.com',
    'medium': 'medium.com', 'imdb': 'imdb.com', 'ebay': 'ebay.com',
    'craigslist': 'craigslist.org', 'etsy': 'etsy.com', 'walmart': 'walmart.com',
    'target': 'target.com', 'bestbuy': 'bestbuy.com', 'fox': 'foxnews.com',
    'msnbc': 'msnbc.com', 'wsj': 'wsj.com', 'washingtonpost': 'washingtonpost.com',
    'guardian': 'theguardian.com', 'buzzfeed': 'buzzfeed.com', 'forbes': 'forbes.com',
    'bloomberg': 'bloomberg.com', 'techcrunch': 'techcrunch.com', 'theverge': 'theverge.com',
    'wired': 'wired.com', 'ign': 'ign.com', 'roblox': 'roblox.com',
    'steam': 'steampowered.com', 'chatgpt': 'chatgpt.com', 'openai': 'openai.com',
    'claude': 'anthropic.com', 'gemini': 'gemini.google.com', 'letterboxd': 'letterboxd.com'
};

// --- SUBSCRIPTION GUARD COMPONENT ---
function SubscriptionGuard({ session, children, openSettingsToSubscription, onSignOut }) {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!session?.access_token) {
            setLoading(false);
            return;
        }

        const checkStatus = async () => {
            try {
                const res = await fetch(`${config.BACKEND_URL}/api/payments/status`, {
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });
                if (res.ok) {
                    setStatus(await res.json());
                }
            } catch (e) {
                console.error('Sub Check Error:', e);
            } finally {
                setLoading(false);
            }
        };

        checkStatus();
    }, [session]);

    if (loading) return <div></div>; // fast load

    const isPro = status?.is_pro;
    const isTrial = status?.trial_active;
    const hasAccess = isPro || isTrial;

    return (
        <>
            {!hasAccess && status && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.85)', zIndex: 999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', color: 'white', textAlign: 'center'
                }}>
                    <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>Free Access Expired</h1>
                    <p style={{ fontSize: '1.2rem', maxWidth: '500px', marginBottom: '2rem', opacity: 0.8 }}>
                        Your free access has ended. Subscribe to keep your digital distractions at bay.
                    </p>
                    <button
                        className="primary-button"
                        style={{ fontSize: '1.2rem', padding: '1rem 2rem' }}
                        onClick={openSettingsToSubscription}
                    >
                        Subscribe Now
                    </button>
                    <button
                        onClick={onSignOut}
                        style={{
                            marginTop: '1.5rem', background: 'none', border: 'none',
                            color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
                            fontSize: '0.9rem', textDecoration: 'underline'
                        }}
                    >
                        Sign Out
                    </button>
                </div>
            )}
            {children}
        </>
    );
}

// === Dashboard Component ===
function Dashboard({ session, onReportBug, onOpenHistory, onOpenHistoryWithSearch, theme, onThemeChange, extensionStatus, onRestartTour, showSubscriptionModal, onSubscriptionModalShown }) {
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState(null);
    const [apiKey, setApiKey] = useState(null);
    const [mainPrompt, setMainPrompt] = useState('');
    const [showExamples, setShowExamples] = useState(() => localStorage.getItem('beacon_showExamples') === 'true');
    const [showHelpers, setShowHelpers] = useState(() => localStorage.getItem('beacon_showHelpers') === 'true'); // New state for collapsible helpers

    // Persist UI State
    useEffect(() => { localStorage.setItem('beacon_showExamples', showExamples); }, [showExamples]);
    useEffect(() => { localStorage.setItem('beacon_showHelpers', showHelpers); }, [showHelpers]);
    const [blockedCategories, setBlockedCategories] = useState({});
    const [allowListArray, setAllowListArray] = useState([]);
    const [blockListArray, setBlockListArray] = useState([]);
    const [currentAllowInput, setCurrentAllowInput] = useState('');
    const [currentBlockInput, setCurrentBlockInput] = useState('');
    const [logs, setLogs] = useState([]);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false); // Add missing state for Delete Account modal

    // --- Settings Modal State ---
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [settingsInitialTab, setSettingsInitialTab] = useState('analytics'); // New state for deep linking

    // Open SettingsModal to subscription tab when triggered by SubscriptionGuard
    useEffect(() => {
        if (showSubscriptionModal) {
            setSettingsInitialTab('subscription');
            setIsSettingsModalOpen(true);
            onSubscriptionModalShown();
        }
    }, [showSubscriptionModal]);

    const [userSettings, setUserSettings] = useState(() => {
        const saved = localStorage.getItem('beacon_userSettings');
        return saved ? JSON.parse(saved) : {
            // Analytics & Insights
            weeklySummaryEmail: false,
            // Activity & Privacy
            showAllActivity: false,
            // Blocking Behavior - Strict Mode
            strictMode: false,
            strictModeUntil: null, // timestamp when strict mode ends
            strictModeIndefinite: false, // no timer, requires accountability contact
            strictModeDurationHours: 4,
            strictModeDurationMinutes: 0,
            // Accountability Contact
            accountabilityContactRequired: false,
            accountabilityContactName: '', // e.g., "Mom", "Study Buddy"
            accountabilityContactMethod: 'email', // 'email' or 'phone'
            accountabilityContactValue: '', // email address or phone number
            accountabilityContactVerified: false,
            // Emergency Exit
            lastEmergencyExit: null, // timestamp of last emergency exit (7-day cooldown)
            // Blocking Behavior - Other
            optimisticBlocking: false,
            blockingPaused: false, // temporarily disable blocking without logging out
            showEnvironment: false,
            // Activity Log Auto-Delete
            autoDeleteActivityLog: false, // OFF by default - user must opt-in
            activityLogRetention: 7, // 7 or 30 days when enabled
            // ALLOW Decision Logging
            logAllowDecisions: false, // OFF by default - only log blocks unless user opts in
            // Cached Decision Logging
            logCachedDecisions: false // OFF by default - hide cached repeats unless user opts in
        };
    });
    const [storageUsage, setStorageUsage] = useState({ used: 0, max: 10485760 }); // 10 MB in bytes

    // Fetch storage usage from extension when settings modal opens
    useEffect(() => {
        if (isSettingsModalOpen) {
            console.log('[Storage] Requesting storage usage via CustomEvent...');

            // Listen for response
            const handleStorageResponse = (event) => {
                console.log('[Storage] Response received:', event.detail);
                setStorageUsage({ used: event.detail.used, max: event.detail.max });
            };

            window.addEventListener('BEACON_STORAGE_USAGE_RESPONSE', handleStorageResponse);

            // Request storage usage
            document.dispatchEvent(new CustomEvent('BEACON_GET_STORAGE_USAGE'));

            // Cleanup listener
        }
    }, [isSettingsModalOpen]);

    // --- Pause State: Read FROM extension on mount (extension is source of truth) ---
    const pauseInitialized = useRef(false);
    useEffect(() => {
        const handlePauseResponse = (event) => {
            const paused = event.detail?.paused ?? false;
            pauseInitialized.current = true;
            setUserSettings(prev => ({ ...prev, blockingPaused: paused }));
            localStorage.setItem('beacon_userSettings', JSON.stringify({
                ...JSON.parse(localStorage.getItem('beacon_userSettings') || '{}'),
                blockingPaused: paused
            }));
        };
        window.addEventListener('BEACON_PAUSE_STATE_RESPONSE', handlePauseResponse);
        document.dispatchEvent(new CustomEvent('BEACON_GET_PAUSE_STATE'));
        return () => window.removeEventListener('BEACON_PAUSE_STATE_RESPONSE', handlePauseResponse);
    }, []); // mount only

    // After init: sync user-initiated pause changes TO extension
    useEffect(() => {
        if (pauseInitialized.current && typeof userSettings.blockingPaused === 'boolean') {
            syncPauseToExtension(userSettings.blockingPaused);
        }
    }, [userSettings.blockingPaused]);

    // Sync activity log settings to extension on mount and when changed
    useEffect(() => {
        document.dispatchEvent(new CustomEvent('BEACON_ACTIVITY_LOG_SETTINGS_SYNC', {
            detail: {
                autoDelete: userSettings.autoDeleteActivityLog,
                retentionDays: userSettings.activityLogRetention ?? 7,
                logAllowDecisions: userSettings.logAllowDecisions ?? false,
                logCachedDecisions: userSettings.logCachedDecisions ?? false
            }
        }));
    }, [userSettings.autoDeleteActivityLog, userSettings.activityLogRetention, userSettings.logAllowDecisions, userSettings.logCachedDecisions]);

    const isStrictModeActive = userSettings.strictModeUntil && userSettings.strictModeUntil > Date.now();

    // --- Poll for external strict mode changes (e.g., unlock approved via webhook) ---
    useEffect(() => {
        if (!isStrictModeActive || !session?.user) return;

        const checkStrictModeStatus = async () => {
            try {
                const { data } = await supabase
                    .from('rules')
                    .select('strict_mode_until')
                    .eq('user_id', session.user.id)
                    .single();

                // If DB shows null but local shows active, an unlock was approved externally
                if (!data?.strict_mode_until && userSettings.strictModeUntil) {
                    console.log('[DASHBOARD] Strict mode cleared externally (unlock approved)');
                    setUserSettings(prev => ({ ...prev, strictModeUntil: null, strictMode: false }));
                    localStorage.setItem('beacon_userSettings', JSON.stringify({
                        ...userSettings, strictModeUntil: null, strictMode: false
                    }));
                    showToast('Strict mode disabled - unlock request approved!');
                }
            } catch (err) {
                console.error('[DASHBOARD] Error checking strict mode status:', err);
            }
        };

        // Poll every 30 seconds while strict mode is active
        const interval = setInterval(checkStrictModeStatus, 30000);
        return () => clearInterval(interval);
    }, [isStrictModeActive, session?.user?.id, userSettings.strictModeUntil]);

    // --- Toast Notification Helper ---
    const showToast = (msg, duration = 4000) => {
        setMessage(msg);
        setTimeout(() => setMessage(null), duration);
    };

    // --- Presets State ---
    const [presets, setPresets] = useState([]);
    const [isPresetsModalOpen, setIsPresetsModalOpen] = useState(false);
    // Inline Save State
    const [isSavingPreset, setIsSavingPreset] = useState(false);
    const [newPresetName, setNewPresetName] = useState('');
    const [saveWarning, setSaveWarning] = useState(null);
    const [overwriteCandidate, setOverwriteCandidate] = useState(null); // { id, name } of preset to overwrite
    // Inline Rename State
    const [isRenamingPreset, setIsRenamingPreset] = useState(false);
    const [renamePresetInput, setRenamePresetInput] = useState('');

    // Initialize activePreset from localStorage if available
    const [activePreset, setActivePreset] = useState(() => {
        const saved = localStorage.getItem('activePreset');
        return saved ? JSON.parse(saved) : null;
    });

    // Update localStorage and Database whenever activePreset changes
    useEffect(() => {
        if (activePreset) {
            localStorage.setItem('activePreset', JSON.stringify(activePreset));
        } else {
            localStorage.removeItem('activePreset');
        }

    }, [activePreset]);

    // --- Preset Status Decoupling ---
    const [presetOriginalState, setPresetOriginalState] = useState(null);

    const [isUnloadModalOpen, setIsUnloadModalOpen] = useState(false);
    const [pendingLoadPreset, setPendingLoadPreset] = useState(null); // For custom confirm modal

    // Sync presetOriginalState when activePreset or presets change (handles load/refresh)
    useEffect(() => {
        if (activePreset && presets.length > 0) {
            const original = presets.find(p => p.id === activePreset.id);
            if (original) {
                setPresetOriginalState({
                    prompt: original.prompt,
                    blocked_categories: original.blocked_categories,
                    allow_list: original.allow_list,
                    block_list: original.block_list
                });
            }
        } else if (!activePreset) {
            setPresetOriginalState(null);
        }
    }, [activePreset, presets]);

    // Check if current settings differ from the active preset's original state
    const isPresetModified = activePreset && presetOriginalState && !areSettingsEqual({
        prompt: mainPrompt,
        blocked_categories: blockedCategories,
        allow_list: allowListArray,
        block_list: blockListArray
    }, presetOriginalState);

    // --- Save Workflow State ---
    const [lastCheckpoint, setLastCheckpoint] = useState(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'error'

    // Removed local isHistoryModalOpen state
    const [initialSearchTerm, setInitialSearchTerm] = useState('');
    const mainPromptRef = useRef(null);

    // --- Typewriter Effect State ---
    const [placeholderText, setPlaceholderText] = useState('');
    const [exampleIndex, setExampleIndex] = useState(0);
    const [charIndex, setCharIndex] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isPaused, setIsPaused] = useState(false);




    const PLACEHOLDER_EXAMPLES = [
        "Allow educational YouTube videos about coding and science. Block entertainment, drama, and shorts.",
        "I'm planning a vacation. Allow travel and hotel sites but block social media and news.",
        "Block all social media for 2 hours so I can focus on my assignment.",
        "Block explicit or violent content across all websites.",
        "Allow Facebook Marketplace but block the Facebook news feed.",
        "Block everything except .edu sites and Google Scholar until 5 PM.",
        "Block clickbait news articles. Allow investigative journalism and local news.",
        "I need to finish my thesis. Block the entire internet for 45 minutes."
    ];

    useEffect(() => {
        const currentExample = PLACEHOLDER_EXAMPLES[exampleIndex];
        let timer;

        if (isPaused) {
            timer = setTimeout(() => {
                setIsPaused(false);
                setIsDeleting(true);
            }, 2000); // Pause before deleting
        } else if (isDeleting) {
            if (charIndex > 0) {
                timer = setTimeout(() => {
                    setPlaceholderText(currentExample.substring(0, charIndex - 1));
                    setCharIndex(charIndex - 1);
                }, 30); // Deleting speed
            } else {
                setIsDeleting(false);
                setExampleIndex((prev) => (prev + 1) % PLACEHOLDER_EXAMPLES.length);
            }
        } else {
            if (charIndex < currentExample.length) {
                timer = setTimeout(() => {
                    setPlaceholderText(currentExample.substring(0, charIndex + 1));
                    setCharIndex(charIndex + 1);
                }, 50); // Typing speed
            } else {
                setIsPaused(true);
            }
        }
        return () => clearTimeout(timer);
    }, [charIndex, isDeleting, isPaused, exampleIndex]);

    // --- Helper: Instant Typewriter Reset ---
    const resetTypewriter = () => {
        setPlaceholderText(''); // Wipe text immediately

        // Pick a random index that isn't the current one
        setExampleIndex((prev) => {
            let next;
            do {
                next = Math.floor(Math.random() * PLACEHOLDER_EXAMPLES.length);
            } while (next === prev && PLACEHOLDER_EXAMPLES.length > 1);
            return next;
        });

        setCharIndex(0);        // Reset char index
        setIsDeleting(false);   // Reset state
        setIsPaused(false);     // Reset pause
    };

    // --- Auto-Resize Handler for Main Prompt ---
    const handleTextAreaChange = (event) => {
        const textarea = event.target;
        const newValue = event.target.value;

        setSaveStatus('saving');
        setMainPrompt(newValue);

        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;

        // FIX: Reset typewriter instantly if cleared manually
        if (newValue === '') {
            resetTypewriter();
        }
    };
    // --- Styles ---
    const dashboardCardStyles = { /* ... */ };
    const apiKeyBoxStyles = { /* ... */ };
    const helperSectionStyles = { /* ... */ };

    // --- Load user data ---
    useEffect(() => {
        async function loadUserData() {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();

            let { data, error } = await supabase.from('rules').select('prompt, blocked_categories, allow_list, block_list, active_preset_id, strict_mode_until').eq('user_id', user.id).single();

            if (error && error.code !== 'PGRST116') { console.error('Error loading data:', error); }
            const initialCategories = {}; BLOCKED_CATEGORIES.forEach(cat => initialCategories[cat.id] = false);
            let loadedMainPrompt = '', loadedApiKey = null, loadedCategories = initialCategories, loadedAllowList = [], loadedBlockList = [], loadedActivePresetId = null;

            if (data) {
                // Decrypt prompt if encrypted (for privacy)
                loadedMainPrompt = await decryptPrompt(data.prompt, user.id) || '';
                loadedApiKey = data.api_key;
                loadedCategories = data.blocked_categories || initialCategories;
                loadedAllowList = Array.isArray(data.allow_list) ? data.allow_list : [];
                loadedBlockList = Array.isArray(data.block_list) ? data.block_list : [];
                loadedActivePresetId = data.active_preset_id;
                BLOCKED_CATEGORIES.forEach(cat => { if (loadedCategories[cat.id] === undefined) { loadedCategories[cat.id] = false; } });

                // Sync strict mode from DB - if cleared externally (unlock approved while offline)
                const localStrictMode = JSON.parse(localStorage.getItem('beacon_userSettings') || '{}');
                if (!data.strict_mode_until && localStrictMode.strictModeUntil) {
                    console.log('[DASHBOARD] Strict mode was cleared externally while offline');
                    const updatedSettings = { ...localStrictMode, strictModeUntil: null, strictMode: false };
                    localStorage.setItem('beacon_userSettings', JSON.stringify(updatedSettings));
                    setUserSettings(prev => ({ ...prev, strictModeUntil: null, strictMode: false }));
                }
            }

            setMainPrompt(loadedMainPrompt); setApiKey(loadedApiKey); setBlockedCategories(loadedCategories);
            setAllowListArray(loadedAllowList); setBlockListArray(loadedBlockList); setLoading(false);

            // Load active preset if ID exists
            if (loadedActivePresetId) {
                const { data: presetData } = await supabase.from('settings_presets').select('*').eq('id', loadedActivePresetId).single();
                if (presetData) {
                    // Decrypt preset name for display
                    const decryptedName = await decryptPrompt(presetData.name, user.id);
                    setActivePreset({ id: presetData.id, name: decryptedName });
                }
            }
        }
        loadUserData();
        loadUserData();
    }, [session]);

    // --- Fetch Presets ---
    const fetchPresets = async () => {
        if (!session?.user?.id) return;

        const { data, error } = await supabase
            .from('settings_presets')
            .select('*')
            .eq('user_id', session.user.id) // Only fetch this user's presets
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching presets:', error);
        } else if (data) {
            // Decrypt names and prompts for display and comparison
            const decryptedPresets = await Promise.all(data.map(async (preset) => {
                const decryptedName = await decryptPrompt(preset.name, session.user.id);
                const decryptedPrompt = await decryptPrompt(preset.prompt, session.user.id);
                return {
                    ...preset,
                    name: decryptedName,
                    prompt: decryptedPrompt
                };
            }));
            setPresets(decryptedPresets);
        } else {
            setPresets([]);
        }
    };

    useEffect(() => {
        if (session?.user) {
            fetchPresets();
        }
    }, [session]);

    // --- Check for Unsaved Changes ---
    useEffect(() => {
        if (!lastCheckpoint) return;

        const currentConfig = JSON.stringify({
            prompt: mainPrompt,
            blocked_categories: blockedCategories,
            allow_list: allowListArray,
            block_list: blockListArray
        });

        const checkpointConfig = JSON.stringify(lastCheckpoint);
        setHasUnsavedChanges(currentConfig !== checkpointConfig);
    }, [mainPrompt, blockedCategories, allowListArray, blockListArray, lastCheckpoint]);

    // --- Initialize Checkpoint on Load ---
    useEffect(() => {
        if (!loading && !lastCheckpoint && session) {
            setLastCheckpoint({
                prompt: mainPrompt,
                blocked_categories: blockedCategories,
                allow_list: allowListArray,
                block_list: blockListArray
            });
        }
    }, [loading, session, mainPrompt, blockedCategories, allowListArray, blockListArray]); // Depend on data to capture initial state

    // --- Manual Save Handler ---
    // --- Manual Save Handler (Deprecated, but kept logic for reference if needed) ---
    // Auto-save handles this now, but we update checkpoint on successful auto-save.

    // --- Save to Supabase (Updated for Status) ---
    const saveToSupabase = async (data, activePresetId = undefined) => {
        if (!session?.user) return;
        setSaveStatus('saving');
        const startTime = Date.now();

        const presetIdToSave = activePresetId !== undefined ? activePresetId : (activePreset ? activePreset.id : null);

        // Encrypt prompt before saving for privacy
        const encryptedPrompt = await encryptPrompt(data.prompt, session.user.id);

        const { error } = await supabase.from('rules').upsert({
            user_id: session.user.id,
            prompt: encryptedPrompt,
            blocked_categories: data.blocked_categories,
            allow_list: data.allow_list,
            block_list: data.block_list,
            active_preset_id: presetIdToSave,
            last_updated: new Date().toISOString() // <--- ADD THIS LINE
        }, { onConflict: 'user_id' });

        // ... rest of the function remains the same

        // Calculate elapsed time and wait if needed (min 800ms for UX)
        const elapsed = Date.now() - startTime;
        if (elapsed < 800) {
            await new Promise(resolve => setTimeout(resolve, 800 - elapsed));
        }

        if (error) {
            console.error('Error saving rules:', error);
            setSaveStatus('error');
        } else {
            setSaveStatus('saved');
            // Update checkpoint on successful save
            setLastCheckpoint({
                prompt: data.prompt,
                blocked_categories: data.blocked_categories,
                allow_list: data.allow_list,
                block_list: data.block_list
            });
            setHasUnsavedChanges(false);

            // CRITICAL: Tell the extension to clear its cache so new rules take effect
            window.dispatchEvent(new CustomEvent('BEACON_RULES_UPDATED'));

            // Signal the backend to increment cache version so extension invalidates its cache
            try {
                const authToken = (await supabase.auth.getSession()).data.session?.access_token;
                if (authToken) {
                    fetch(config.BACKEND_URL + '/update-rules-signal', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`
                        }
                    }).catch(() => { }); // Fire and forget
                }
            } catch (e) {
                // Ignore cache version errors
            }
        }
    };

    // --- Inline Save Handlers ---
    const MAX_PRESETS = 10;

    const handleStartSavePreset = () => {
        if (presets.length >= MAX_PRESETS) {
            setSaveWarning(`Preset limit (10) reached. Please delete an existing preset to save a new one.`);
            return;
        }
        setNewPresetName(`Preset_${presets.length + 1}`);
        setIsSavingPreset(true);
        setSaveWarning(null);
        setOverwriteCandidate(null);
    };

    const handleCancelSavePreset = () => {
        setIsSavingPreset(false);
        setNewPresetName('');
        setSaveWarning(null);
        setOverwriteCandidate(null);
    };





    const handleStartRename = () => {
        if (activePreset) {
            setRenamePresetInput(activePreset.name);
            setIsRenamingPreset(true);
        }
    };

    const handleCancelRename = () => {
        setIsRenamingPreset(false);
        setRenamePresetInput('');
    };

    const handleConfirmRename = async () => {
        if (!renamePresetInput.trim() || !activePreset) return;

        const newName = renamePresetInput.trim();
        if (newName === activePreset.name) {
            handleCancelRename();
            return;
        }

        // Check for duplicates
        const duplicate = presets.find(p => p.name.toLowerCase() === newName.toLowerCase() && p.id !== activePreset.id);
        if (duplicate) {
            alert(`A preset named "${newName}" already exists.`);
            return;
        }

        await handleRenamePreset(activePreset.id, newName);
        setActivePreset({ ...activePreset, name: newName });
        setIsRenamingPreset(false);
    };



    const executeSave = async (name, overwriteId = null) => {
        if (!session?.user) return;

        if (overwriteId) {
            await supabase.from('settings_presets').delete().eq('id', overwriteId);
        }

        // Encrypt name and prompt before storing for privacy
        const encryptedName = await encryptPrompt(name, session.user.id);
        const encryptedPrompt = await encryptPrompt(mainPrompt, session.user.id);

        const newPreset = {
            user_id: session.user.id,
            name: encryptedName,
            prompt: encryptedPrompt,
            blocked_categories: blockedCategories,
            allow_list: allowListArray,
            block_list: blockListArray
        };

        const { data, error } = await supabase
            .from('settings_presets')
            .insert([newPreset])
            .select()
            .single();

        if (error) {
            console.error('Error saving preset:', error);
            alert('Failed to save preset.');
        } else {
            await fetchPresets(); // Refresh list
            setIsSavingPreset(false);
            setNewPresetName('');
            setSaveWarning(null);
            setOverwriteCandidate(null);

            // Update checkpoint
            setLastCheckpoint({
                prompt: mainPrompt,
                blocked_categories: blockedCategories,
                allow_list: allowListArray,
                block_list: blockListArray
            });
            setHasUnsavedChanges(false);

            // Set as active (use original name, not encrypted data.name)
            setActivePreset({ id: data.id, name: name });

            // Sync presetOriginalState
            setPresetOriginalState({
                prompt: mainPrompt,
                blocked_categories: blockedCategories,
                allow_list: allowListArray,
                block_list: blockListArray
            });

            // Persist the new active preset ID to rules
            await saveToSupabase({
                prompt: mainPrompt,
                blocked_categories: blockedCategories,
                allow_list: allowListArray,
                block_list: blockListArray
            }, data.id);
        }
    };

    const handleConfirmSavePreset = async () => {
        if (!newPresetName.trim() || !session?.user) return;

        const name = newPresetName.trim();

        // Clear any previous warnings first
        setSaveWarning(null);
        setOverwriteCandidate(null);

        // 1. Check for Duplicate Name first
        const duplicateName = presets.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (duplicateName) {
            setOverwriteCandidate(duplicateName);
            return;
        }

        // 2. Check for Duplicate Content (same settings as existing preset)
        const currentSettings = {
            prompt: mainPrompt,
            blocked_categories: blockedCategories,
            allow_list: allowListArray,
            block_list: blockListArray
        };


        const duplicateContent = presets.find(p => {
            const isMatch = areSettingsEqual({
                prompt: p.prompt,
                blocked_categories: p.blocked_categories,
                allow_list: p.allow_list,
                block_list: p.block_list
            }, currentSettings);
            return isMatch;
        });

        if (duplicateContent) {
            setSaveWarning(`These settings already exist in preset: "${duplicateContent.name}"`);
            return;
        }

        // No blocking duplicates, proceed to save
        await executeSave(name);
    };

    // --- Preset Actions ---
    const handleSavePreset = async (name) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Check for duplicate name
        const duplicate = presets.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (duplicate) {
            if (!confirm(`A preset named "${name}" already exists. Overwrite it?`)) {
                return;
            }
            // If overwriting, we'll delete the old one first (or update it, but delete+insert is simpler for now)
            await supabase.from('settings_presets').delete().eq('id', duplicate.id);
        }

        // Encrypt name and prompt before storing for privacy
        const encryptedPrompt = await encryptPrompt(mainPrompt, user.id);
        const encryptedName = await encryptPrompt(name, user.id);

        const presetData = {
            user_id: user.id,
            name: encryptedName,
            prompt: encryptedPrompt,
            blocked_categories: blockedCategories,
            allow_list: allowListArray,
            block_list: blockListArray
        };

        const { error } = await supabase.from('settings_presets').insert([presetData]);

        if (error) {
            showToast(`Error saving preset: ${error.message}`);
        } else {
            fetchPresets();
            // Also update checkpoint since saving a preset implies we are happy with current state
            setLastCheckpoint({
                prompt: mainPrompt,
                blocked_categories: blockedCategories,
                allow_list: allowListArray,
                block_list: blockListArray
            });
            setHasUnsavedChanges(false);

            // Set as active preset (need to fetch ID, but for now we can just set name and rely on fetchPresets to get ID later or refetch)
            // Ideally we get the inserted row back. Let's optimize.
            const { data: insertedPreset } = await supabase.from('settings_presets').select('id, name').eq('name', name).eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).single();
            if (insertedPreset) {
                setActivePreset(insertedPreset);
            }
        }
    };

    const handleUpdateActivePreset = async () => {
        if (!activePreset || !activePreset.id) {
            console.error('No active preset or missing ID');
            alert('Error: Active preset is missing ID. Please reload the preset.');
            return;
        }

        // Check if these settings would duplicate another preset (excluding current)
        const currentSettings = {
            prompt: mainPrompt,
            blocked_categories: blockedCategories,
            allow_list: allowListArray,
            block_list: blockListArray
        };

        const duplicateContent = presets.find(p =>
            p.id !== activePreset.id &&
            areSettingsEqual({
                prompt: p.prompt,
                blocked_categories: p.blocked_categories,
                allow_list: p.allow_list,
                block_list: p.block_list
            }, currentSettings)
        );

        if (duplicateContent) {
            setSaveWarning(`These settings already match preset: "${duplicateContent.name}"`);
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Encrypt prompt before updating for privacy
        const encryptedPrompt = await encryptPrompt(mainPrompt, user.id);

        const { error } = await supabase.from('settings_presets').update({
            prompt: encryptedPrompt,
            blocked_categories: blockedCategories,
            allow_list: allowListArray,
            block_list: blockListArray
        }).eq('id', activePreset.id);

        if (error) {
            console.error('Error updating preset:', error);
            alert(`Failed to update preset: ${error.message}`);
        } else {
            await fetchPresets(); // Refresh list to reflect changes

            // Update checkpoint
            setLastCheckpoint({
                prompt: mainPrompt,
                blocked_categories: blockedCategories,
                allow_list: allowListArray,
                block_list: blockListArray
            });
            setHasUnsavedChanges(false);

            // Sync presetOriginalState
            setPresetOriginalState({
                prompt: mainPrompt,
                blocked_categories: blockedCategories,
                allow_list: allowListArray,
                block_list: blockListArray
            });
        }
    };

    const handleLoadPreset = async (preset) => {
        // Block preset loading during strict mode (UI already disables button, this is a safeguard)
        if (isStrictModeActive) {
            return;
        }

        // Only warn if there is UN-SAVED work that would be lost
        if (hasUnsavedChanges) {
            // Show custom modal instead of browser confirm
            setPendingLoadPreset(preset);
            return;
        }

        await executeLoadPreset(preset);
    };

    // Actual preset loading logic (called after confirmation or directly if no unsaved changes)
    const executeLoadPreset = async (preset) => {

        // Decrypt prompt if encrypted (for privacy)
        const decryptedPrompt = await decryptPrompt(preset.prompt, session?.user?.id) || '';

        setMainPrompt(decryptedPrompt);
        setBlockedCategories(preset.blocked_categories || {});
        setAllowListArray(preset.allow_list || []);
        setBlockListArray(preset.block_list || []);

        setActivePreset({ id: preset.id, name: preset.name });

        // Use decrypted prompt for comparison so isPresetModified works correctly
        setPresetOriginalState({
            prompt: decryptedPrompt,
            blocked_categories: preset.blocked_categories || {},
            allow_list: preset.allow_list || [],
            block_list: preset.block_list || []
        });

        // Clear any rename mode
        setIsRenamingPreset(false);
        setIsSavingPreset(false);
        setSaveWarning(null);
        setOverwriteCandidate(null);

        // Save the new state to the DB immediately
        await saveToSupabase({
            prompt: decryptedPrompt,
            blocked_categories: preset.blocked_categories,
            allow_list: preset.allow_list,
            block_list: preset.block_list
        }, preset.id);

        setLastCheckpoint({
            prompt: decryptedPrompt,
            blocked_categories: preset.blocked_categories || {},
            allow_list: preset.allow_list || [],
            block_list: preset.block_list || []
        });
        setHasUnsavedChanges(false);
    };

    const handleUnloadPreset = async () => {
        // Block preset unloading during strict mode (UI already disables button, this is a safeguard)
        if (isStrictModeActive) {
            setIsUnloadModalOpen(false);
            return;
        }

        setIsUnloadModalOpen(false);

        // 1. Reset Dashboard UI to Default State
        const initialCategories = {};
        BLOCKED_CATEGORIES.forEach(cat => initialCategories[cat.id] = false);

        setMainPrompt('');
        setBlockedCategories(initialCategories);
        setAllowListArray([]);
        setBlockListArray([]);

        // 2. Clear Active Preset Data
        setActivePreset(null);
        setPresetOriginalState(null);

        // 3. Persist the "Empty State" to Supabase
        // We pass 'null' as the activePresetId to break the link
        await saveToSupabase({
            prompt: '',
            blocked_categories: initialCategories,
            allow_list: [],
            block_list: []
        }, null);

        // 4. FORCE CACHE RESET
        // This dispatches the event that content-script.js listens for, 
        // causing it to tell background.js to wipe the chrome.storage cache.
        window.dispatchEvent(new CustomEvent('BEACON_RULES_UPDATED'));

        showToast('Dashboard cleared and cache reset.');
    };

    const handleRenamePreset = async (id, newName) => {
        const { error } = await supabase
            .from('settings_presets')
            .update({ name: newName })
            .eq('id', id);

        if (error) console.error('Error renaming preset:', error);
        else fetchPresets();
    };

    const handleDeletePreset = async (id) => {
        // Block deleting the active preset during strict mode (UI already disables button, this is a safeguard)
        if (isStrictModeActive && activePreset && activePreset.id === id) {
            return;
        }

        // If deleting the currently active preset, unload and RESET dashboard
        if (activePreset && activePreset.id === id) {
            setActivePreset(null);
            setPresetOriginalState(null);

            // Clear Dashboard State
            setMainPrompt('');
            setBlockedCategories({});
            setAllowListArray([]);
            setBlockListArray([]);

            // Persist the empty state and null preset
            await saveToSupabase({
                prompt: '',
                blocked_categories: {},
                allow_list: [],
                block_list: []
            }, null);
        }

        const { error } = await supabase
            .from('settings_presets')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting preset:', error);
            alert('Failed to delete preset');
        } else {
            fetchPresets();
        }
    };

    // --- Auto-resize text area on load ---
    useEffect(() => {
        if (mainPromptRef.current) {
            const textarea = mainPromptRef.current;
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    }, [mainPrompt]);

    // --- Fetch Logs Function (from Extension - Privacy First) ---
    const fetchLogs = async () => {
        if (!session?.user?.id) return;

        try {
            const extensionLogs = await fetchBlockLogsFromExtension();
            // Transform to match expected log format
            const formattedLogs = extensionLogs.map((log, index) => ({
                id: `local-${log.timestamp}-${index}`,
                url: log.url,
                domain: log.domain,
                decision: log.decision || 'BLOCK', // Use actual decision from extension
                reason: log.reason,
                page_title: log.pageTitle,
                active_prompt: log.activePrompt || null, // Include active prompt for filtering
                created_at: new Date(log.timestamp).toISOString()
            }));
            setLogs(formattedLogs);
        } catch (error) {
            console.error("Error fetching logs from extension:", error);
            setLogs([]);
        }
    };
    // --- Load user logs and poll for updates ---
    useEffect(() => {
        const currentUserId = session?.user?.id;
        if (!currentUserId) return;

        fetchLogs();

        // Poll for new logs every 10 seconds (reduced from 5s to prevent log spam)
        const pollInterval = setInterval(fetchLogs, 10000);

        return () => clearInterval(pollInterval);

    }, [session]);

    // --- Extension Bridge Listeners ---
    useEffect(() => {
        // Refresh logs when the extension announces an update (e.g. cache clear)
        const handleLogUpdate = () => {
            console.log('[BRIDGE] Log update announced by extension');
            fetchLogs();
        };

        // Sync theme if changed from popup or another tab
        const handleThemeUpdate = (event) => {
            if (event.detail?.theme && event.detail.theme !== theme) {
                console.log('[BRIDGE] Theme update announced by extension:', event.detail.theme);
                setTheme(event.detail.theme);
            }
        };

        // Sync pause state if changed from popup or another tab
        const handlePauseUpdate = (event) => {
            const paused = event.detail?.paused;
            if (typeof paused === 'boolean') {
                setUserSettings(prev => ({ ...prev, blockingPaused: paused }));
                localStorage.setItem('beacon_userSettings', JSON.stringify({
                    ...JSON.parse(localStorage.getItem('beacon_userSettings') || '{}'),
                    blockingPaused: paused
                }));
            }
        };

        window.addEventListener('BEACON_BLOCK_LOG_UPDATED', handleLogUpdate);
        window.addEventListener('BEACON_THEME_UPDATED', handleThemeUpdate);
        window.addEventListener('BEACON_PAUSE_UPDATED', handlePauseUpdate);

        return () => {
            window.removeEventListener('BEACON_BLOCK_LOG_UPDATED', handleLogUpdate);
            window.removeEventListener('BEACON_THEME_UPDATED', handleThemeUpdate);
            window.removeEventListener('BEACON_PAUSE_UPDATED', handlePauseUpdate);
        };
    }, [theme]); // Re-subscribe when theme changes to ensure handler has latest theme value

    const [inputError, setInputError] = useState({ type: null, msg: null }); // New error state
    const [clearConfirmation, setClearConfirmation] = useState(null); // 'allow' or 'block'
    const [showLogs, setShowLogs] = useState(() => localStorage.getItem('beacon_showLogs') === 'true'); // Collapsible logs state

    useEffect(() => { localStorage.setItem('beacon_showLogs', showLogs); }, [showLogs]);

    const [expandedLogId, setExpandedLogId] = useState(null); // Click to expand log details
    const [logDeleteConfirmId, setLogDeleteConfirmId] = useState(null); // Delete confirmation for individual logs
    const [signOutConfirmation, setSignOutConfirmation] = useState(false); // Sign out confirmation

    // --- Delete Single Log from Recent Activity ---
    const handleDeleteFromRecent = (logId, timestamp) => {
        if (logDeleteConfirmId === logId) {
            // Second click - actually delete
            document.dispatchEvent(new CustomEvent('BEACON_DELETE_SINGLE_LOG', {
                detail: { timestamp }
            }));
            setLogs(logs.filter(l => l.id !== logId));
            setLogDeleteConfirmId(null);
        } else {
            // First click - show confirmation
            setLogDeleteConfirmId(logId);
            setTimeout(() => setLogDeleteConfirmId(null), 3000);
        }
    };

    // Local getFaviconUrl removed (moved to top level)

    // ... (rest of the code)

    // --- Handle Sign Out ---
    const handleSignOut = async (force = false) => {
        if (force === true || signOutConfirmation) {
            await supabase.auth.signOut();
            window.location.reload();
        } else {
            setSignOutConfirmation(true);
            setTimeout(() => setSignOutConfirmation(false), 3000);
        }
    };

    // --- Handle Delete Account ---
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);

    const handleDeleteAccount = async () => {
        setIsDeletingAccount(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) throw new Error("No active session");

            const response = await fetch(config.BACKEND_URL + '/delete-account', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });


            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete account');
            }

            // Success
            await supabase.auth.signOut();
            window.location.reload();

        } catch (error) {
            console.error("Delete Account Error:", error);
            alert(`Failed to delete account: ${error.message}`);
            setIsDeletingAccount(false);
        }
    };

    // ... (rest of the code)









    // --- Handle checkbox changes (Auto-save) ---
    const handleCategoryChange = (event) => {
        const { name, checked } = event.target;

        const newCategories = { ...blockedCategories, [name]: checked };

        setBlockedCategories(newCategories);
        setSaveStatus('saving'); // Immediate "Listening" feedback
    };

    // --- Add Domain Handler (Auto-save) ---
    const handleAddDomain = (listType) => {
        // Block adding domains during strict mode (UI already disables inputs, this is a safeguard)
        if (isStrictModeActive) {
            return;
        }

        setInputError({ type: null, msg: null });
        const inputVal = (listType === 'allow' ? currentAllowInput : currentBlockInput).trim();

        if (!inputVal) return;

        if (inputVal.includes(' ')) {
            setInputError({ type: listType, msg: "URLs cannot contain spaces." });
            return;
        }

        let domain = null;
        const lowerInput = inputVal.toLowerCase();

        if (commonSiteMappings[lowerInput]) domain = commonSiteMappings[lowerInput];
        else if (!lowerInput.includes('.')) domain = lowerInput + '.com';
        else domain = getBaseDomain(inputVal);

        if (domain) {
            if (listType === 'allow') {
                if (blockListArray.includes(domain)) {
                    setInputError({ type: 'allow', msg: `${domain} is already in your Block list.` });
                    return;
                }
                if (!allowListArray.includes(domain)) {
                    const newList = [...allowListArray, domain].sort();
                    setAllowListArray(newList);
                    setCurrentAllowInput('');
                    setSaveStatus('saving'); // Immediate "Listening" feedback
                } else {
                    setCurrentAllowInput('');
                }
            } else {
                if (allowListArray.includes(domain)) {
                    setInputError({ type: 'block', msg: `${domain} is already in your Allow list.` });
                    return;
                }
                if (!blockListArray.includes(domain)) {
                    const newList = [...blockListArray, domain].sort();
                    setBlockListArray(newList);
                    setCurrentBlockInput('');
                    setSaveStatus('saving'); // Immediate "Listening" feedback
                } else {
                    setCurrentBlockInput('');
                }
            }
        }
        else {
            setInputError({ type: listType, msg: `Invalid domain. Try 'example.com'.` });
        }
    };

    // --- Remove Domain Handler (Auto-save) ---
    const handleRemoveDomain = (listType, domainToRemove) => {
        // Block removing domains during strict mode (UI already disables buttons, this is a safeguard)
        if (isStrictModeActive) {
            return;
        }

        if (listType === 'allow') {
            const newList = allowListArray.filter(d => d !== domainToRemove);
            setAllowListArray(newList);
            setSaveStatus('saving'); // Immediate "Listening" feedback
        } else {
            const newList = blockListArray.filter(d => d !== domainToRemove);
            setBlockListArray(newList);
            setSaveStatus('saving'); // Immediate "Listening" feedback
        }
    };

    // --- Clear List Handler (Auto-save) ---
    const handleClearList = (listType) => {
        // Block clearing lists during strict mode (UI already disables buttons, this is a safeguard)
        if (isStrictModeActive) {
            return;
        }

        if (clearConfirmation === listType) {
            if (listType === 'allow') {
                setAllowListArray([]);
                setSaveStatus('saving'); // Immediate "Listening" feedback
            } else {
                setBlockListArray([]);
                setSaveStatus('saving'); // Immediate "Listening" feedback
            }
            setClearConfirmation(null);
        } else {
            setClearConfirmation(listType);
            setTimeout(() => setClearConfirmation(null), 3000);
        }
    };

    // --- Handle Enter Key in Input ---
    const handleInputKeyDown = (event, listType) => {
        if (event.key === 'Enter') { event.preventDefault(); handleAddDomain(listType); }
    };

    // --- Debounced Global Auto-Save ---
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!loading && session?.user) {
                const currentConfig = {
                    prompt: mainPrompt,
                    blocked_categories: blockedCategories,
                    allow_list: allowListArray,
                    block_list: blockListArray
                };

                // Optimization: Don't save if matches checkpoint
                if (lastCheckpoint && areSettingsEqual(currentConfig, lastCheckpoint)) {
                    // If we were "listening" (orange), revert to saved (green) since we are back to sync
                    setSaveStatus(prev => prev === 'saving' ? 'saved' : prev);
                    return;
                }

                saveToSupabase(currentConfig);
            }
        }, 1000); // 1 second debounce

        return () => clearTimeout(timer);
    }, [mainPrompt, blockedCategories, allowListArray, blockListArray, loading, session, lastCheckpoint]);

    // --- Render Dashboard UI ---
    return (
        <div className="dashboard-container">
            {/* OnboardingTour removed from here to prevent duplication */}

            {/* Email Confirmation Banner */}
            {session?.user && !session.user.email_confirmed_at && (
                <div style={{
                    background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                    border: '1px solid #f59e0b',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.2)'
                }}>
                    <span style={{ fontSize: '24px' }}>📧</span>
                    <div>
                        <p style={{ margin: 0, fontWeight: '600', color: '#92400e' }}>
                            Please confirm your email
                        </p>
                        <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: '#a16207' }}>
                            Check your inbox for a confirmation link to activate all features.
                        </p>
                    </div>
                </div>
            )}
            {userSettings.showEnvironment && (
                <>
                    <div className="environmental-clouds">
                        {/* Fluffy clouds with natural irregular shapes and subtle shading */}
                        <svg className="cloud-band layer-1" viewBox="0 0 1200 200" preserveAspectRatio="none">
                            <defs>
                                <filter id="cloud-shadow-1" x="-20%" y="-20%" width="140%" height="140%">
                                    <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#94a3b8" floodOpacity="0.3" />
                                </filter>
                            </defs>
                            <g className="cloud-group" filter="url(#cloud-shadow-1)">
                                {/* Cloud cluster 1 */}
                                <ellipse cx="80" cy="110" rx="95" ry="75" />
                                <ellipse cx="150" cy="65" rx="115" ry="95" />
                                <ellipse cx="50" cy="55" rx="75" ry="65" />
                                <ellipse cx="230" cy="100" rx="88" ry="70" />
                                <ellipse cx="180" cy="135" rx="82" ry="62" />
                                {/* Cloud cluster 2 */}
                                <ellipse cx="360" cy="90" rx="105" ry="84" />
                                <ellipse cx="450" cy="45" rx="128" ry="105" />
                                <ellipse cx="310" cy="40" rx="82" ry="70" />
                                <ellipse cx="520" cy="85" rx="95" ry="78" />
                                <ellipse cx="390" cy="125" rx="75" ry="62" />
                                {/* Cloud cluster 3 */}
                                <ellipse cx="640" cy="100" rx="98" ry="78" />
                                <ellipse cx="740" cy="50" rx="135" ry="110" />
                                <ellipse cx="590" cy="45" rx="88" ry="75" />
                                <ellipse cx="830" cy="90" rx="84" ry="68" />
                                <ellipse cx="690" cy="130" rx="78" ry="62" />
                                {/* Cloud cluster 4 */}
                                <ellipse cx="940" cy="85" rx="115" ry="92" />
                                <ellipse cx="1030" cy="40" rx="108" ry="88" />
                                <ellipse cx="885" cy="45" rx="78" ry="65" />
                                <ellipse cx="1100" cy="80" rx="92" ry="75" />
                                <ellipse cx="970" cy="120" rx="70" ry="57" />
                                {/* Cloud cluster 5 - connects to start */}
                                <ellipse cx="1160" cy="95" rx="102" ry="82" />
                                <ellipse cx="1200" cy="110" rx="95" ry="75" />
                            </g>
                        </svg>
                        <svg className="cloud-band layer-2" viewBox="0 0 1200 200" preserveAspectRatio="none">
                            <defs>
                                <filter id="cloud-shadow-2" x="-20%" y="-20%" width="140%" height="140%">
                                    <feDropShadow dx="0" dy="3" stdDeviation="2" floodColor="#94a3b8" floodOpacity="0.25" />
                                </filter>
                            </defs>
                            <g className="cloud-group" filter="url(#cloud-shadow-2)">
                                {/* Offset cloud clusters */}
                                <ellipse cx="45" cy="130" rx="92" ry="75" />
                                <ellipse cx="140" cy="85" rx="110" ry="92" />
                                <ellipse cx="220" cy="120" rx="78" ry="65" />
                                <ellipse cx="95" cy="155" rx="68" ry="55" />
                                {/* Cluster 2 */}
                                <ellipse cx="320" cy="110" rx="102" ry="82" />
                                <ellipse cx="420" cy="60" rx="125" ry="102" />
                                <ellipse cx="500" cy="105" rx="88" ry="70" />
                                <ellipse cx="365" cy="140" rx="75" ry="60" />
                                {/* Cluster 3 */}
                                <ellipse cx="590" cy="120" rx="105" ry="84" />
                                <ellipse cx="700" cy="65" rx="120" ry="98" />
                                <ellipse cx="785" cy="110" rx="82" ry="68" />
                                <ellipse cx="640" cy="145" rx="70" ry="57" />
                                {/* Cluster 4 */}
                                <ellipse cx="880" cy="105" rx="108" ry="88" />
                                <ellipse cx="980" cy="55" rx="115" ry="95" />
                                <ellipse cx="1055" cy="100" rx="84" ry="70" />
                                <ellipse cx="920" cy="135" rx="75" ry="62" />
                                {/* Cluster 5 - connects */}
                                <ellipse cx="1130" cy="115" rx="98" ry="78" />
                                <ellipse cx="1200" cy="130" rx="92" ry="75" />
                            </g>
                        </svg>
                        {/* Layer 3: Bright white accent clouds - varied shapes */}
                        <svg className="cloud-band layer-3" viewBox="0 0 1200 200" preserveAspectRatio="none">
                            <defs>
                                <filter id="cloud-shadow-3" x="-20%" y="-20%" width="140%" height="140%">
                                    <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#94a3b8" floodOpacity="0.2" />
                                </filter>
                            </defs>
                            <g className="cloud-group" filter="url(#cloud-shadow-3)">
                                {/* Cluster 1 - tall wispy shape */}
                                <ellipse cx="70" cy="95" rx="55" ry="70" />
                                <ellipse cx="130" cy="60" rx="72" ry="58" />
                                <ellipse cx="45" cy="55" rx="48" ry="62" />
                                <ellipse cx="160" cy="100" rx="60" ry="50" />
                                {/* Cluster 2 - wide flat shape */}
                                <ellipse cx="320" cy="80" rx="95" ry="52" />
                                <ellipse cx="400" cy="55" rx="80" ry="48" />
                                <ellipse cx="280" cy="60" rx="70" ry="45" />
                                <ellipse cx="450" cy="85" rx="65" ry="55" />
                                {/* Cluster 3 - mixed puffy */}
                                <ellipse cx="600" cy="70" rx="68" ry="72" />
                                <ellipse cx="680" cy="95" rx="85" ry="55" />
                                <ellipse cx="560" cy="90" rx="55" ry="60" />
                                <ellipse cx="740" cy="65" rx="62" ry="52" />
                                {/* Cluster 4 - elongated */}
                                <ellipse cx="880" cy="75" rx="90" ry="50" />
                                <ellipse cx="970" cy="55" rx="75" ry="62" />
                                <ellipse cx="840" cy="60" rx="58" ry="55" />
                                <ellipse cx="1030" cy="90" rx="70" ry="48" />
                                {/* Cluster 5 - connects with varied shapes */}
                                <ellipse cx="1120" cy="80" rx="65" ry="68" />
                                <ellipse cx="1180" cy="95" rx="78" ry="55" />
                            </g>
                        </svg>
                    </div>
                    <div className="environmental-water">
                        {/* Two solid wave layers - pattern repeats at midpoint for seamless loop */}
                        <svg className="wave layer-1" viewBox="0 0 1200 320" preserveAspectRatio="none">
                            <path d="M0,80 Q75,140 150,80 Q225,20 300,80 Q375,140 450,80 Q525,20 600,80 Q675,140 750,80 Q825,20 900,80 Q975,140 1050,80 Q1125,20 1200,80 L1200,320 L0,320 Z" />
                        </svg>
                        <svg className="wave layer-2" viewBox="0 0 1200 320" preserveAspectRatio="none">
                            <path d="M0,100 Q100,160 200,100 Q300,40 400,100 Q500,160 600,100 Q700,40 800,100 Q900,160 1000,100 Q1100,40 1200,100 L1200,320 L0,320 Z" />
                        </svg>
                    </div>
                </>
            )}
            <div className="dashboard-header" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                marginBottom: '2rem',
                padding: '0'
            }}>
                <div id="tour-welcome-header" style={{ display: 'flex', alignItems: 'center', gap: '20px', position: 'relative' }}>
                    {/* Logo Wrapper with Beacon Light and Save Glow */}
                    <div
                        id="tour-auto-sync"
                        className={`logo-wrapper ${saveStatus === 'saving' ? 'saving' : saveStatus === 'saved' ? 'saved' : ''} ${extensionStatus !== 'active' && extensionStatus !== 'loading' ? 'disconnected' : ''}`}
                        style={{
                            position: 'relative',
                            width: '120px',
                            height: '120px',
                            borderRadius: '50%',
                            transition: 'box-shadow 0.3s ease'
                        }}
                    >
                        <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />

                        {/* Status Tooltip on Logo Hover */}
                        <div className="beacon-tooltip">
                            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                                {extensionStatus !== 'active' && extensionStatus !== 'loading'
                                    ? (extensionStatus === 'logged_out' ? 'Extension Disconnected' : 'Extension Not Detected')
                                    : saveStatus === 'saving' ? 'Saving Changes...'
                                        : saveStatus === 'saved' ? 'Changes Saved'
                                            : 'Extension Active'}
                            </div>
                            <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                                {extensionStatus !== 'active' && extensionStatus !== 'loading'
                                    ? (extensionStatus === 'logged_out'
                                        ? 'Click the extension icon and log in to sync.'
                                        : 'Please install or reload the extension.')
                                    : saveStatus === 'saving' ? 'Syncing your rules...'
                                        : saveStatus === 'saved' ? 'Your beacon is up to date.'
                                            : 'Your beacon is on and guiding the way.'}
                            </div>
                        </div>

                        <style>{`
                            .logo-wrapper {
                                position: relative; /* Needed for tooltip positioning */
                            }
                            .logo-wrapper:hover .beacon-tooltip {
                                opacity: 1;
                                visibility: visible;
                                transform: translateY(0);
                            }
                            .beacon-tooltip {
                                position: absolute;
                                top: 100%; /* Position below the beacon light */
                                left: 0;
                                transform: translateY(10px); /* Initial offset for animation */
                                background: #1e293b;
                                color: white;
                                padding: 8px 12px;
                                border-radius: 6px;
                                font-size: 0.85rem;
                                white-space: nowrap;
                                opacity: 0;
                                visibility: hidden;
                                transition: all 0.2s ease;
                                pointer-events: none;
                                z-index: 20;
                                margin-top: 10px; /* Space between beacon and tooltip */
                                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                            }
                        `}</style>
                    </div>

                    <h1 style={{ margin: 0, fontSize: '2.5rem', color: 'var(--text-primary)', fontWeight: '800', letterSpacing: '-1px' }}>
                        Beacon Blocker
                    </h1>
                </div>



                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    {/* Strict Mode Timer - in header for visibility */}
                    {userSettings.strictModeUntil && userSettings.strictModeUntil > Date.now() && (
                        <StrictModeTimer
                            endTime={userSettings.strictModeUntil}
                            isIndefinite={userSettings.strictModeIndefinite}
                            onExpire={() => {
                                setUserSettings(prev => ({ ...prev, strictModeUntil: null, strictMode: false }));
                            }}
                            onClick={() => {
                                setSettingsInitialTab('blocking');
                                setIsSettingsModalOpen(true);
                            }}
                        />
                    )}

                    {/* Referral Banner - Free until March 1 */}
                    <ReferralBanner
                        session={session}
                        onOpenSubscription={() => {
                            setSettingsInitialTab('subscription');
                            setIsSettingsModalOpen(true);
                        }}
                    />

                    <button
                        onClick={() => setIsSettingsModalOpen(true)}
                        className="settings-button"
                        id="tour-settings-btn"
                        title="Settings"
                    >
                        ⚙️
                    </button>
                    {/* Help button removed - onboarding still auto-plays for first-time users */}
                    <ProfileDropdown
                        userEmail={session.user.email}
                        onSignOut={handleSignOut}
                        onDeleteAccount={() => setIsDeleteModalOpen(true)}
                    />
                </div>
                {/* Save Status Indicator - REMOVED (Replaced by new buttons) */}
            </div>

            {/* Main Content - Centered with max-width */}
            <div className="dashboard-main-content">

                <DeleteAccountModal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    onDelete={handleDeleteAccount}
                    loading={isDeletingAccount}
                />

                <SettingsModal
                    isOpen={isSettingsModalOpen}
                    initialTab={settingsInitialTab}
                    onClose={() => {
                        setIsSettingsModalOpen(false);
                        setSettingsInitialTab('analytics'); // Reset
                    }}
                    settings={userSettings}
                    onSave={(newSettings) => {
                        setUserSettings(newSettings);
                        localStorage.setItem('beacon_userSettings', JSON.stringify(newSettings));
                    }}
                    storageUsage={storageUsage}
                    userEmail={session.user.email}
                    session={session}
                    onDeleteAccount={() => {
                        setIsSettingsModalOpen(false);
                        setIsDeleteModalOpen(true);
                    }}
                    onRestartTour={onRestartTour}
                    theme={theme}
                    onThemeChange={onThemeChange}
                />

                <UnloadPresetModal
                    isOpen={isUnloadModalOpen}
                    onClose={() => setIsUnloadModalOpen(false)}
                    onUnload={handleUnloadPreset}
                />

                {/* Blocking Paused Banner */}
                {userSettings.blockingPaused && (
                    <div style={{
                        background: 'rgba(234, 179, 8, 0.15)',
                        border: '2px solid #eab308',
                        borderRadius: '12px',
                        padding: '1rem 1.5rem',
                        marginBottom: '1.5rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        position: 'relative',
                        zIndex: 2,
                        boxShadow: '0 4px 12px rgba(234, 179, 8, 0.2)'
                    }}>
                        <div>
                            <h4 style={{ margin: '0 0 4px 0', color: '#ca8a04', fontSize: '1rem' }}>
                                Blocking is Paused
                            </h4>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                Beacon Blocker is not currently blocking any content. All pages will load normally.
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                // Sync to extension FIRST (before state update hides banner)
                                syncPauseToExtension(false);
                                setUserSettings(prev => ({ ...prev, blockingPaused: false }));
                                localStorage.setItem('beacon_userSettings', JSON.stringify({ ...userSettings, blockingPaused: false }));
                            }}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '6px',
                                border: 'none',
                                background: '#22c55e',
                                color: 'white',
                                fontWeight: '600',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            Resume
                        </button>
                    </div>
                )}

                <form onSubmit={(e) => e.preventDefault()}>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <div className="beacon-light-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.5rem' }}>
                            <label
                                htmlFor="tour-main-prompt"
                                className="main-prompt-label"
                                style={{ display: 'inline-block' }}
                            >
                                Light your beacon and let it guide you.
                            </label>

                            {/* Validation Notification Area */}
                            {(saveWarning || overwriteCandidate || pendingLoadPreset) && (
                                <div className="validation-notification">
                                    {pendingLoadPreset ? (
                                        <>
                                            <span className="validation-text">Current preset has unsynced changes. Load "{pendingLoadPreset.name}" anyway?</span>
                                            <div className="validation-actions">
                                                <button
                                                    className="validation-btn confirm"
                                                    onClick={async () => {
                                                        const presetToLoad = pendingLoadPreset;
                                                        setPendingLoadPreset(null);
                                                        await executeLoadPreset(presetToLoad);
                                                    }}
                                                >
                                                    Yes
                                                </button>
                                                <button
                                                    className="validation-btn cancel"
                                                    onClick={() => setPendingLoadPreset(null)}
                                                >
                                                    No
                                                </button>
                                            </div>
                                        </>
                                    ) : overwriteCandidate ? (
                                        <>
                                            <span className="validation-text">Preset "{overwriteCandidate.name}" exists. Overwrite?</span>
                                            <div className="validation-actions">
                                                <button
                                                    className="validation-btn confirm"
                                                    onClick={() => executeSave(newPresetName, overwriteCandidate.id)}
                                                >
                                                    Yes
                                                </button>
                                                <button
                                                    className="validation-btn cancel"
                                                    onClick={() => setOverwriteCandidate(null)}
                                                >
                                                    No
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <span className="validation-text">{saveWarning}</span>
                                    )}
                                </div>
                            )}
                        </div>

                        <textarea
                            id="tour-main-prompt"
                            name="mainPrompt"
                            ref={mainPromptRef}
                            className={`main-prompt-textarea ${isStrictModeActive ? 'strict-mode-locked' : ''}`}
                            placeholder={isStrictModeActive ? "Strict Mode is active. Focus rules are locked." : placeholderText}
                            value={mainPrompt}
                            onChange={handleTextAreaChange}
                            disabled={isStrictModeActive}
                        />

                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginTop: '0.5rem' }}>
                            {(() => {
                                const isDisconnected = extensionStatus !== 'active' && extensionStatus !== 'loading';
                                const dotColor = isDisconnected ? '#ef4444' : saveStatus === 'saving' ? '#eab308' : '#22c55e';
                                const textColor = isDisconnected ? '#ef4444' : saveStatus === 'saving' ? '#eab308' : 'var(--text-secondary)';
                                const label = isDisconnected ? 'Extension disconnected' : saveStatus === 'saving' ? 'Syncing...' : 'Auto-synced';
                                return (
                                    <span style={{
                                        fontSize: '0.7rem',
                                        color: textColor,
                                        opacity: 0.7,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        <span style={{
                                            width: '6px', height: '6px', borderRadius: '50%',
                                            backgroundColor: dotColor,
                                            display: 'inline-block',
                                            transition: 'background-color 0.3s ease',
                                        }} />
                                        {label}
                                    </span>
                                );
                            })()}

                            <div style={{ width: '1px', height: '16px', background: 'var(--border-color)' }}></div>

                            <button type="button" className="examples-toggle" style={{ marginTop: 0 }} onClick={() => setShowExamples(!showExamples)}>
                                {showExamples ? 'Hide Examples' : 'Need inspiration? See Examples'}
                            </button>

                            <div style={{ width: '1px', height: '20px', background: 'var(--border-color)' }}></div>

                            <div id="tour-presets-section" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>

                                {/* --- UPDATE PRESET BUTTON --- */}
                                <button
                                    id="tour-update-preset-btn"
                                    className={`preset-button ${activePreset && isPresetModified ? 'primary' : 'neutral'}`}
                                    onClick={activePreset && isPresetModified ? handleUpdateActivePreset : undefined}
                                    disabled={!activePreset || !isPresetModified}
                                    title={
                                        !activePreset
                                            ? "Load a preset to enable updating"
                                            : isPresetModified
                                                ? `Update preset "${activePreset.name}"`
                                                : "No changes to update"
                                    }
                                    style={{
                                        minWidth: '70px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        opacity: (!activePreset || !isPresetModified || isStrictModeActive) ? 0.5 : 1,
                                        cursor: (!activePreset || !isPresetModified || isStrictModeActive) ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    Update Preset
                                </button>

                                {/* --- SAVE AS BUTTON --- */}
                                {isSavingPreset ? (
                                    <div className="inline-save-container">
                                        <input
                                            type="text"
                                            className="inline-save-input"
                                            value={newPresetName}
                                            onChange={(e) => {
                                                setNewPresetName(e.target.value);
                                                setSaveWarning(null);
                                                setOverwriteCandidate(null);
                                            }}
                                            onFocus={(e) => e.target.select()}
                                            autoFocus
                                            placeholder="Preset Name"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleConfirmSavePreset();
                                                if (e.key === 'Escape') handleCancelSavePreset();
                                            }}
                                        />
                                        <button className="inline-action-btn confirm" onClick={handleConfirmSavePreset} title="Save">✓</button>
                                        <button className="inline-action-btn cancel" onClick={handleCancelSavePreset} title="Cancel">✕</button>
                                    </div>
                                ) : (
                                    <button
                                        id="tour-save-preset-btn"
                                        className="preset-button"
                                        onClick={handleStartSavePreset}
                                    >
                                        New Preset
                                    </button>
                                )}

                                {/* --- LOAD BUTTON --- */}
                                <button
                                    id="tour-load-preset-btn"
                                    className="preset-button"
                                    onClick={() => setIsPresetsModalOpen(true)}
                                >
                                    Load Preset
                                </button>
                            </div>
                        </div>
                        <style>{`
                        @keyframes pulse {
                            0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                            70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
                            100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                        }
                        .spinner {
                            width: 12px;
                            height: 12px;
                            border: 2px solid var(--text-secondary);
                            border-top-color: transparent;
                            border-radius: 50%;
                            animation: spin 1s linear infinite;
                            display: inline-block;
                        }
                        @keyframes spin {
                            to { transform: rotate(360deg); }
                        }
                    `}</style>

                        {showExamples && (
                            <div className="examples-content">
                                <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '8px', lineHeight: 1.4 }}>
                                    Your Beacon evaluates each page you visit by its URL and title. Use it for nuanced rules. For simple site blocking, try the <strong>Categories</strong> or <strong>Allow/Block Lists</strong> below.
                                </p>
                                <div className="example-item">
                                    <span className="example-label">Smart Filter:</span>
                                    "Allow <strong>educational YouTube</strong> videos about coding and science. Block entertainment, drama, and shorts."
                                </div>
                                <div className="example-item">
                                    <span className="example-label">Goal-Based:</span>
                                    "I'm planning a vacation. Allow <strong>travel and hotel sites</strong> but block social media and news."
                                </div>
                                <div className="example-item">
                                    <span className="example-label">Timer-Based:</span>
                                    "Block all social media <strong>for 2 hours</strong> so I can focus on my assignment."
                                </div>
                                <div className="example-item">
                                    <span className="example-label">Schedule-Based:</span>
                                    "Block Reddit and Twitter <strong>until 5 PM</strong> when my workday ends."
                                </div>
                                <div className="example-item">
                                    <span className="example-label">Content Safety:</span>
                                    "Block any website with <strong>explicit, violent, or adult content</strong>."
                                </div>
                                <div className="example-item">
                                    <span className="example-label">Total Lockdown:</span>
                                    "Block <strong>everything except Gmail and Google Docs</strong> — I have a deadline in 1 hour."
                                </div>
                            </div>
                        )}
                    </div>



                    {/* --- Collapsible Additional Controls --- */}
                    <div style={helperSectionStyles} id="tour-additional-controls">
                        <div
                            className={`helpers-header ${showHelpers ? 'active' : ''}`}
                            onClick={() => setShowHelpers(!showHelpers)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                                    <span className="toggle-icon" style={{ marginRight: '8px' }}>{showHelpers ? '▼' : '▶'}</span>
                                    Additional Controls
                                </h3>
                                <p style={{ margin: '4px 0 0 24px', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 'normal' }}>
                                    Advanced controls to fine-tune your Beacon
                                </p>
                            </div>
                        </div>

                        {showHelpers && (
                            <div className="helpers-content">
                                <fieldset style={{ border: 'none', padding: '0', margin: '1.5rem 0' }}>
                                    <legend style={{ fontWeight: '700', fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>
                                        Quick Block Categories
                                    </legend>
                                    <div className="category-grid" id="tour-categories">
                                        {BLOCKED_CATEGORIES.map((category) => (
                                            <div key={category.id} className={`category-card ${blockedCategories[category.id] ? 'active' : ''} ${isStrictModeActive ? 'locked' : ''}`}
                                                onClick={() => {
                                                    if (isStrictModeActive) return;
                                                    handleCategoryChange({ target: { name: category.id, checked: !blockedCategories[category.id] } })
                                                }}>
                                                <div className="category-header">
                                                    <div className="category-info">
                                                        <span className="category-label">{category.label}</span>
                                                        <span className="category-desc">{category.desc}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </fieldset>

                                <div className="lists-container" id="tour-lists">
                                    {/* --- Always Allow (White List) --- */}
                                    <div className={`list-section whitelist-section ${isStrictModeActive ? 'locked' : ''}`}>
                                        <div className="list-header">
                                            <div>
                                                <h4>Always Allow</h4>
                                                <p>Websites in this list will <strong>bypass</strong> all blocking rules.</p>
                                            </div>
                                            {allowListArray.length > 0 && (
                                                <button type="button"
                                                    className={`clear-list-button ${clearConfirmation === 'allow' ? 'confirming' : ''}`}
                                                    onClick={() => handleClearList('allow')}
                                                    disabled={isStrictModeActive}
                                                    style={isStrictModeActive ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
                                                    {clearConfirmation === 'allow' ? 'Are you sure?' : 'Clear All'}
                                                </button>
                                            )}
                                        </div>
                                        <div className="tag-input-wrapper">
                                            <input type="text" id="allowInput" className="tag-input-field"
                                                placeholder={isStrictModeActive ? "Locked during Strict Mode" : "example.com"}
                                                autoComplete="off"
                                                value={currentAllowInput}
                                                onChange={(e) => { setCurrentAllowInput(e.target.value); setInputError({ type: null, msg: null }); }}
                                                onKeyDown={(e) => handleInputKeyDown(e, 'allow')}
                                                disabled={isStrictModeActive}
                                                style={isStrictModeActive ? { opacity: 0.6, cursor: 'not-allowed' } : {}} />
                                            <button type="button" className="tag-input-button" onClick={() => handleAddDomain('allow')}
                                                disabled={isStrictModeActive}
                                                style={isStrictModeActive ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>Add</button>
                                        </div>
                                        {inputError.type === 'allow' && <div className="input-error-msg">{inputError.msg}</div>}
                                        <div className="tag-list">
                                            {allowListArray.map((domain) => (
                                                <span key={domain} className="tag-item allow-tag">
                                                    {domain}
                                                    <button type="button" className="tag-remove-button"
                                                        onClick={() => handleRemoveDomain('allow', domain)} aria-label={`Remove ${domain}`}
                                                        disabled={isStrictModeActive}
                                                        style={isStrictModeActive ? { opacity: 0.3, cursor: 'not-allowed' } : {}}>&times;</button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* --- Always Block (Black List) --- */}
                                    <div className={`list-section blacklist-section ${isStrictModeActive ? 'locked' : ''}`}>
                                        <div className="list-header">
                                            <div>
                                                <h4>Always Block</h4>
                                                <p>Websites in this list will be <strong>blocked</strong> regardless of your goal.</p>
                                            </div>
                                            {blockListArray.length > 0 && (
                                                <button type="button"
                                                    className={`clear-list-button ${clearConfirmation === 'block' ? 'confirming' : ''}`}
                                                    onClick={() => handleClearList('block')}
                                                    disabled={isStrictModeActive}
                                                    style={isStrictModeActive ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
                                                    {clearConfirmation === 'block' ? 'Are you sure?' : 'Clear All'}
                                                </button>
                                            )}
                                        </div>
                                        <div className="tag-input-wrapper">
                                            <input type="text" id="blockInput" className="tag-input-field"
                                                placeholder={isStrictModeActive ? "Locked during Strict Mode" : "example.com"}
                                                autoComplete="off"
                                                value={currentBlockInput}
                                                onChange={(e) => { setCurrentBlockInput(e.target.value); setInputError({ type: null, msg: null }); }}
                                                onKeyDown={(e) => handleInputKeyDown(e, 'block')}
                                                disabled={isStrictModeActive}
                                                style={isStrictModeActive ? { opacity: 0.6, cursor: 'not-allowed' } : {}} />
                                            <button type="button" className="tag-input-button" onClick={() => handleAddDomain('block')}
                                                disabled={isStrictModeActive}
                                                style={isStrictModeActive ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>Add</button>
                                        </div>
                                        {inputError.type === 'block' && <div className="input-error-msg">{inputError.msg}</div>}
                                        <div className="tag-list">
                                            {blockListArray.map((domain) => (
                                                <span key={domain} className="tag-item block-tag">
                                                    {domain}
                                                    <button type="button" className="tag-remove-button"
                                                        onClick={() => handleRemoveDomain('block', domain)} aria-label={`Remove ${domain}`}
                                                        disabled={isStrictModeActive}
                                                        style={isStrictModeActive ? { opacity: 0.3, cursor: 'not-allowed' } : {}}>&times;</button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </form>

                {/* --- LOG FEED SECTION --- */}
                <div style={{ marginTop: '2rem' }} id="tour-recent-activity-container">
                    {/* --- RECENT ACTIVITY --- */}
                    <div
                        className={`helpers-header ${showLogs ? 'active' : ''} recent-activity-section`}
                        id="tour-recent-activity"
                        onClick={() => setShowLogs(!showLogs)}
                        style={{
                            marginBottom: showLogs ? '1.5rem' : '0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                                <span
                                    className="toggle-icon"
                                    style={{
                                        marginRight: '8px'
                                    }}
                                >
                                    {showLogs ? '▼' : '▶'}
                                </span>
                                Browsing Activity
                            </h3>
                            <p style={{ margin: '4px 0 0 24px', color: '#64748b', fontSize: '0.9rem' }}>Sites checked by Beacon</p>
                        </div>
                    </div>



                    {showLogs && (
                        <div className="log-feed-container">
                            {logs.length === 0 ? (
                                <div className="empty-logs" id="tour-recent-activity-item-0">
                                    <span style={{ fontSize: '2rem', marginBottom: '0.5rem', display: 'block' }}>🌊</span>
                                    <p>No activity recorded yet.</p>
                                    <small>Browse the web to see your Beacon in action.</small>
                                </div>
                            ) : (
                                <>
                                    <ul className="log-feed-list">
                                        {logs.slice(0, 5).map((log, index) => {
                                            // Detect log types
                                            const isCache = log.reason && log.reason.toLowerCase().includes('cached decision');
                                            const isSystemReset = log.url && log.url.includes('system-reset');
                                            const isAllowDecision = log.decision === 'ALLOW';

                                            // Reason text logic
                                            let mainReason = log.reason || 'Blocked';
                                            let expandedReason = log.reason || 'Blocked';

                                            if (isSystemReset) {
                                                mainReason = "System Action";
                                            } else if (isCache) {
                                                // Extract original reason from "Cached decision · Reason" format
                                                const cachedParts = log.reason.split(' · ');
                                                const originalReason = cachedParts.length > 1 ? cachedParts.slice(1).join(' · ') : null;
                                                mainReason = originalReason ? `Cached · ${originalReason}` : "Cached decision";
                                                expandedReason = originalReason || "Previously evaluated";
                                            }
                                            // Helper to get brand style
                                            const getLogStyle = (domain) => {
                                                const baseDomain = domain.split('.').slice(-2).join('.');
                                                return BRAND_COLORS[domain] || BRAND_COLORS[baseDomain];
                                            };

                                            let itemStyle = {};
                                            // 1. System Reset (Highest Priority)
                                            if (isSystemReset) {
                                                itemStyle = { backgroundColor: SYSTEM_RESET_STYLE.bg, borderColor: SYSTEM_RESET_STYLE.border };
                                            }
                                            // 2. Cached decisions - yellow accent
                                            else if (isCache) {
                                                itemStyle = {
                                                    borderLeft: '3px solid #eab308',
                                                    backgroundColor: 'rgba(234, 179, 8, 0.06)',
                                                };
                                            }
                                            // 3. Brand colors for known domains
                                            else {
                                                const brandStyle = getLogStyle(log.domain);
                                                if (brandStyle) {
                                                    itemStyle = {
                                                        backgroundColor: brandStyle.bg,
                                                        borderColor: brandStyle.border,
                                                    };
                                                }
                                            }

                                            return (
                                                <li
                                                    key={log.id}
                                                    id={index === 0 ? 'tour-recent-activity-item-0' : undefined}
                                                    className="log-item"
                                                    onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                                                    style={{
                                                        cursor: 'pointer',
                                                        flexDirection: 'column',
                                                        alignItems: 'stretch',
                                                        ...itemStyle
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                                        <div className="log-icon">
                                                            {isSystemReset ? (
                                                                <div style={{
                                                                    width: '24px', height: '24px', borderRadius: '4px',
                                                                    background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    color: '#2563eb'
                                                                }}>
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                        <polyline points="23 4 23 10 17 10"></polyline>
                                                                        <polyline points="1 20 1 14 7 14"></polyline>
                                                                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                                                                    </svg>
                                                                </div>
                                                            ) : isCache ? (
                                                                <div style={{
                                                                    width: '24px', height: '24px', borderRadius: '4px',
                                                                    background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    color: '#d97706'
                                                                }}>
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                        <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                                                                        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                                                                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                                                                    </svg>
                                                                </div>
                                                            ) : (
                                                                <img
                                                                    src={getFaviconUrl(log.domain)}
                                                                    alt=""
                                                                    style={{ width: '24px', height: '24px', borderRadius: '4px' }}
                                                                    onError={(e) => { e.target.onerror = null; e.target.src = 'https://www.google.com/s2/favicons?domain=example.com'; }}
                                                                />
                                                            )}
                                                        </div>
                                                        <div className="log-details" style={{ minWidth: 0 }}>
                                                            <span className="log-url" title={log.url} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {log.page_title || log.domain || 'Unknown Page'}
                                                            </span>
                                                            <span className="log-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span>
                                                                    {(() => {
                                                                        const date = new Date(log.created_at);
                                                                        const now = new Date();
                                                                        const isToday = date.getDate() === now.getDate() &&
                                                                            date.getMonth() === now.getMonth() &&
                                                                            date.getFullYear() === now.getFullYear();
                                                                        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                                        return isToday ? timeStr : `${date.toLocaleDateString()} • ${timeStr}`;
                                                                    })()}
                                                                </span>
                                                            </span>
                                                            <span className="log-reason" title={mainReason} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.8rem', marginTop: '2px' }}>
                                                                {mainReason}
                                                            </span>
                                                        </div>
                                                        {!isSystemReset && userSettings?.logAllowDecisions && (
                                                            <div style={{
                                                                marginLeft: 'auto',
                                                                padding: '0.2rem 0.5rem',
                                                                borderRadius: '4px',
                                                                fontSize: '0.65rem',
                                                                fontWeight: '600',
                                                                textTransform: 'uppercase',
                                                                letterSpacing: '0.5px',
                                                                backgroundColor: isAllowDecision ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                                color: isAllowDecision ? '#16a34a' : '#dc2626',
                                                                whiteSpace: 'nowrap',
                                                            }}>
                                                                {isAllowDecision ? 'Allowed' : 'Blocked'}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {expandedLogId === log.id && (
                                                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                                            {!isSystemReset && (
                                                                <p style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}><strong>URL:</strong> <a href={log.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '400px', display: 'inline-block' }}>{log.url}</a></p>
                                                            )}
                                                            <p><strong>Reason:</strong> {expandedReason}</p>
                                                            {log.active_prompt && (
                                                                <p><strong>Instructions:</strong> "{log.active_prompt}"</p>
                                                            )}
                                                            <p><strong>Time:</strong> {new Date(log.created_at).toLocaleString()}</p>

                                                            {/* Feature: Link to history for Domain or Prompt */}
                                                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                                                                <button
                                                                    className="history-link-button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (onOpenHistoryWithSearch) onOpenHistoryWithSearch(log.domain);
                                                                    }}
                                                                >
                                                                    View all from {log.domain}
                                                                </button>
                                                                {log.active_prompt && (
                                                                    <button
                                                                        className="history-link-button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (onOpenHistoryWithSearch) onOpenHistoryWithSearch(log.active_prompt);
                                                                        }}
                                                                        title={`Filter by: "${log.active_prompt}"`}
                                                                    >
                                                                        View all with this prompt
                                                                    </button>
                                                                )}
                                                                <button
                                                                    className="history-link-button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const timestamp = parseInt(log.id.split('-')[1]);
                                                                        handleDeleteFromRecent(log.id, timestamp);
                                                                    }}
                                                                    style={logDeleteConfirmId === log.id ? {
                                                                        color: '#fff',
                                                                        borderColor: '#dc2626',
                                                                        backgroundColor: '#dc2626'
                                                                    } : {}}
                                                                >
                                                                    {logDeleteConfirmId === log.id ? 'Confirm Delete?' : 'Delete Entry'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </>
                            )}
                            <button
                                type="button"
                                className="view-history-button"
                                id="tour-view-history-btn"
                                onClick={onOpenHistory}
                            >
                                View Full History
                            </button>
                        </div>
                    )}
                </div>
                {/* --- END LOG FEED SECTION --- */}

                {/* --- RENDER THE MODAL --- */}
                {/* FullHistoryModal moved to App.jsx */}
                {/* SavePresetModal removed */}

                <PresetsModal
                    isOpen={isPresetsModalOpen}
                    onClose={() => setIsPresetsModalOpen(false)}
                    presets={presets}
                    activePresetId={activePreset?.id}
                    onLoad={handleLoadPreset}
                    onRename={handleRenamePreset}
                    onDelete={handleDeletePreset}
                    isStrictModeActive={isStrictModeActive}
                />

                {/* Toast Notification */}
                {message && (
                    <div className={`toast-notification ${message.includes('Error') || message.includes('Cannot') ? 'error' : 'success'}`}>
                        <span className="toast-message">{message}</span>
                        <button className="toast-close" onClick={() => setMessage(null)}>×</button>
                    </div>
                )}
            </div>{/* End dashboard-main-content */}
        </div>
    );
}


// === Password Reset Component ===
function PasswordResetForm({ onSuccess }) {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);

    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        setLoading(true); setMessage(null);

        if (password.length < 6) {
            setMessage("Password must be at least 6 characters.");
            setLoading(false);
            return;
        }

        if (password !== confirmPassword) {
            setMessage("Passwords do not match.");
            setLoading(false);
            return;
        }

        const { error } = await supabase.auth.updateUser({ password: password });

        if (error) {
            setMessage(`Error: ${error.message}`);
        } else {
            setMessage("Password updated successfully! Redirecting...");
            setTimeout(() => {
                onSuccess();
            }, 1500);
        }
        setLoading(false);
    };

    return (
        <div className="auth-container">
            <div className="auth-card mode-login">
                <style>{`
                    .toggle-password {
                        background: none;
                        border: none;
                        color: var(--text-muted);
                        cursor: pointer;
                        font-size: 0.8rem;
                        position: absolute;
                        right: 10px;
                        top: 38px;
                    }
                `}</style>
                <h2 style={{ textAlign: 'center', color: 'var(--primary-blue)', marginBottom: '1.5rem', marginTop: 0 }}>Set New Password</h2>
                <form onSubmit={handlePasswordUpdate}>
                    <div className="form-group" style={{ position: 'relative' }}>
                        <label className="form-label">New Password</label>
                        <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="form-input"
                            placeholder="Enter new password"
                            required
                        />
                        <button
                            type="button"
                            className="toggle-password"
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            {showPassword ? "Hide" : "Show"}
                        </button>
                    </div>

                    <div className="form-group" style={{ position: 'relative' }}>
                        <label className="form-label">Confirm Password</label>
                        <input
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="form-input"
                            placeholder="Confirm new password"
                            required
                        />
                        <button
                            type="button"
                            className="toggle-password"
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            {showPassword ? "Hide" : "Show"}
                        </button>
                    </div>

                    <button type="submit" disabled={loading} className="auth-button">
                        {loading ? 'Updating...' : 'Update Password'}
                    </button>

                    {message && (
                        <div style={{
                            marginTop: '1rem',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            textAlign: 'center',
                            fontSize: '0.9rem',
                            backgroundColor: message.startsWith('Error') || message.includes('do not match') ? '#fee2e2' : '#dcfce7',
                            color: message.startsWith('Error') || message.includes('do not match') ? '#b91c1c' : '#15803d'
                        }}>
                            {message}
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}

// === Custom Auth Component ===
function AuthForm({ supabase }) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);

    // Check URL for referral code on mount
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const ref = urlParams.get('ref');
        if (ref) {
            setReferralCode(ref);
            setIsLogin(false); // Switch to signup mode if coming from referral link
        }
    }, []);


    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        if (isLogin) {
            // Login Logic
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) {
                // Check if user exists to give better error
                try {
                    const checkRes = await fetch(config.BACKEND_URL + '/check-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    });
                    const checkData = await checkRes.json();

                    if (checkData.exists === false) {
                        setMessage("No account found with this email.");
                    } else {
                        setMessage("Incorrect password.");
                    }
                } catch (checkErr) {
                    console.error("Check Email Failed:", checkErr);
                    setMessage(error.message); // Fallback to default
                }
            }
        } else {
            // Sign Up Logic - Use backend endpoint to handle referral codes and trial
            if (password.length < 6) {
                setMessage("Password must be at least 6 characters.");
                setLoading(false);
                return;
            }

            try {
                const signupRes = await fetch(`${config.BACKEND_URL}/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const signupData = await signupRes.json();

                if (!signupRes.ok) {
                    // Check if it's a rate limit error from Supabase
                    const errorMsg = signupData.error || 'Signup failed';
                    if (errorMsg.toLowerCase().includes('wait') || errorMsg.toLowerCase().includes('rate')) {
                        setMessage("Please wait a moment before trying again. If you already signed up, check your inbox for the confirmation email!");
                    } else {
                        setMessage(errorMsg);
                    }
                } else if (signupData.user?.identities?.length === 0) {
                    // Supabase returns empty identities for existing confirmed email
                    // This email is already registered and confirmed - user should log in instead
                    setMessage("This email is already registered. Please log in instead, or use 'Forgot Password' if needed.");
                } else if (signupData.user && !signupData.user.email_confirmed_at && signupData.user.identities?.length > 0) {
                    // User exists but email not confirmed yet - could be re-signup attempt
                    // Supabase will resend confirmation email
                    setMessage("We've resent a confirmation email. Please check your inbox (and spam folder).");
                } else {
                    // Clear the onboarding flag so the tutorial shows for new users
                    localStorage.removeItem('hasSeenOnboarding');
                    setMessage("Account created! Please check your email to confirm your account.");
                }
            } catch (err) {
                console.error('Signup error:', err);
                setMessage('Network error. Please try again.');
            }
        }
        setLoading(false);
    };

    const handleGoogleLogin = async () => {
        // Store referral code from URL if present (for new signups via OAuth)
        const urlParams = new URLSearchParams(window.location.search);
        const ref = urlParams.get('ref');
        if (ref) {
            localStorage.setItem('pendingReferralCode', ref.toUpperCase());
        }

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin,
            },
        });
        if (error) setMessage(error.message);
    };

    const handleForgotPassword = async () => {
        if (!email) {
            setMessage("Please enter your email address first.");
            return;
        }
        setLoading(true);
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin,
        });
        if (error) setMessage(error.message);
        else setMessage("Password reset link sent to your email!");
        setLoading(false);
    };

    const generateSecurePassword = () => {
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
        let newPassword = "";
        for (let i = 0; i < 16; i++) {
            newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setPassword(newPassword);
        setShowPassword(true); // Show it so they can copy it
    };

    return (
        <div className="auth-container">
            <div className={`auth-card ${isLogin ? 'mode-login' : 'mode-signup'}`}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <img src="/logo.png" alt="Beacon Blocker Logo" style={{ width: '80px', height: '80px', marginBottom: '1rem', borderRadius: '50%' }} />
                    <h1 style={{ margin: 0, color: isLogin ? 'var(--primary-blue)' : 'var(--primary-red)' }}>
                        Beacon Blocker
                    </h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        {isLogin ? 'Sign in to manage your rules' : 'Create an account to get started'}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={handleGoogleLogin}
                    style={{
                        width: '100%',
                        padding: '0.75rem',
                        marginBottom: '1.5rem',
                        backgroundColor: 'white',
                        color: '#333',
                        border: '2px solid #e2e8f0',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        fontWeight: '500',
                        fontSize: '1rem'
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" fillRule="evenodd" />
                        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.715H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" fillRule="evenodd" />
                        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" fillRule="evenodd" />
                        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.272C4.672 5.14 6.656 3.58 9 3.58z" fill="#EA4335" fillRule="evenodd" />
                    </svg>
                    {isLogin ? 'Sign in with Google' : 'Sign up with Google'}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', margin: '1.5rem 0', color: '#94a3b8', fontSize: '0.875rem' }}>
                    <div style={{ flex: 1, borderBottom: '1px solid #e2e8f0' }}></div>
                    <span style={{ margin: '0 0.5rem' }}>OR</span>
                    <div style={{ flex: 1, borderBottom: '1px solid #e2e8f0' }}></div>
                </div>

                <form onSubmit={handleAuth}>
                    <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <input
                            type="email"
                            className="form-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showPassword ? "text" : "password"}
                                className="form-input"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                style={{ paddingRight: '80px' }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: 'absolute',
                                    right: '5px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    color: '#64748b',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    width: 'auto',
                                    padding: '5px'
                                }}
                            >
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                            <button
                                type="button"
                                onClick={generateSecurePassword}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: isLogin ? 'var(--primary-blue)' : 'var(--primary-red)',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    padding: '0',
                                    width: 'auto'
                                }}
                            >
                                Generate Secure Password
                            </button>
                            <span
                                className="auth-link"
                                onClick={handleForgotPassword}
                                style={{ fontSize: '0.8rem' }}
                            >
                                Forgot Password?
                            </span>
                        </div>
                    </div>

                    {message && (
                        <div style={{
                            padding: '0.75rem',
                            borderRadius: '8px',
                            marginBottom: '1rem',
                            backgroundColor: message.includes('sent') || message.includes('created') ? '#dcfce7' : '#fee2e2',
                            color: message.includes('sent') || message.includes('created') ? '#166534' : '#991b1b',
                            fontSize: '0.875rem'
                        }}>
                            {message}
                        </div>
                    )}

                    <button type="submit" className="auth-button" disabled={loading}>
                        {loading ? 'Processing...' : (isLogin ? 'Log In' : 'Sign Up')}
                    </button>
                </form>

                <div className="auth-toggle">
                    {isLogin ? (
                        <p>
                            Don't have an account?{' '}
                            <span className="auth-link" onClick={() => { setIsLogin(false); setMessage(null); }}>
                                Sign Up
                            </span>
                        </p>
                    ) : (
                        <p>
                            Already have an account?{' '}
                            <span className="auth-link" onClick={() => { setIsLogin(true); setMessage(null); }}>
                                Log In
                            </span>
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

// === Main App Component (Handles Auth State) ===


// --- Helper: Compare Settings ---
const areSettingsEqual = (config1, config2) => {
    const normalize = (val) => JSON.stringify(val);

    // Compare prompts
    if (config1.prompt !== config2.prompt) return false;

    // Compare blocked categories (deep equal)
    if (normalize(config1.blocked_categories) !== normalize(config2.blocked_categories)) return false;

    // Compare lists (sorted)
    const sortList = (list) => (Array.isArray(list) ? [...list].sort() : []);
    if (normalize(sortList(config1.allow_list)) !== normalize(sortList(config2.allow_list))) return false;
    if (normalize(sortList(config1.block_list)) !== normalize(sortList(config2.block_list))) return false;

    return true;
};

// --- BRAND COLOR MAP ---
// Top distractors get a signature premium tint.
// USING RGBA for Dark Mode Compatibility (Auto-tints against white or black bg)
const BRAND_COLORS = {
    'youtube.com': { bg: 'rgba(255, 0, 0, 0.08)', border: 'rgba(255, 0, 0, 0.2)', icon: '#FF0000' }, // True Red
    'twitch.tv': { bg: 'rgba(147, 51, 234, 0.08)', border: 'rgba(147, 51, 234, 0.2)', icon: '#9333EA' }, // Purple
    'reddit.com': { bg: 'rgba(234, 88, 12, 0.08)', border: 'rgba(234, 88, 12, 0.2)', icon: '#EA580C' }, // Orange
    'twitter.com': { bg: 'rgba(14, 165, 233, 0.08)', border: 'rgba(14, 165, 233, 0.2)', icon: '#0EA5E9' }, // Sky
    'x.com': { bg: 'rgba(14, 165, 233, 0.08)', border: 'rgba(14, 165, 233, 0.2)', icon: '#0EA5E9' }, // Sky
    'facebook.com': { bg: 'rgba(37, 99, 235, 0.08)', border: 'rgba(37, 99, 235, 0.2)', icon: '#2563EB' }, // Blue
    'instagram.com': { bg: 'rgba(219, 39, 119, 0.08)', border: 'rgba(219, 39, 119, 0.2)', icon: '#DB2777' }, // Pink
    'netflix.com': { bg: 'rgba(229, 9, 20, 0.08)', border: 'rgba(229, 9, 20, 0.2)', icon: '#E50914' }, // Red
    'tiktok.com': { bg: 'rgba(5, 150, 105, 0.08)', border: 'rgba(5, 150, 105, 0.2)', icon: '#059669' }, // Green
    'linkedin.com': { bg: 'rgba(10, 102, 194, 0.08)', border: 'rgba(10, 102, 194, 0.2)', icon: '#0A66C2' }, // Blue
};
const SYSTEM_RESET_STYLE = { bg: 'rgba(37, 99, 235, 0.1)', border: 'rgba(37, 99, 235, 0.25)' }; // Blue

// --- Strict Mode Timer Component ---
function StrictModeTimer({ endTime, isIndefinite, onExpire, onClick }) {
    const [timeRemaining, setTimeRemaining] = useState({ hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        if (isIndefinite) return; // No countdown for indefinite mode

        const updateTime = () => {
            const now = Date.now();
            const remaining = endTime - now;

            if (remaining <= 0) {
                onExpire();
                return;
            }

            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

            setTimeRemaining({ hours, minutes, seconds });
        };

        updateTime(); // Initial update
        const interval = setInterval(updateTime, 1000);

        return () => clearInterval(interval);
    }, [endTime, isIndefinite, onExpire]);


    return (
        <div
            onClick={onClick}
            className="strict-mode-timer-v2 dashboard-variant"
            title="Click to manage Strict Mode"
            style={{ cursor: 'pointer', transition: 'transform 0.2s', minWidth: '140px' }}
        >
            {isIndefinite ? (
                <span className="timer-value" style={{ fontSize: '1rem', letterSpacing: '1px' }}>
                    STRICT MODE
                </span>
            ) : (
                <span className="timer-value">
                    {String(timeRemaining.hours).padStart(2, '0')}:
                    {String(timeRemaining.minutes).padStart(2, '0')}:
                    {String(timeRemaining.seconds).padStart(2, '0')}
                </span>
            )}
        </div>
    );
}

export default function App() {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [recoveryMode, setRecoveryMode] = useState(false);
    const [isBugReportModalOpen, setIsBugReportModalOpen] = useState(false);
    const [isFeatureModalOpen, setIsFeatureModalOpen] = useState(false);

    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [initialSearchTerm, setInitialSearchTerm] = useState('');

    const [dashboardKey, setDashboardKey] = useState(0); // Key to force Dashboard refresh
    const [showSubscriptionModal, setShowSubscriptionModal] = useState(false); // Triggered by SubscriptionGuard

    // --- Onboarding Restart State ---
    const [tourRestartKey, setTourRestartKey] = useState(0);

    // --- Referral Prompt State (for new OAuth users) ---
    const [showReferralPrompt, setShowReferralPrompt] = useState(false);
    const [referralPromptCode, setReferralPromptCode] = useState('');
    const [referralPromptLoading, setReferralPromptLoading] = useState(false);
    const [referralPromptMessage, setReferralPromptMessage] = useState('');

    // --- Payment Success Modal State ---
    const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);

    const handleRestartTour = () => {
        localStorage.removeItem('hasSeenOnboarding');
        setTourRestartKey(prev => prev + 1);
    };

    // Handler to open history modal with a pre-filled search term
    const handleOpenHistoryWithSearch = (searchTerm) => {
        setInitialSearchTerm(searchTerm);
        setIsHistoryModalOpen(true);
    };

    // --- Extension Status State ---
    const [extensionStatus, setExtensionStatus] = useState('loading'); // 'loading', 'active', 'not_installed', 'logged_out'
    const prevExtensionStatus = useRef('loading');

    // --- Track Extension Disable/Enable for Analytics ---
    const trackExtensionStatusChange = useCallback(async (newStatus, oldStatus) => {
        // Only track transitions between active and not_installed/logged_out
        // Skip initial 'loading' state transitions
        if (oldStatus === 'loading') return;
        if (!session?.access_token) return;

        let eventType = null;
        if (oldStatus === 'active' && (newStatus === 'not_installed' || newStatus === 'logged_out')) {
            eventType = 'extension_disabled';
        } else if ((oldStatus === 'not_installed' || oldStatus === 'logged_out') && newStatus === 'active') {
            eventType = 'extension_enabled';
        }

        if (eventType) {
            try {
                await fetch(`${config.BACKEND_URL}/api/engagement-event`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                        event_type: eventType,
                        metadata: { from_status: oldStatus, to_status: newStatus }
                    })
                });
                console.log(`[ANALYTICS] Extension status change tracked: ${eventType}`);
            } catch (err) {
                console.warn('[ANALYTICS] Failed to track extension status change:', err);
            }
        }
    }, [session?.access_token]);

    // --- Check for Extension ---
    useEffect(() => {
        const checkExtension = () => {
            const marker = document.getElementById('beacon-extension-status');
            let newStatus;
            if (marker) {
                const isLoggedIn = marker.getAttribute('data-logged-in') === 'true';
                newStatus = isLoggedIn ? 'active' : 'logged_out';
            } else {
                newStatus = 'not_installed';
            }

            // Track status changes for analytics
            if (newStatus !== prevExtensionStatus.current) {
                trackExtensionStatusChange(newStatus, prevExtensionStatus.current);
                prevExtensionStatus.current = newStatus;
            }

            setExtensionStatus(newStatus);
        };

        // Check immediately
        checkExtension();

        // Listen for updates from content script
        window.addEventListener('beacon-extension-update', checkExtension);

        // Polling fallback (in case content script loads slightly later)
        const timer = setInterval(checkExtension, 1000);

        return () => {
            window.removeEventListener('beacon-extension-update', checkExtension);
            clearInterval(timer);
        };
    }, [trackExtensionStatusChange]);

    // --- Theme State ---
    const [theme, setTheme] = useState(() => localStorage.getItem('beacon_theme') || 'system');

    useEffect(() => {
        const root = document.documentElement;
        const applyTheme = (t) => {
            if (t === 'dark') {
                root.setAttribute('data-theme', 'dark');
            } else if (t === 'light') {
                root.removeAttribute('data-theme');
            } else {
                // System
                const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (systemDark) root.setAttribute('data-theme', 'dark');
                else root.removeAttribute('data-theme');
            }
        };

        applyTheme(theme);
        localStorage.setItem('beacon_theme', theme);

        // Sync theme to extension - send the RESOLVED theme, not 'system'
        // This ensures the extension popup matches the dashboard's current visual state
        let resolvedTheme = theme;
        if (theme === 'system') {
            resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        document.dispatchEvent(new CustomEvent('BEACON_THEME_SYNC', {
            detail: { theme: resolvedTheme }
        }));

        // Listen for system changes if in system mode
        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = () => applyTheme('system');
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }
    }, [theme]);

    useEffect(() => {
        // Check for params
        const params = new URLSearchParams(window.location.search);

        // Handle Bug Report
        if (params.get('reportBug') === 'true') {
            setIsBugReportModalOpen(true);
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        // Handle Feature Request
        if (params.get('shareFeature') === 'true') {
            setIsFeatureModalOpen(true);
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        // Handle Logout
        if (params.get('logout') === 'true') {
            supabase.auth.signOut().then(() => {
                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);
            });
        }

        // Handle Payment Success (from Stripe checkout redirect)
        if (params.get('payment') === 'success') {
            setShowPaymentSuccess(true);
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    // --- Helper: Sync Auth to Extension ---
    const syncAuthToExtension = (session) => {
        if (session?.access_token && session?.user?.email) {
            // Prevent duplicate syncs (fixes log spam)
            if (lastSyncedAuthToken === session.access_token) {
                return;
            }
            lastSyncedAuthToken = session.access_token;

            document.dispatchEvent(new CustomEvent('BEACON_AUTH_SYNC', {
                detail: {
                    token: session.access_token,
                    email: session.user.email
                }
            }));
        }
    };

    useEffect(() => {
        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session) {
                syncAuthToExtension(session); // Sync on load
            }
            setLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                setRecoveryMode(true);
            }

            setSession(session);
            if (session) {
                syncAuthToExtension(session); // Sync on change

                // Detect new OAuth users (created within last 2 minutes)
                if (event === 'SIGNED_IN' && session.user) {
                    const createdAt = new Date(session.user.created_at);
                    const isNewUser = (Date.now() - createdAt.getTime()) < 2 * 60 * 1000;

                    if (isNewUser) {
                        console.log('[AUTH] New user detected, triggering onboarding');
                        // Trigger onboarding tour
                        localStorage.removeItem('hasSeenOnboarding');

                        // Ensure trial is created for new OAuth users
                        try {
                            await fetch(`${config.BACKEND_URL}/api/ensure-trial`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${session.access_token}`
                                }
                            });
                            console.log('[AUTH] Trial ensured for new OAuth user');
                        } catch (e) {
                            console.error('[AUTH] Failed to ensure trial:', e);
                        }

                        // Check for pending referral code from OAuth redirect
                        const pendingCode = localStorage.getItem('pendingReferralCode');
                        if (pendingCode) {
                            console.log('[AUTH] Applying pending referral code:', pendingCode);
                            try {
                                const res = await fetch(`${config.BACKEND_URL}/api/referral/apply`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${session.access_token}`
                                    },
                                    body: JSON.stringify({ code: pendingCode })
                                });
                                if (res.ok) {
                                    console.log('[AUTH] Referral code applied successfully');
                                }
                            } catch (e) {
                                console.error('[AUTH] Failed to apply referral code:', e);
                            }
                            localStorage.removeItem('pendingReferralCode');
                        } else {
                            // No pending code - show referral prompt for new OAuth users
                            // Only show if onboarding is already complete, otherwise wait for it
                            const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
                            if (hasSeenOnboarding) {
                                setTimeout(() => setShowReferralPrompt(true), 1000);
                            }
                            // If onboarding not complete, the referral prompt will show after onboarding finishes
                        }
                    }
                }
            } else {
                // Dispatch Logout Event to Extension
                document.dispatchEvent(new CustomEvent('BEACON_AUTH_LOGOUT'));
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // --- Retry Sync when Extension is Detected ---
    useEffect(() => {
        if (session && (extensionStatus === 'active' || extensionStatus === 'logged_out')) {
            syncAuthToExtension(session);
        }
    }, [extensionStatus, session]);

    // --- Handlers ---
    const handleOpenHistory = useCallback(() => {
        setIsHistoryModalOpen(true);
    }, []);

    const handleHistoryCleared = useCallback(() => {
        setDashboardKey(prev => prev + 1);
    }, []);

    if (loading) {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)'
            }}>
                <img
                    src="/logo.png"
                    alt="Beacon Blocker"
                    style={{
                        width: '100px',
                        height: '100px',
                        borderRadius: '50%',
                        marginBottom: '1rem',
                        animation: 'pulse 2s ease-in-out infinite'
                    }}
                />
                <p style={{ color: '#64748b', fontSize: '1rem' }}>Loading...</p>
                <style>{`
                    @keyframes pulse {
                        0%, 100% { transform: scale(1); opacity: 1; }
                        50% { transform: scale(1.05); opacity: 0.8; }
                    }
                `}</style>
            </div>
        );
    }

    if (recoveryMode) {
        return <PasswordResetForm onSuccess={() => setRecoveryMode(false)} />;
    }

    return (
        <>
            {!session ? (
                <AuthForm supabase={supabase} />
            ) : (
                <div>
                    <SubscriptionGuard
                        session={session}
                        openSettingsToSubscription={() => setShowSubscriptionModal(true)}
                        onSignOut={async () => {
                            await supabase.auth.signOut();
                            window.location.reload();
                        }}
                    >
                    <Dashboard
                        key={`${session.user.id}-${dashboardKey}`}
                        session={session}
                        onReportBug={() => setIsBugReportModalOpen(true)}
                        onOpenHistory={() => setIsHistoryModalOpen(true)}
                        onOpenHistoryWithSearch={handleOpenHistoryWithSearch}
                        theme={theme}
                        onThemeChange={setTheme}
                        extensionStatus={extensionStatus}
                        onRestartTour={handleRestartTour}
                        showSubscriptionModal={showSubscriptionModal}
                        onSubscriptionModalShown={() => setShowSubscriptionModal(false)}
                    />
                    </SubscriptionGuard>
                    <OnboardingTour
                        key={tourRestartKey}
                        onOpenHistory={() => setIsHistoryModalOpen(true)}
                        onCloseHistory={() => setIsHistoryModalOpen(false)}
                        isHistoryModalOpen={isHistoryModalOpen}
                        onClose={async () => {
                            // After onboarding completes, check if user needs referral prompt
                            // Only for new users who haven't entered a referral code yet
                            const pendingCode = localStorage.getItem('pendingReferralCode');
                            if (!pendingCode) {
                                // Also check if user was already referred (e.g., during signup)
                                try {
                                    const stats = await getReferralStats(session);
                                    if (!stats.was_referred) {
                                        setTimeout(() => setShowReferralPrompt(true), 500);
                                    }
                                } catch (e) {
                                    // If check fails, show modal anyway
                                    setTimeout(() => setShowReferralPrompt(true), 500);
                                }
                            }
                        }}
                    />
                </div>
            )}
            <FullHistoryModal
                isOpen={isHistoryModalOpen}
                onClose={() => { setIsHistoryModalOpen(false); setInitialSearchTerm(''); }}
                userId={session?.user?.id}
                getFaviconUrl={getFaviconUrl}
                initialSearchTerm={initialSearchTerm}
                onReportBug={() => setIsBugReportModalOpen(true)}
                onShareFeature={() => setIsFeatureModalOpen(true)}
                onHistoryCleared={handleHistoryCleared}
            />
            <BugReportModal
                isOpen={isBugReportModalOpen}
                onClose={() => setIsBugReportModalOpen(false)}
                userId={session?.user?.id}
                userEmail={session?.user?.email}
            />
            <FeatureRequestModal
                isOpen={isFeatureModalOpen}
                onClose={() => setIsFeatureModalOpen(false)}
                userId={session?.user?.id}
                userEmail={session?.user?.email}
            />

            {/* Referral Code Prompt Modal - shown to new OAuth users */}
            {showReferralPrompt && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 10000
                }}>
                    <div style={{
                        background: 'var(--card-bg, white)',
                        padding: '2rem',
                        borderRadius: '16px',
                        maxWidth: '400px',
                        width: '90%',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
                    }}>
                        <h2 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>One more thing!</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                            Got a referral code? Enter it and you'll both get 2 weeks free!
                        </p>

                        <input
                            type="text"
                            placeholder="e.g. BEACON-A1B2C3"
                            value={referralPromptCode}
                            onChange={(e) => {
                                let value = e.target.value.toUpperCase();
                                // If user pastes full URL, extract just the code
                                if (value.includes('REF=')) {
                                    const match = value.match(/REF=(BEACON-[A-Z0-9]+)/i);
                                    if (match) value = match[1].toUpperCase();
                                }
                                setReferralPromptCode(value);
                            }}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                fontSize: '1rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                marginBottom: '0.5rem',
                                textTransform: 'uppercase',
                                background: 'var(--input-bg)',
                                color: 'var(--text-primary)'
                            }}
                        />

                        {referralPromptMessage && (
                            <p style={{
                                color: referralPromptMessage.includes('success') ? '#16a34a' : '#dc2626',
                                fontSize: '0.9rem',
                                marginBottom: '0.5rem'
                            }}>
                                {referralPromptMessage}
                            </p>
                        )}

                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                            <button
                                onClick={async () => {
                                    if (!referralPromptCode.trim()) {
                                        setShowReferralPrompt(false);
                                        return;
                                    }
                                    setReferralPromptLoading(true);
                                    try {
                                        const res = await fetch(`${config.BACKEND_URL}/api/referral/apply`, {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Authorization': `Bearer ${session?.access_token}`
                                            },
                                            body: JSON.stringify({ code: referralPromptCode.trim() })
                                        });
                                        const data = await res.json();
                                        if (res.ok) {
                                            setReferralPromptMessage('Referral code applied successfully!');
                                            setTimeout(() => setShowReferralPrompt(false), 1500);
                                        } else {
                                            setReferralPromptMessage(data.error || 'Invalid code');
                                        }
                                    } catch (e) {
                                        setReferralPromptMessage('Failed to apply code');
                                    }
                                    setReferralPromptLoading(false);
                                }}
                                disabled={referralPromptLoading}
                                className="primary-button"
                                style={{
                                    flex: 1,
                                    opacity: referralPromptLoading ? 0.6 : 1
                                }}
                            >
                                {referralPromptLoading ? 'Applying...' : 'Apply Code'}
                            </button>
                            <button
                                onClick={() => setShowReferralPrompt(false)}
                                className="neutral-button"
                            >
                                Skip
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Payment Success Modal - shown after Stripe checkout */}
            {showPaymentSuccess && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 10001,
                    animation: 'fadeIn 0.3s ease'
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, var(--card-bg, white) 0%, var(--card-bg, #f8fafc) 100%)',
                        padding: '2.5rem',
                        borderRadius: '20px',
                        maxWidth: '440px',
                        width: '90%',
                        boxShadow: '0 25px 80px rgba(0,0,0,0.35)',
                        textAlign: 'center',
                        animation: 'slideUp 0.4s ease'
                    }}>
                        {/* Success Icon */}
                        <div style={{
                            width: '80px',
                            height: '80px',
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1.5rem',
                            boxShadow: '0 8px 25px rgba(34, 197, 94, 0.4)'
                        }}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        </div>

                        <h2 style={{
                            margin: '0 0 0.75rem 0',
                            color: 'var(--text-primary)',
                            fontSize: '1.6rem',
                            fontWeight: '700'
                        }}>
                            Welcome Aboard!
                        </h2>

                        <p style={{
                            color: 'var(--text-secondary)',
                            fontSize: '1rem',
                            lineHeight: '1.6',
                            marginBottom: '1.5rem'
                        }}>
                            Your subscription is now active.
                        </p>

                        {/* Subscription Info Box */}
                        <div style={{
                            background: 'rgba(37, 99, 235, 0.08)',
                            borderRadius: '12px',
                            padding: '1.25rem',
                            marginBottom: '1.5rem',
                            textAlign: 'left'
                        }}>
                            <p style={{
                                margin: '0 0 0.75rem 0',
                                fontWeight: '600',
                                color: 'var(--text-primary)',
                                fontSize: '0.95rem'
                            }}>
                                Your first payment will be March 1st, 2026
                            </p>
                            <p style={{
                                margin: '0 0 0.5rem 0',
                                color: 'var(--text-secondary)',
                                fontSize: '0.9rem',
                                lineHeight: '1.5'
                            }}>
                                You can cancel anytime. If you cancel, you'll retain access until your paid period ends.
                            </p>
                            <p style={{
                                margin: 0,
                                fontSize: '0.85rem',
                                color: 'var(--text-muted)'
                            }}>
                                A receipt has been sent to your email.
                            </p>
                        </div>

                        <button
                            onClick={() => setShowPaymentSuccess(false)}
                            className="primary-button"
                            style={{
                                padding: '0.9rem 2rem',
                                fontSize: '1rem',
                                boxShadow: '0 4px 15px rgba(37, 99, 235, 0.35)'
                            }}
                        >
                            Get Started
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}