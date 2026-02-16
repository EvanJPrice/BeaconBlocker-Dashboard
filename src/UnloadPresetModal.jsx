import React from 'react';

export default function UnloadPresetModal({ isOpen, onClose, onUnload }) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', height: 'auto', minHeight: 'auto' }}>
                <div className="modal-header">
                    <h2>Reset Dashboard?</h2>
                    <button className="modal-close-button" onClick={onClose}>✕</button>
                </div>

                <div style={{ padding: '1rem 0' }}>
                    <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', lineHeight: '1.5', fontSize: '0.95rem' }}>
                        This will <strong>remove all settings currently on the page</strong> and discard any <strong>unsaved changes</strong> to your active preset.
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button
                            onClick={onClose}
                            className="neutral-button"
                            style={{ padding: '10px 20px' }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onUnload}
                            className="primary-button"
                            style={{ padding: '10px 20px' }}
                        >
                            Reset
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}