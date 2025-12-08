import React from 'react';

export default function UnloadPresetModal({ isOpen, onClose, onUnload }) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', height: 'auto', minHeight: 'auto' }}>
                <div className="modal-header">
                    <h2>Unload Preset</h2>
                    <button className="modal-close-button" onClick={onClose}>&times;</button>
                </div>

                <div style={{ padding: '1rem 0' }}>
                    <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                        This will disconnect your current settings from the preset. Your current rules will remain active, but they won't specificially belong to a preset anymore.
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
                            style={{ padding: '10px 20px', backgroundColor: '#64748b' }} // Neutral/Grey for unload action
                        >
                            Unload
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
