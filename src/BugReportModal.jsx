import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function BugReportModal({ isOpen, onClose, userId, userEmail }) {
    console.log("DEBUG: BugReportModal Props:", { userId, userEmail });
    const [description, setDescription] = useState('');
    const [steps, setSteps] = useState('');
    const [manualEmail, setManualEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    // Initialize manualEmail when modal opens
    useEffect(() => {
        if (isOpen && userEmail) {
            setManualEmail(userEmail);
        }
    }, [isOpen, userEmail]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const reportData = {
                description,
                steps,
                anonymous: false, // Always false now
                user_id: userId,
                user_email: manualEmail, // Use manualEmail directly (empty string means anonymous)
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

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Steps to reproduce (Optional)</label>
                            <textarea
                                value={steps}
                                onChange={e => setSteps(e.target.value)}
                                placeholder="1. Go to..."
                                style={{ width: '100%', minHeight: '80px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontFamily: 'inherit', resize: 'vertical', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
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
                                    background: '#2563eb',
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
