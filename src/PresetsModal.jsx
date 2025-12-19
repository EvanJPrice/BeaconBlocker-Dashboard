import React, { useState, useEffect } from 'react';
import './Dashboard.css';

function PresetsModal({ isOpen, onClose, presets, activePresetId, onLoad, onRename, onDelete }) {
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);

    const [renameError, setRenameError] = useState(null);

    const handleStartEdit = (preset) => {
        setEditingId(preset.id);
        setEditName(preset.name);
        setDeleteConfirmId(null);
        setRenameError(null);
    };

    const handleSaveEdit = (id) => {
        const newName = editName.trim();
        if (!newName) return;

        // Check for duplicate name (excluding current preset)
        const duplicate = safePresets.find(p => p.id !== id && p.name.toLowerCase() === newName.toLowerCase());
        if (duplicate) {
            setRenameError(`A preset named "${duplicate.name}" already exists.`);
            return;
        }

        setRenameError(null);
        onRename(id, newName);
        setEditingId(null);
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
        setEditingId(null);
        setRenameError(null);
        onClose();
    };

    const safePresets = (Array.isArray(presets) ? presets : []).filter(p => p && p.id);
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={handleModalClose}>
            <div id="tour-load-modal" className="modal-content" onClick={(e) => e.stopPropagation()} style={{ height: 'auto', maxHeight: '80vh', minWidth: '600px', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        Manage Presets
                        <span style={{ fontSize: '0.85rem', fontWeight: '400', color: 'var(--text-secondary)' }}>
                            {safePresets.length}/10
                        </span>
                    </h2>
                    {/* Updated Close Button to match X style */}
                    <button className="modal-close-button" onClick={handleModalClose}>✕</button>
                </div>
                <div className="modal-body">
                    {safePresets.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                            <p>No presets saved yet.</p>
                            <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Configure your settings and click "Save As" to create one.</p>
                        </div>
                    ) : (
                        <ul className="log-feed-list">
                            {safePresets.map(preset => {
                                const isActive = preset.id === activePresetId;
                                return (
                                    <li key={preset.id} className="log-item" style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '1rem',
                                        padding: '12px',
                                        background: isActive ? 'var(--accent-bg, rgba(37, 99, 235, 0.1))' : 'transparent',
                                        borderLeft: isActive ? '3px solid var(--primary-color, #2563eb)' : '3px solid transparent',
                                        borderRadius: isActive ? '0 8px 8px 0' : 'none'
                                    }}>
                                        {editingId === preset.id ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <input
                                                        type="text"
                                                        className="tag-input-field"
                                                        value={editName}
                                                        onChange={(e) => { setEditName(e.target.value); setRenameError(null); }}
                                                        onFocus={(e) => e.target.select()}
                                                        autoFocus
                                                        style={{ padding: '6px 10px', fontSize: '0.9rem', flex: 1 }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleSaveEdit(preset.id);
                                                            if (e.key === 'Escape') setEditingId(null);
                                                        }}
                                                    />
                                                    {/* Green Success Button */}
                                                    <button className="success-button" onClick={() => handleSaveEdit(preset.id)}>Save</button>
                                                    <button className="neutral-button" onClick={() => setEditingId(null)} style={{ padding: '6px 12px' }}>Cancel</button>
                                                </div>
                                                {renameError && <span style={{ color: '#f59e0b', fontSize: '0.85rem' }}>{renameError}</span>}
                                            </div>
                                        ) : (
                                            <>
                                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{
                                                            fontWeight: '600',
                                                            color: isActive ? 'var(--primary-color, #2563eb)' : 'var(--text-primary)'
                                                        }}>
                                                            {preset.name}
                                                        </span>
                                                        {isActive && <span style={{ fontSize: '0.7rem', background: 'var(--primary-color, #2563eb)', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>Active</span>}
                                                    </div>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                        {new Date(preset.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                                    {!isActive ? (
                                                        <button
                                                            className="primary-button modal-action-btn"
                                                            onClick={() => { onLoad(preset); handleModalClose(); }}
                                                            title="Load Preset"
                                                            style={{ minWidth: '60px' }}
                                                        >
                                                            Load
                                                        </button>
                                                    ) : (
                                                        <button
                                                            className="primary-button modal-action-btn"
                                                            style={{ minWidth: '60px', visibility: 'hidden' }}
                                                            disabled
                                                        >
                                                            Load
                                                        </button>
                                                    )}
                                                    <button
                                                        className="neutral-button modal-action-btn"
                                                        onClick={() => handleStartEdit(preset)}
                                                        title="Rename"
                                                        style={{ minWidth: '70px' }}
                                                    >
                                                        Rename
                                                    </button>
                                                    <button
                                                        className={`destructive-button modal-action-btn ${deleteConfirmId === preset.id ? 'confirming' : ''}`}
                                                        onClick={() => handleDeleteClick(preset.id)}
                                                        title="Delete"
                                                        style={{ minWidth: '70px' }}
                                                    >
                                                        {deleteConfirmId === preset.id ? 'Confirm?' : 'Delete'}
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

export default PresetsModal;