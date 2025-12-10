import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

export default function BugReportModal({ isOpen, onClose, userId, userEmail }) {
    console.log("DEBUG: BugReportModal Props:", { userId, userEmail });
    const [description, setDescription] = useState('');
    const [steps, setSteps] = useState('');
    const [manualEmail, setManualEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    // Screenshot state
    const [screenshot, setScreenshot] = useState(null);
    const [screenshotPreview, setScreenshotPreview] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);

    // Initialize manualEmail when modal opens
    useEffect(() => {
        if (isOpen && userEmail) {
            setManualEmail(userEmail);
        }
    }, [isOpen, userEmail]);

    // Clean up preview URL when component unmounts or screenshot changes
    useEffect(() => {
        return () => {
            if (screenshotPreview) {
                URL.revokeObjectURL(screenshotPreview);
            }
        };
    }, [screenshotPreview]);

    if (!isOpen) return null;

    const handleFileSelect = (file) => {
        if (file && file.type.startsWith('image/')) {
            // Check file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                alert('Image must be under 5MB');
                return;
            }
            setScreenshot(file);
            setScreenshotPreview(URL.createObjectURL(file));
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        handleFileSelect(file);
    };

    const handleFileInputChange = (e) => {
        const file = e.target.files[0];
        handleFileSelect(file);
    };

    const removeScreenshot = () => {
        setScreenshot(null);
        if (screenshotPreview) {
            URL.revokeObjectURL(screenshotPreview);
        }
        setScreenshotPreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            let screenshotUrl = null;

            // Upload screenshot to Supabase Storage if provided
            if (screenshot) {
                const fileExt = screenshot.name.split('.').pop();
                const fileName = `bug-report-${Date.now()}.${fileExt}`;
                const filePath = `bug-reports/${fileName}`;

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('Beacon Blocker - Marketing')
                    .upload(filePath, screenshot, {
                        cacheControl: '3600',
                        upsert: false
                    });

                if (uploadError) {
                    console.error('Screenshot upload error:', uploadError);
                    // Continue without screenshot
                } else {
                    // Get public URL
                    const { data: { publicUrl } } = supabase.storage
                        .from('Beacon Blocker - Marketing')
                        .getPublicUrl(filePath);
                    screenshotUrl = publicUrl;
                }
            }

            const reportData = {
                description,
                steps,
                anonymous: false,
                user_id: userId,
                user_email: manualEmail,
                screenshot_url: screenshotUrl,
                timestamp: new Date().toISOString(),
                recipient: 'ej3price@gmail.com'
            };

            // Send to backend
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const headers = {
                'Content-Type': 'application/json'
            };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch('http://localhost:3000/report-bug', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(reportData)
            });

            if (!response.ok) throw new Error('Failed to send report');

            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                setDescription('');
                setSteps('');
                setScreenshot(null);
                setScreenshotPreview(null);
                onClose();
            }, 2000);

        } catch (error) {
            console.error('Error reporting bug:', error);
            alert('Failed to send report. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', minHeight: 'auto', height: 'auto' }}>
                <div className="modal-header">
                    <h2>Report a Bug</h2>
                    <button className="modal-close-button" onClick={onClose}>&times;</button>
                </div>

                {success ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#166534' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                        <h3>Report Sent!</h3>
                        <p>Thank you for helping us improve.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={{ padding: '1rem 0' }}>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Contact Email (Optional)</label>
                            <input
                                type="email"
                                value={manualEmail}
                                onChange={e => setManualEmail(e.target.value)}
                                placeholder="your@email.com"
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontFamily: 'inherit', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                            />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>What happened?</label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Describe the issue..."
                                required
                                style={{ width: '100%', minHeight: '80px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontFamily: 'inherit', resize: 'vertical', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                            />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Steps to reproduce (Optional)</label>
                            <textarea
                                value={steps}
                                onChange={e => setSteps(e.target.value)}
                                placeholder="1. Go to..."
                                style={{ width: '100%', minHeight: '80px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontFamily: 'inherit', resize: 'vertical', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                            />
                        </div>

                        {/* Screenshot Upload */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Screenshot (Optional)</label>

                            {screenshotPreview ? (
                                <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                                    <img
                                        src={screenshotPreview}
                                        alt="Screenshot preview"
                                        style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', background: '#f8fafc' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={removeScreenshot}
                                        style={{
                                            position: 'absolute',
                                            top: '8px',
                                            right: '8px',
                                            background: '#ef4444',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '50%',
                                            width: '28px',
                                            height: '28px',
                                            cursor: 'pointer',
                                            fontSize: '16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                            ) : (
                                <div
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        border: `2px dashed ${isDragging ? '#234b7a' : 'var(--border-color)'}`,
                                        borderRadius: '8px',
                                        padding: '24px',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        background: isDragging ? '#f0f7ff' : 'var(--input-bg)',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>📷</div>
                                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                        Drag & drop an image or <span style={{ color: '#234b7a', textDecoration: 'underline' }}>browse</span>
                                    </p>
                                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                        PNG, JPG up to 5MB
                                    </p>
                                </div>
                            )}

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileInputChange}
                                style={{ display: 'none' }}
                            />
                        </div>

                        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                type="button"
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
                                type="submit"
                                disabled={loading}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: '#234b7a',
                                    color: 'white',
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                    opacity: loading ? 0.7 : 1
                                }}
                            >
                                {loading ? 'Sending...' : 'Send Report'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
