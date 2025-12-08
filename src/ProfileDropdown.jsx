import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';

export default function ProfileDropdown({ userEmail, onSignOut, onDeleteAccount, theme, onThemeChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [confirmSignOut, setConfirmSignOut] = useState(false);
    const dropdownRef = useRef(null);
    const timerRef = useRef(null);
    const confirmRef = useRef(false); // Track confirmation synchronously

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
                setConfirmSignOut(false);
                confirmRef.current = false;
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [dropdownRef]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const toggleDropdown = () => {
        setIsOpen(!isOpen);
        if (isOpen) {
            // Closing
            setConfirmSignOut(false);
            confirmRef.current = false;
            if (timerRef.current) clearTimeout(timerRef.current);
        }
    };

    return (
        <div className="profile-dropdown-container" ref={dropdownRef} style={{ position: 'relative', zIndex: 50 }}>
            <button
                type="button"
                onClick={toggleDropdown}
                className="profile-dropdown-btn"
                style={{
                    // Inline styles that are dynamic or specific overrides
                    // Most styles moved to CSS class
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Arrow: Matches Additional Controls style using .toggle-icon class */}
                    <span
                        className="toggle-icon"
                        style={{
                            color: isOpen ? '#f59e0b' : '#94a3b8', // Gold when open, Grey (#94a3b8 matches CSS) when closed
                            transform: 'none',
                            transition: 'color 0.2s, transform 0.2s',
                            pointerEvents: 'none',
                            display: 'inline-block',
                        }}
                    >
                        {isOpen ? '▼' : '▶'}
                    </span>
                    <span style={{ pointerEvents: 'none' }}>{userEmail || 'Account'}</span>
                </div>
            </button>

            {isOpen && (
                <div
                    className="profile-menu"
                    style={{
                        position: 'absolute',
                        top: '100%',
                        right: '0',
                        // left: '0', // Removed to allow expansion
                        marginTop: '4px',
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        minWidth: '100%', // At least as wide as button
                        width: 'max-content', // Allow growing for long text
                        zIndex: 1000,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                >

                    <div style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', paddingLeft: '4px' }}>Theme</div>
                        <div style={{ display: 'flex', gap: '4px', background: 'var(--hover-bg)', padding: '4px', borderRadius: '6px' }}>
                            {[
                                { id: 'light', label: 'Light' },
                                { id: 'dark', label: 'Dark' },
                                { id: 'system', label: 'System' }
                            ].map((mode) => (
                                <button
                                    key={mode.id}
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onThemeChange(mode.id);
                                    }}
                                    style={{
                                        flex: 1,
                                        border: 'none',
                                        background: theme === mode.id ? 'var(--card-bg)' : 'transparent',
                                        color: theme === mode.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        boxShadow: theme === mode.id ? '0 1px 2px var(--shadow-color)' : 'none',
                                        borderRadius: '4px',
                                        padding: '6px 4px',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        fontWeight: theme === mode.id ? '600' : '400',
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {mode.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ padding: '4px' }}>

                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();

                                // Use ref for synchronous logic check
                                if (confirmRef.current) {
                                    setIsOpen(false);
                                    if (onSignOut) onSignOut(true); // Force sign out
                                } else {
                                    // Set both ref (for logic) and state (for UI)
                                    confirmRef.current = true;
                                    setConfirmSignOut(true);

                                    // Auto-reset after 3s
                                    if (timerRef.current) clearTimeout(timerRef.current);
                                    timerRef.current = setTimeout(() => {
                                        confirmRef.current = false;
                                        setConfirmSignOut(false);
                                    }, 3000);
                                }
                            }}
                            className={`profile-dropdown-item sign-out ${confirmSignOut ? 'confirming' : ''}`}
                        >
                            {confirmSignOut ? 'Confirm Sign Out?' : 'Sign Out'}
                        </button>
                    </div>
                    <div style={{ borderTop: '1px solid var(--border-color)', padding: '4px' }}>
                        <button
                            type="button"
                            onClick={() => {
                                setIsOpen(false);
                                if (onDeleteAccount) onDeleteAccount();
                            }}
                            className="profile-dropdown-item delete"
                        >
                            Delete Account
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

ProfileDropdown.propTypes = {
    userEmail: PropTypes.string,
    onSignOut: PropTypes.func,
    onDeleteAccount: PropTypes.func,
    theme: PropTypes.string,
    onThemeChange: PropTypes.func
};
