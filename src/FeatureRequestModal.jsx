import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function FeatureRequestModal({ isOpen, onClose, userId, userEmail }) {
    const [idea, setIdea] = useState('');
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
        console.log('Feature submit clicked, idea:', idea);
        if (!idea.trim()) {
            alert('Please describe your feature idea.');
            return;
        }

        setLoading(true);
        console.log('Submitting feature idea...');

        try {
            const timestamp = new Date().toISOString();

            // 1. Save to DB (using bug_reports table with type field)
            const { data: { session } } = await supabase.auth.getSession();
            const authHeader = session?.access_token
                ? { 'Authorization': `Bearer ${session.access_token}` }
                : {};

            const response = await fetch('http://localhost:3000/report-bug', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeader },
                body: JSON.stringify({
                    description: `[FEATURE IDEA] ${idea}`,
                    steps: '', // No steps for feature requests
                    anonymous: !userId,
                    user_id: userId,
                    user_email: manualEmail,
                    timestamp,
                    recipient: 'ej3price@gmail.com'
                })
            });

            if (!response.ok) throw new Error('Failed to send feature idea');

            setSuccess(true);
            setIdea('');

            setTimeout(() => {
                setSuccess(false);
                onClose();
            }, 2000);

        } catch (error) {
            console.error('Error submitting feature idea:', error);
            alert('Failed to send. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', minHeight: 'auto', height: 'auto' }}>
                <div className="modal-header">
                    <h2>Share a Feature Idea</h2>
                    <button className="modal-close-button" onClick={onClose}>&times;</button>
                </div>

                {success ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#166534' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                        <h3>Idea Received!</h3>
                        <p>Thank you for helping us improve Beacon Blocker.</p>
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
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    fontSize: '1rem',
                                    background: 'var(--input-bg)',
                                    color: 'var(--text-primary)',
                                    boxSizing: 'border-box'
                                }}
                            />
                            <small style={{ color: 'var(--text-secondary)' }}>So we can follow up if needed</small>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Describe your idea</label>
                            <textarea
                                value={idea}
                                onChange={(e) => setIdea(e.target.value)}
                                placeholder="What feature would make Beacon Blocker better for you?"
                                required
                                style={{
                                    width: '100%',
                                    minHeight: '120px',
                                    padding: '0.75rem',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    fontSize: '1rem',
                                    resize: 'vertical',
                                    background: 'var(--input-bg)',
                                    color: 'var(--text-primary)',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                borderRadius: '8px',
                                background: loading ? '#94a3b8' : '#2563eb',
                                color: 'white',
                                border: 'none',
                                fontSize: '1rem',
                                fontWeight: '600',
                                cursor: loading ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {loading ? 'Sending...' : 'Submit Idea'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
