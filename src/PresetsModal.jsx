import React, { useState, useEffect } from 'react';
import './Dashboard.css';

function PresetsModal({ isOpen, onClose, presets, onLoad, onRename, onDelete }) {
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);

    const handleStartEdit = (preset) => {
        setEditingId(preset.id);
        setEditName(preset.name);
        setDeleteConfirmId(null);
    };

    const handleSaveEdit = (id) => {
        if (editName.trim()) {
            onRename(id, editName.trim());
            setEditingId(null);
        }
    };

    const handleDeleteClick = (id) => {
        if (deleteConfirmId === id) {
            onDelete(id);
            setDeleteConfirmId(null);
        } else {
            setDeleteConfirmId(id);
            setTimeout(() => setDeleteConfirmId(null), 3000);
        }
    };

    const handleModalClose = () => {
        if (editingId && editName.trim()) {
            onRename(editingId, editName.trim());
        }
        setEditingId(null);
        onClose();
    };

    const safePresets = (Array.isArray(presets) ? presets : []).filter(p => p && p.id);
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={handleModalClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ height: 'auto', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2>Manage Presets</h2>
                    <button className="modal-close-button" onClick={handleModalClose}>&times;</button>
                </div>
                <div className="modal-body">
                    {safePresets.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                            <p>No presets saved yet.</p>
                            <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Configure your settings and click "Save Preset" to create one.</p>
                        </div>
                    ) : (
                        <ul className="log-feed-list">
                            {safePresets.map(preset => (
                                <li key={preset.id} className="log-item" style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    padding: '12px'
                                }}>
                                    {editingId === preset.id ? (
                                        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                            <input
                                                type="text"
                                                className="tag-input-field"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                onFocus={(e) => e.target.select()}
                                                autoFocus
                                                style={{ padding: '6px 10px', fontSize: '0.9rem', flex: 1 }}
                                            />
                                            <button className="primary-button" onClick={() => handleSaveEdit(preset.id)} style={{ padding: '6px 12px' }}>Save</button>
                                            <button className="neutral-button" onClick={() => setEditingId(null)} style={{ padding: '6px 12px' }}>Cancel</button>
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{preset.name}</span>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                    {new Date(preset.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    className="primary-button modal-action-btn"
                                                    onClick={() => { onLoad(preset); handleModalClose(); }}
                                                    title="Load Preset"
                                                >
                                                    Load
                                                </button>
                                                <button
                                                    className="neutral-button modal-action-btn"
                                                    onClick={() => handleStartEdit(preset)}
                                                    title="Rename"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    className={`neutral-button modal-action-btn ${deleteConfirmId === preset.id ? 'confirming' : ''}`}
                                                    onClick={() => handleDeleteClick(preset.id)}
                                                    title="Delete"
                                                    style={{
                                                        color: deleteConfirmId === preset.id ? 'white' : '#ef4444',
                                                        borderColor: deleteConfirmId === preset.id ? '#dc2626' : '#ef4444'
                                                    }}
                                                >
                                                    {deleteConfirmId === preset.id ? 'Confirm?' : 'Delete'}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

export default PresetsModal;
