import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

const LOGS_PER_PAGE = 50; // Number of logs to fetch at a time

// This component fetches and manages its own data
export default function FullHistoryModal({ isOpen, onClose, userId, getFaviconUrl, initialSearchTerm = '', onHistoryCleared, onReportBug }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);
    const [totalLogs, setTotalLogs] = useState(0);
    const [searchTerm, setSearchTerm] = useState(initialSearchTerm); // Search state
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(initialSearchTerm); // Debounced search state
    const [expandedLogId, setExpandedLogId] = useState(null); // Click to expand log details

    const modalContentRef = useRef(null);

    // Scroll to top when page changes
    useEffect(() => {
        if (modalContentRef.current) {
            modalContentRef.current.scrollTop = 0;
        }
    }, [currentPage]);

    // Update search term if prop changes (e.g. when opening from a specific log)
    useEffect(() => {
        if (isOpen) {
            setSearchTerm(initialSearchTerm);
            setDebouncedSearchTerm(initialSearchTerm);
        }
    }, [isOpen, initialSearchTerm]);

    // --- Helper: Format Date ---
    const formatLogDate = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return isToday ? timeStr : `${date.toLocaleDateString()} • ${timeStr}`;
    };

    // --- Helper: Group Logs by Date ---
    const groupLogsByDate = (logs) => {
        const groups = {
            'Today': [],
            'Yesterday': [],
            'Last 7 Days': [],
            'Older': []
        };

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const lastWeek = new Date(today);
        lastWeek.setDate(lastWeek.getDate() - 7);

        logs.forEach(log => {
            const date = new Date(log.created_at);
            const logDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

            if (logDate.getTime() === today.getTime()) {
                groups['Today'].push(log);
            } else if (logDate.getTime() === yesterday.getTime()) {
                groups['Yesterday'].push(log);
            } else if (logDate > lastWeek) {
                groups['Last 7 Days'].push(log);
            } else {
                groups['Older'].push(log);
            }
        });

        // Remove empty groups
        return Object.fromEntries(Object.entries(groups).filter(([_, list]) => list.length > 0));
    };

    // --- Debounced Search ---
    useEffect(() => {
        const timer = setTimeout(() => {
            setCurrentPage(0); // Reset page on search
            // The actual fetch is triggered by the searchTerm dependency in the other effects
            // We just need to ensure we don't trigger it too fast.
            // Actually, to properly debounce, we should have a debouncedSearchTerm state.
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Fetch the total count
    useEffect(() => {
        if (isOpen && userId) {
            async function fetchTotalCount() {
                let query = supabase
                    .from('blocking_log')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', userId);

                if (debouncedSearchTerm) {
                    // Search across url, domain, and page_title
                    query = query.or(`url.ilike.%${debouncedSearchTerm}%,domain.ilike.%${debouncedSearchTerm}%,page_title.ilike.%${debouncedSearchTerm}%`);
                }

                const { count, error } = await query;

                if (error) {
                    console.error("Error fetching log count:", error);
                } else {
                    setTotalLogs(count || 0);
                }
            }
            fetchTotalCount();
        }
    }, [isOpen, userId, debouncedSearchTerm]);

    // Fetch logs
    useEffect(() => {
        if (isOpen && userId) {
            async function fetchHistoryPage() {
                setLoading(true);
                const from = currentPage * LOGS_PER_PAGE;
                const to = from + LOGS_PER_PAGE - 1;

                let query = supabase
                    .from('blocking_log')
                    .select('*')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .range(from, to);

                if (debouncedSearchTerm) {
                    // Search across url, domain, and page_title
                    query = query.or(`url.ilike.%${debouncedSearchTerm}%,domain.ilike.%${debouncedSearchTerm}%,page_title.ilike.%${debouncedSearchTerm}%`);
                }

                const { data, error } = await query;

                if (error) {
                    console.error("Error fetching log page:", error);
                } else {
                    setLogs(data || []);
                }
                setLoading(false);
            }
            fetchHistoryPage();
        }
    }, [isOpen, userId, currentPage, debouncedSearchTerm]);

    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // --- Clear History ---
    const handleClearHistory = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) {
                alert("You must be logged in to clear history.");
                return;
            }

            const response = await fetch('http://localhost:3000/clear-history', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || "Failed to clear history");
            }

            // Clear local state
            setLogs([]);
            setTotalLogs(0);
            setCurrentPage(0);
            setShowClearConfirm(false);

            // Notify parent to refresh main feed
            if (onHistoryCleared) onHistoryCleared();

        } catch (error) {
            console.error("Error clearing history:", error);
            alert(`Error clearing history: ${error.message}`);
        }
    };

    // Don't render anything if the modal is closed
    if (!isOpen) {
        return null;
    }

    const totalPages = Math.ceil(totalLogs / LOGS_PER_PAGE);
    const canGoPrev = currentPage > 0;
    const canGoNext = (currentPage + 1) * LOGS_PER_PAGE < totalLogs;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div id="tour-full-history-modal" className="modal-content" ref={modalContentRef} onClick={e => e.stopPropagation()} style={{ position: 'relative', zIndex: 2001 }}>
                <div className="modal-header" style={{ display: 'block', paddingBottom: '0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <h2 style={{ margin: 0 }}>Full History</h2>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <button
                                id="tour-clear-history-btn"
                                className={`destructive-button ${showClearConfirm ? 'confirming' : ''}`}
                                onClick={() => {
                                    if (showClearConfirm) {
                                        handleClearHistory();
                                    } else {
                                        setShowClearConfirm(true);
                                        // Auto-reset after 3 seconds if not clicked
                                        setTimeout(() => setShowClearConfirm(false), 3000);
                                    }
                                }}
                            >
                                {showClearConfirm ? "Confirm Clear History?" : "Clear History"}
                            </button>
                            <button
                                className="modal-close-button"
                                onClick={onClose}
                                style={{ fontSize: '2rem', padding: '0 0.5rem', marginTop: '-0.5rem' }}
                            >
                                &times;
                            </button>
                        </div>
                    </div>
                    <div style={{ position: 'relative', marginBottom: '1rem' }}>
                        <input
                            type="text"
                            placeholder="Search by URL, title, or domain..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '12px 16px',
                                paddingRight: '40px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                fontSize: '1rem',
                                boxSizing: 'border-box',
                                background: 'var(--input-bg)',
                                color: 'var(--text-primary)'
                            }}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                style={{
                                    position: 'absolute',
                                    right: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    fontSize: '1.2rem'
                                }}
                            >
                                &times;
                            </button>
                        )}
                    </div>

                    {/* Fixed Pagination Controls */}
                    <div className="pagination-controls" style={{ marginTop: 0, marginBottom: 0, paddingTop: 0, borderTop: 'none', borderBottom: 'none', paddingBottom: '1rem', justifyContent: 'space-between' }}>
                        <button onClick={() => setCurrentPage(p => p - 1)} disabled={!canGoPrev || loading} style={{ padding: '6px 12px' }}>
                            &larr; Previous
                        </button>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            Page {currentPage + 1} of {totalPages || 1}
                        </span>
                        <button onClick={() => setCurrentPage(p => p + 1)} disabled={!canGoNext || loading} style={{ padding: '6px 12px' }}>
                            Next &rarr;
                        </button>
                    </div>
                </div>

                <div className="modal-body" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s', minHeight: '300px', display: 'flex', flexDirection: 'column', paddingTop: '0' }}>

                    <ul id="tour-history-view" className="log-feed-list full-history-list" style={{ flexGrow: 1 }}>
                        {logs.length === 0 && !loading ? (
                            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '2rem' }}>No history found.</p>
                        ) : (
                            Object.entries(groupLogsByDate(logs)).map(([groupName, groupLogs], groupIndex) => (
                                <div key={groupName} style={{ marginBottom: '1.5rem' }}>
                                    <h3 style={{
                                        fontSize: '0.95rem',
                                        fontWeight: '600',
                                        fontWeight: '600',
                                        color: 'var(--text-secondary)',
                                        margin: '0 0 0.5rem 0',
                                        paddingBottom: '0.25rem',
                                        borderBottom: '1px solid var(--border-color)'
                                    }}>
                                        {groupName}
                                    </h3>
                                    {groupLogs.map((log, logIndex) => {
                                        // Logic: Normalize decision to BLOCK or ALLOW
                                        const rawDecision = log.decision ? log.decision.toUpperCase() : 'BLOCK';
                                        const isCache = rawDecision.includes('CACHE') || (log.reason && log.reason.toLowerCase().includes('cache'));
                                        const normalizedDecision = rawDecision.replace('_CACHE', ''); // BLOCK or ALLOW
                                        const decisionClass = normalizedDecision.toLowerCase(); // 'allow' or 'block'
                                        const decisionText = normalizedDecision;

                                        // Reason text logic
                                        let mainReason = log.reason;
                                        let expandedReason = log.reason;

                                        if (isCache) {
                                            mainReason = "Previous AI Decision";
                                            expandedReason = "Previous AI Decision (Decision stored in cache)";
                                        }

                                        return (
                                            <li
                                                key={log.id}
                                                id={groupIndex === 0 && logIndex === 0 ? 'tour-history-item-0' : undefined}
                                                className={`log-item log-item-${decisionClass}`}
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
                                                                {formatLogDate(log.created_at)}
                                                            </span>
                                                        </span>
                                                        <span className="log-reason" title={mainReason} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                            {mainReason}
                                                        </span>
                                                    </div>
                                                    <div style={{ marginLeft: 'auto', paddingLeft: '1rem' }}>
                                                        <span className={`decision-badge ${decisionClass}`}>{decisionText}</span>
                                                    </div>
                                                </div>

                                                {expandedLogId === log.id && (
                                                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                                        <p><strong>Full URL:</strong> <a href={log.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--link-color)', wordBreak: 'break-all' }}>{log.url}</a></p>
                                                        <p><strong>Reason:</strong> {expandedReason}</p>
                                                        <p><strong>Time:</strong> {new Date(log.created_at).toLocaleString()}</p>

                                                        {/* Feature: Link to history for this URL or Domain */}
                                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSearchTerm(log.url);
                                                                }}
                                                                style={{
                                                                    padding: '8px 12px',
                                                                    fontSize: '0.85rem',
                                                                    fontWeight: '600',
                                                                    width: 'auto',
                                                                    cursor: 'pointer',
                                                                    background: '#ffffff',
                                                                    color: '#1e293b',
                                                                    border: '1px solid #cbd5e1',
                                                                    borderRadius: '6px',
                                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                                }}
                                                            >
                                                                View history for this specific page
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSearchTerm(log.domain);
                                                                }}
                                                                style={{
                                                                    padding: '8px 12px',
                                                                    fontSize: '0.85rem',
                                                                    fontWeight: '600',
                                                                    width: 'auto',
                                                                    cursor: 'pointer',
                                                                    background: '#ffffff',
                                                                    color: '#1e293b',
                                                                    border: '1px solid #cbd5e1',
                                                                    borderRadius: '6px',
                                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                                }}
                                                            >
                                                                View history for {log.domain}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </div>
                            ))
                        )}
                    </ul>

                    {/* Bottom Pagination (Optional, but good to keep for convenience at bottom) */}
                    <div className="pagination-controls">
                        <button onClick={() => setCurrentPage(p => p - 1)} disabled={!canGoPrev || loading}>
                            &larr; Previous
                        </button>
                        <span>
                            Page {currentPage + 1} of {totalPages || 1}
                        </span>
                        <button onClick={() => setCurrentPage(p => p + 1)} disabled={!canGoNext || loading}>
                            Next &rarr;
                        </button>
                    </div>

                    {/* Footer Tips */}
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                        <p style={{ margin: 0 }}>
                            Tip: You can clear your cache or update blocking rules in the Dashboard settings.
                            <br />
                            Found a bug? <button onClick={onReportBug} className="link-button">Report it</button>.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}