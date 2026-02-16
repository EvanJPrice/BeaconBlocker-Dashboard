import { useState, useEffect } from 'react';

export default function DeleteAccountModal({ isOpen, onClose, onDelete, loading }) {
    const [confirmText, setConfirmText] = useState('');

    // Reset input when modal opens
    useEffect(() => {
        if (isOpen) {
            setConfirmText('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const isConfirmed = confirmText === 'DELETE';

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', height: 'auto', minHeight: 'auto' }}>
                <div className="modal-header">
                    <h2 style={{ color: '#dc2626' }}>Delete Account</h2>
                    <button className="modal-close-button" onClick={onClose}>✕</button>
                </div>

                <div style={{ padding: '1rem 0' }}>
                    <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                        This action is <strong>irreversible</strong>. All your rules, logs, and account data will be permanently deleted.
                    </p>
                    <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                        Type <strong>DELETE</strong> below to confirm.
                    </p>

                    <input
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="DELETE"
                        style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            marginBottom: '0.5rem',
                            fontFamily: 'inherit',
                            background: 'var(--input-bg)',
                            color: 'var(--text-primary)'
                        }}
                    />
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                        Tip: Case sensitive
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button
                            onClick={onClose}
                            style={{
                                padding: '10px 20px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--hover-bg)',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                fontWeight: '600'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onDelete}
                            disabled={!isConfirmed || loading}
                            style={{
                                padding: '10px 20px',
                                borderRadius: '6px',
                                border: 'none',
                                background: isConfirmed ? '#dc2626' : '#fca5a5',
                                color: 'white',
                                cursor: isConfirmed && !loading ? 'pointer' : 'not-allowed',
                                fontWeight: '600',
                                transition: 'all 0.2s'
                            }}
                        >
                            {loading ? 'Deleting...' : 'Delete Account'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
