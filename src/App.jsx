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
import { encryptPrompt, decryptPrompt } from './cryptoUtils.js'; // Prompt encryption for privacy

import ProfileDropdown from './ProfileDropdown';
// SavePresetModal removed as part of workflow refactor
import PresetsModal from './PresetsModal';
// CSS is imported in main.jsx

// --- Helper function to generate API key ---
function generateApiKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

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
        console.warn("Could not parse domain:", urlString);
        return null;
    }
}

// --- Helper to get Favicon ---
const getFaviconUrl = (domain) => {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
};

// --- Extension Communication (for local block logs) ---
// Uses CustomEvent bridge via content script

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
            // console.log('Dashboard: Received block log response', event.detail?.logs?.length || 0, 'entries');
            resolve(event.detail?.logs || []);
        };

        // Listen for response
        window.addEventListener('BEACON_BLOCK_LOG_RESPONSE', handleResponse);

        // Request block logs via CustomEvent (content script bridges to background)
        // console.log('Dashboard: Requesting block logs from extension');
        document.dispatchEvent(new CustomEvent('BEACON_GET_BLOCK_LOG'));

        // Timeout after 2 seconds if no response
        timeoutId = setTimeout(() => {
            if (resolved) return; // Already resolved
            resolved = true;
            window.removeEventListener('BEACON_BLOCK_LOG_RESPONSE', handleResponse);
            // console.log('Dashboard: Block log request timed out');
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
    { id: 'sports', label: 'Sports', desc: 'ESPN, NBA, NFL, Live Sports' },
    { id: 'finance', label: 'Finance', desc: 'Coinbase, Stocks, Trading' },
    { id: 'travel', label: 'Travel & Real Estate', desc: 'Airbnb, Zillow, Booking, Redfin' },
    { id: 'forums', label: 'Forums', desc: 'Reddit, Quora, StackOverflow' },
    { id: 'shopping', label: 'Shopping', desc: 'Amazon, eBay, Shopify' },
    { id: 'mature', label: 'Mature Content', desc: 'Adult sites, Gambling' }
];

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

// === Dashboard Component ===
function Dashboard({ session, onReportBug, onOpenHistory, onOpenHistoryWithSearch, theme, onThemeChange, extensionStatus }) {
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
        "I need to study for biology. Block everything except Wikipedia and Khan Academy.",
        "I'm debugging a React app. Block social media but allow Stack Overflow and GitHub.",
        "I want to write a blog post. Block all websites except Google Docs and Thesaurus.com.",
        "I need to read a book. Block the entire internet for 45 minutes.",
        "I'm planning a trip. Allow Airbnb and flights, but block work email and Slack.",
        "Focus mode: Block Reddit, Twitter, and Facebook. Allow everything else.",
        "I am learning to cook. Allow YouTube and recipe sites, but block news and politics.",
        "Late night work. Block Netflix, Hulu, and Twitch. Allow my company portal.",
        "I need to finish my thesis. Block everything except .edu sites and Google Scholar."
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

            let { data, error } = await supabase.from('rules').select('prompt, blocked_categories, allow_list, block_list, active_preset_id').eq('user_id', user.id).single();

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
                    fetch('http://localhost:3000/update-rules-signal', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`
                        }
                    }).catch(err => console.log('Cache invalidation signal skipped:', err.message));
                }
            } catch (e) {
                console.log('Cache invalidation signal skipped:', e.message);
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
            console.log('Preset saved:', data);
            await fetchPresets(); // Refresh list
            setIsSavingPreset(false);
            setNewPresetName('');
            setSaveWarning(null);
            setOverwriteCandidate(null);
            setMessage(`Preset "${name}" saved!`);

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
        console.log('Checking for duplicate name:', name, 'Found:', duplicateName?.name);
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

        console.log('Checking for duplicate content. Current prompt:', mainPrompt?.substring(0, 50));
        console.log('Presets count:', presets.length);

        const duplicateContent = presets.find(p => {
            const isMatch = areSettingsEqual({
                prompt: p.prompt,
                blocked_categories: p.blocked_categories,
                allow_list: p.allow_list,
                block_list: p.block_list
            }, currentSettings);
            console.log('Comparing with preset:', p.name, '- Match:', isMatch);
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
            setMessage(`Error saving preset: ${error.message}`);
        } else {
            setMessage('Preset saved!');
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
        console.log('Updating active preset:', activePreset);
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
            console.log('Preset updated successfully');
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

        console.log('Setting active preset:', { id: preset.id, name: preset.name });
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

        setMessage(`Preset "${preset.name}" loaded!`);
    };

    const handleUnloadPreset = async () => {
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

        setMessage('Dashboard cleared and cache reset.');
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
        // If deleting the currently active preset, unload and RESET dashboard
        if (activePreset && activePreset.id === id) {
            console.log("Deleting active preset - performing full dashboard reset");
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
                decision: 'BLOCK', // All logs from extension are blocks
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

        // Poll for new logs every 5 seconds (instead of real-time subscription)
        const pollInterval = setInterval(fetchLogs, 5000);

        return () => {
            clearInterval(pollInterval);
        };

    }, [session]);

    const [inputError, setInputError] = useState({ type: null, msg: null }); // New error state
    const [clearConfirmation, setClearConfirmation] = useState(null); // 'allow' or 'block'
    const [showLogs, setShowLogs] = useState(() => localStorage.getItem('beacon_showLogs') === 'true'); // Collapsible logs state

    useEffect(() => { localStorage.setItem('beacon_showLogs', showLogs); }, [showLogs]);

    const [expandedLogId, setExpandedLogId] = useState(null); // Click to expand log details
    const [signOutConfirmation, setSignOutConfirmation] = useState(false); // Sign out confirmation

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
        console.log("DEBUG: Starting Account Deletion...");
        setIsDeletingAccount(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            console.log("DEBUG: Session Token present:", !!token);

            if (!token) throw new Error("No active session");

            console.log("DEBUG: Sending request to http://localhost:3000/delete-account");
            const response = await fetch('http://localhost:3000/delete-account', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log("DEBUG: Response Status:", response.status);

            if (!response.ok) {
                const errorData = await response.json();
                console.error("DEBUG: Server Error Data:", errorData);
                throw new Error(errorData.error || 'Failed to delete account');
            }

            // Success
            console.log("DEBUG: Deletion successful. Signing out...");
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
        console.log(`DEBUG: Checkbox Changed: ${name} = ${checked}`);

        const newCategories = { ...blockedCategories, [name]: checked };
        console.log("DEBUG: New Categories State:", newCategories);

        setBlockedCategories(newCategories);
        setSaveStatus('saving'); // Immediate "Listening" feedback
    };

    // --- Add Domain Handler (Auto-save) ---
    const handleAddDomain = (listType) => {
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
                if (!allowListArray.includes(domain)) {
                    const newList = [...allowListArray, domain].sort();
                    setAllowListArray(newList);
                    setCurrentAllowInput('');
                    setSaveStatus('saving'); // Immediate "Listening" feedback
                } else {
                    setCurrentAllowInput('');
                }
            } else {
                if (!blockListArray.includes(domain)) {
                    const newList = [...blockListArray, domain].sort();
                    setBlockListArray(newList);
                    setCurrentBlockInput('');
                    setSaveStatus('saving'); // Immediate "Listening" feedback
                } else {
                    setCurrentBlockInput('');
                }
            }
        } else {
            setInputError({ type: listType, msg: `Invalid domain. Try 'example.com'.` });
        }
    };

    // --- Remove Domain Handler (Auto-save) ---
    const handleRemoveDomain = (listType, domainToRemove) => {
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

    // --- Regenerate API key function ---
    async function regenerateApiKey() {
        if (!confirm('Are you sure?')) return; setLoading(true); setMessage(null);
        const { data: { user } = {} } = await supabase.auth.getUser(); // Added default empty object for data
        if (!user) {
            setMessage('Error: User not found. Please log in again.');
            setLoading(false);
            return;
        }
        const newKey = generateApiKey(); // Define newKey here
        const updates = { user_id: user.id, api_key: newKey };
        let { error } = await supabase.from('rules').upsert(updates, { onConflict: 'user_id' });
        if (error) { setMessage(`Error: ${error.message}`); } else { setApiKey(newKey); setMessage('New Key generated!'); }
        setLoading(false);
    }

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', marginTop: '1rem' }}>
                <div id="tour-welcome-header" style={{ display: 'flex', alignItems: 'center', gap: '20px', position: 'relative' }}>
                    {/* Logo Wrapper with Beacon Light and Save Glow */}
                    <div
                        id="tour-auto-sync"
                        className={`logo-wrapper ${saveStatus === 'saving' ? 'saving' : saveStatus === 'saved' ? 'saved' : ''}`}
                        style={{
                            position: 'relative',
                            width: '100px',
                            height: '100px',
                            borderRadius: '50%',
                            transition: 'box-shadow 0.3s ease'
                        }}
                    >
                        <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />

                        {/* Status Tooltip on Logo Hover */}
                        <div className="beacon-tooltip">
                            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                                {saveStatus === 'saving' ? 'Saving Changes...' :
                                    saveStatus === 'saved' ? 'Changes Saved' :
                                        extensionStatus === 'active' ? 'Extension Active' :
                                            extensionStatus === 'logged_out' ? 'Extension Disconnected' :
                                                'Extension Not Detected'}
                            </div>
                            <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                                {saveStatus === 'saving' ? 'Syncing your rules...' :
                                    saveStatus === 'saved' ? 'Your beacon is up to date.' :
                                        extensionStatus === 'active' ? 'Your beacon is on and guiding the way.' :
                                            extensionStatus === 'logged_out' ? 'Please log in to the extension to sync rules.' :
                                                'Please install or reload the extension.'}
                            </div>
                        </div>

                        <style>{`
                            .logo-wrapper {
                                position: relative; /* Needed for tooltip positioning */
                            }
                            .logo-wrapper:hover .beacon-tooltip {
                                opacity: 1;
                                visibility: visible;
                                transform: translateX(-50%) translateY(0);
                            }
                            .beacon-tooltip {
                                position: absolute;
                                top: 100%; /* Position below the beacon light */
                                left: 50%;
                                transform: translateX(-50%) translateY(10px); /* Initial offset for animation */
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
                    <button
                        onClick={() => {
                            localStorage.removeItem('hasSeenOnboarding');
                            window.location.reload();
                        }}
                        className="help-button"
                        title="Restart Onboarding Tour"
                    >
                        <span>❓</span> Help
                    </button>
                    <ProfileDropdown
                        userEmail={session.user.email}
                        onSignOut={handleSignOut}
                        onDeleteAccount={() => setIsDeleteModalOpen(true)}
                        theme={theme}
                        onThemeChange={onThemeChange}
                    />
                </div>
                {/* Save Status Indicator - REMOVED (Replaced by new buttons) */}
            </div>

            <DeleteAccountModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onDelete={handleDeleteAccount}
                loading={isDeletingAccount}
            />

            <UnloadPresetModal
                isOpen={isUnloadModalOpen}
                onClose={() => setIsUnloadModalOpen(false)}
                onUnload={handleUnloadPreset}
            />

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
                                        <span className="validation-text">Unsaved changes. Load "{pendingLoadPreset.name}" anyway?</span>
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
                        className="main-prompt-textarea"
                        placeholder={placeholderText}
                        value={mainPrompt}
                        onChange={handleTextAreaChange}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginTop: '0.5rem' }}>
                        <button type="button" className="examples-toggle" style={{ marginTop: 0 }} onClick={() => setShowExamples(!showExamples)}>
                            {showExamples ? 'Hide Examples' : 'Need inspiration? See Examples'}
                        </button>

                        <div style={{ width: '1px', height: '20px', background: 'var(--border-color)' }}></div>

                        <div id="tour-presets-section" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>

                            {/* --- ACTIVE PRESET SECTION --- */}
                            {activePreset ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {isRenamingPreset ? (
                                        // --- RENAME MODE ---
                                        <div className="inline-save-container">
                                            <input
                                                type="text"
                                                className="inline-save-input"
                                                value={renamePresetInput}
                                                onChange={(e) => setRenamePresetInput(e.target.value)}
                                                onFocus={(e) => e.target.select()}
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleConfirmRename();
                                                    if (e.key === 'Escape') handleCancelRename();
                                                }}
                                            />
                                            <button className="inline-action-btn confirm" onClick={handleConfirmRename} title="Save Name">✓</button>
                                            <button className="inline-action-btn cancel" onClick={handleCancelRename} title="Cancel">✕</button>
                                        </div>
                                    ) : (
                                        // --- ACTIVE PRESET DISPLAY ---
                                        <>
                                            <button
                                                id="tour-update-preset-btn"
                                                className={`preset-button ${isPresetModified ? 'primary' : 'neutral'}`}
                                                onClick={isPresetModified ? handleUpdateActivePreset : handleStartRename}
                                                title={isPresetModified ? "Save changes to this preset" : "Click to rename preset"}
                                                style={{ minWidth: '100px' }}
                                            >
                                                {isPresetModified ? `Save to "${activePreset.name}"` : activePreset.name}
                                            </button>

                                            {/* UNLOAD BUTTON - Matches Cancel Style */}
                                            <button
                                                className="inline-action-btn cancel"
                                                onClick={() => setIsUnloadModalOpen(true)}
                                                title="Unload Preset"
                                                style={{ fontSize: '1rem', width: '28px', height: '28px' }}
                                            >
                                                ✕
                                            </button>
                                        </>
                                    )}
                                </div>
                            ) : (
                                // Show disabled "Save To" button when no preset is loaded
                                <button
                                    id="tour-update-preset-btn"
                                    className="preset-button neutral"
                                    disabled
                                    title="Load a preset to enable this button"
                                    style={{ minWidth: '100px', opacity: 0.5, cursor: 'not-allowed' }}
                                >
                                    Save To (None)
                                </button>
                            )}

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
                                    Save As
                                </button>
                            )}

                            {/* --- LOAD BUTTON --- */}
                            <button
                                id="tour-load-preset-btn"
                                className="preset-button"
                                onClick={() => setIsPresetsModalOpen(true)}
                            >
                                Load
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
                            <div className="example-item">
                                <span className="example-label">Smart Video Filter:</span>
                                "I am learning to cook. Allow YouTube videos about <strong>cooking recipes</strong>, but block all other entertainment and gaming videos."
                            </div>
                            <div className="example-item">
                                <span className="example-label">Productive Social:</span>
                                "I need to sell items. Allow <strong>Facebook Marketplace</strong> for listing items, but block the <strong>News Feed</strong> to avoid distractions."
                            </div>
                            <div className="example-item">
                                <span className="example-label">Strict Deadline:</span>
                                "I have a paper due in 1 hour. Block <strong>the entire internet</strong> except for Google Docs and Wikipedia."
                            </div>
                            <div className="example-item">
                                <span className="example-label">Coding Mode:</span>
                                "I'm building a website. Block social media, but allow <strong>Stack Overflow, GitHub, and YouTube tutorials about React</strong>."
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
                                Advanced controls to fine-tune your Beacon.
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
                                        <div key={category.id} className={`category-card ${blockedCategories[category.id] ? 'active' : ''}`}
                                            onClick={() => handleCategoryChange({ target: { name: category.id, checked: !blockedCategories[category.id] } })}>
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
                                <div className="list-section whitelist-section">
                                    <div className="list-header">
                                        <div>
                                            <h4>Always Allow</h4>
                                            <p>Websites in this list will <strong>bypass</strong> all blocking rules.</p>
                                        </div>
                                        {allowListArray.length > 0 && (
                                            <button type="button"
                                                className={`clear-list-button ${clearConfirmation === 'allow' ? 'confirming' : ''}`}
                                                onClick={() => handleClearList('allow')}>
                                                {clearConfirmation === 'allow' ? 'Are you sure?' : 'Clear All'}
                                            </button>
                                        )}
                                    </div>
                                    <div className="tag-input-wrapper">
                                        <input type="text" id="allowInput" className="tag-input-field"
                                            placeholder="example.com"
                                            autoComplete="off"
                                            value={currentAllowInput}
                                            onChange={(e) => { setCurrentAllowInput(e.target.value); setInputError({ type: null, msg: null }); }}
                                            onKeyDown={(e) => handleInputKeyDown(e, 'allow')} />
                                        <button type="button" className="tag-input-button" onClick={() => handleAddDomain('allow')}>Add</button>
                                    </div>
                                    {inputError.type === 'allow' && <div className="input-error-msg">{inputError.msg}</div>}
                                    <div className="tag-list">
                                        {allowListArray.map((domain) => (
                                            <span key={domain} className="tag-item allow-tag">
                                                {domain}
                                                <button type="button" className="tag-remove-button"
                                                    onClick={() => handleRemoveDomain('allow', domain)} aria-label={`Remove ${domain}`}>&times;</button>
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* --- Always Block (Black List) --- */}
                                <div className="list-section blacklist-section">
                                    <div className="list-header">
                                        <div>
                                            <h4>Always Block</h4>
                                            <p>Websites in this list will be <strong>blocked</strong> regardless of your goal.</p>
                                        </div>
                                        {blockListArray.length > 0 && (
                                            <button type="button"
                                                className={`clear-list-button ${clearConfirmation === 'block' ? 'confirming' : ''}`}
                                                onClick={() => handleClearList('block')}>
                                                {clearConfirmation === 'block' ? 'Are you sure?' : 'Clear All'}
                                            </button>
                                        )}
                                    </div>
                                    <div className="tag-input-wrapper">
                                        <input type="text" id="blockInput" className="tag-input-field"
                                            placeholder="example.com"
                                            autoComplete="off"
                                            value={currentBlockInput}
                                            onChange={(e) => { setCurrentBlockInput(e.target.value); setInputError({ type: null, msg: null }); }}
                                            onKeyDown={(e) => handleInputKeyDown(e, 'block')} />
                                        <button type="button" className="tag-input-button" onClick={() => handleAddDomain('block')}>Add</button>
                                    </div>
                                    {inputError.type === 'block' && <div className="input-error-msg">{inputError.msg}</div>}
                                    <div className="tag-list">
                                        {blockListArray.map((domain) => (
                                            <span key={domain} className="tag-item block-tag">
                                                {domain}
                                                <button type="button" className="tag-remove-button"
                                                    onClick={() => handleRemoveDomain('block', domain)} aria-label={`Remove ${domain}`}>&times;</button>
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
                            Recent Activity
                        </h3>
                        <p style={{ margin: '4px 0 0 24px', color: '#64748b', fontSize: '0.9rem' }}>See what's been blocked recently.</p>
                    </div>

                    {showLogs && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const icon = e.currentTarget.querySelector('svg');
                                icon.style.transition = 'transform 0.5s ease';
                                icon.style.transform = 'rotate(360deg)';
                                fetchLogs().then(() => {
                                    setTimeout(() => {
                                        icon.style.transition = 'none';
                                        icon.style.transform = 'rotate(0deg)';
                                    }, 500);
                                });
                            }}
                            className="refresh-button"
                            title="Reload logs from extension (doesn't clear history)"
                            style={{
                                background: 'transparent',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                padding: '6px 10px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                color: '#64748b',
                                fontSize: '0.85rem',
                                transition: 'all 0.3s ease'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-bg, #f1f5f9)'; e.currentTarget.style.color = 'var(--text-primary, #334155)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary, #64748b)'; }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
                            </svg>
                            Refresh
                        </button>
                    )}
                </div>



                {showLogs && (
                    <div className="log-feed-container">
                        {logs.length === 0 ? (
                            <div className="empty-logs" id="tour-recent-activity-item-0">
                                <span style={{ fontSize: '2rem', marginBottom: '0.5rem', display: 'block' }}>🌊</span>
                                <p>No activity recorded yet.</p>
                                <small>Browse the web to see Beacon in action.</small>
                            </div>
                        ) : (
                            <>
                                <ul className="log-feed-list">
                                    {logs.slice(0, 5).map((log, index) => {
                                        // All logs are now blocks (no ALLOW logs)
                                        const isCache = log.reason && log.reason.toLowerCase().includes('cache');

                                        // Reason text logic
                                        let mainReason = log.reason || 'Blocked';
                                        let expandedReason = log.reason || 'Blocked';

                                        if (isCache) {
                                            mainReason = "Cached decision";
                                            expandedReason = "Previously evaluated";
                                        }
                                        return (
                                            <li
                                                key={log.id}
                                                id={index === 0 ? 'tour-recent-activity-item-0' : undefined}
                                                className="log-item"
                                                onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                                                style={{ cursor: 'pointer', flexDirection: 'column', alignItems: 'stretch' }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                                    <div className="log-icon">
                                                        {isCache ? (
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
                                                    {/* Decision badge removed - all logs are blocks now */}
                                                </div>

                                                {expandedLogId === log.id && (
                                                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                                        <p style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}><strong>URL:</strong> <a href={log.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '400px', display: 'inline-block' }}>{log.url}</a></p>
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
            />
        </div>
    );
}


// === Password Reset Component ===
function PasswordResetForm({ onSuccess }) {
    const [password, setPassword] = useState('');
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
        <div className="container" style={{ padding: '50px 0', maxWidth: '400px', margin: 'auto' }}>
            <div style={{ background: 'white', padding: '2rem', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                <h2 style={{ textAlign: 'center', color: '#2563eb', marginBottom: '1rem' }}>Set New Password</h2>
                <form onSubmit={handlePasswordUpdate}>
                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>New Password</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem', borderRadius: '4px', border: '1px solid #ccc' }}
                        required
                    />
                    <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.75rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        {loading ? 'Updating...' : 'Update Password'}
                    </button>
                    {message && <p style={{ marginTop: '1rem', textAlign: 'center', color: message.startsWith('Error') ? 'red' : 'green' }}>{message}</p>}
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

    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        if (isLogin) {
            // Login Logic
            console.log("DEBUG: Attempting Login", { email, passwordLength: password.length });
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) {
                console.log("DEBUG: Login Error:", error.message);
                // Check if user exists to give better error
                try {
                    const checkRes = await fetch('http://localhost:3000/check-email', {
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
            // Sign Up Logic
            if (password.length < 6) {
                setMessage("Password must be at least 6 characters.");
                setLoading(false);
                return;
            }
            const { error } = await supabase.auth.signUp({
                email,
                password,
            });
            if (error) {
                setMessage(error.message);
            } else {
                // Clear the onboarding flag so the tutorial shows for new users
                localStorage.removeItem('hasSeenOnboarding');
                setMessage("Account created! Please check your email to confirm your account. A tutorial will guide you through the app.");
            }
        }
        setLoading(false);
    };

    const handleGoogleLogin = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
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
                    Sign in with Google
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

export default function App() {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [recoveryMode, setRecoveryMode] = useState(false);
    const [isBugReportModalOpen, setIsBugReportModalOpen] = useState(false);
    const [isFeatureModalOpen, setIsFeatureModalOpen] = useState(false);

    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [initialSearchTerm, setInitialSearchTerm] = useState('');

    const [dashboardKey, setDashboardKey] = useState(0); // Key to force Dashboard refresh

    // Handler to open history modal with a pre-filled search term
    const handleOpenHistoryWithSearch = (searchTerm) => {
        setInitialSearchTerm(searchTerm);
        setIsHistoryModalOpen(true);
    };

    // --- Extension Status State ---
    const [extensionStatus, setExtensionStatus] = useState('loading'); // 'loading', 'active', 'not_installed', 'logged_out'

    // --- Check for Extension ---
    useEffect(() => {
        const checkExtension = () => {
            const marker = document.getElementById('beacon-extension-status');
            if (marker) {
                const isLoggedIn = marker.getAttribute('data-logged-in') === 'true';
                setExtensionStatus(isLoggedIn ? 'active' : 'logged_out');
            } else {
                setExtensionStatus('not_installed');
            }
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
    }, []);

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

        // Sync theme to extension
        console.log("App.jsx: Dispatching BEACON_THEME_SYNC", theme);
        document.dispatchEvent(new CustomEvent('BEACON_THEME_SYNC', {
            detail: { theme }
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
            console.log("Logout param detected. Signing out...");
            supabase.auth.signOut().then(() => {
                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);
            });
        }
    }, []);

    // --- Helper: Sync Auth to Extension ---
    const syncAuthToExtension = (session) => {
        if (session?.access_token && session?.user?.email) {
            console.log("Dispatching BEACON_AUTH_SYNC event...", session.user.email);
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
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) {
                syncAuthToExtension(session); // Sync on change
            } else {
                // Dispatch Logout Event to Extension
                console.log("Dispatching BEACON_AUTH_LOGOUT event...");
                document.dispatchEvent(new CustomEvent('BEACON_AUTH_LOGOUT'));
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // --- Retry Sync when Extension is Detected ---
    useEffect(() => {
        if (session && (extensionStatus === 'active' || extensionStatus === 'logged_out')) {
            console.log("Extension detected (Status: " + extensionStatus + "). Syncing auth...");
            syncAuthToExtension(session);
        }
    }, [extensionStatus, session]);

    // --- Handlers ---
    const handleOpenHistory = useCallback(() => {
        console.log("Opening History Modal");
        setIsHistoryModalOpen(true);
    }, []);

    const handleHistoryCleared = useCallback(() => {
        console.log("History cleared! Refreshing Dashboard...");
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
                <div className="container">
                    <Dashboard
                        key={`${session.user.id}-${dashboardKey}`}
                        session={session}
                        onReportBug={() => setIsBugReportModalOpen(true)}
                        onOpenHistory={() => setIsHistoryModalOpen(true)}
                        onOpenHistoryWithSearch={handleOpenHistoryWithSearch}
                        theme={theme}
                        onThemeChange={setTheme}
                        extensionStatus={extensionStatus}
                    />
                    <OnboardingTour
                        onOpenHistory={() => setIsHistoryModalOpen(true)}
                        onCloseHistory={() => setIsHistoryModalOpen(false)}
                        isHistoryModalOpen={isHistoryModalOpen}
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
            {console.log("DEBUG: App.jsx Session:", session)}
        </>
    );
}