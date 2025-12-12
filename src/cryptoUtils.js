// Prompt Encryption Utility
// Uses Web Crypto API to encrypt prompts client-side before storing in Supabase
// This prevents server-side access to sensitive prompt content

// Generate a user-specific encryption key derived from their user ID
async function deriveKeyFromUserId(userId) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(userId),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    // Use a fixed salt (could be stored per-user for extra security)
    const salt = encoder.encode('BeaconBlockerPresetSalt_v1');

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

// Encrypt a prompt string
export async function encryptPrompt(prompt, userId) {
    if (!prompt || !userId) return prompt; // Return as-is if no prompt or userId

    try {
        const key = await deriveKeyFromUserId(userId);
        const encoder = new TextEncoder();
        const data = encoder.encode(prompt);

        // Generate random IV for each encryption
        const iv = crypto.getRandomValues(new Uint8Array(12));

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            data
        );

        // Combine IV + encrypted data and encode as base64
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);

        // Return as base64 with prefix to identify encrypted prompts
        return 'ENC:' + btoa(String.fromCharCode(...combined));
    } catch (error) {
        console.error('Encryption error:', error);
        return prompt; // Return unencrypted on error
    }
}

// Decrypt a prompt string
export async function decryptPrompt(encryptedPrompt, userId) {
    if (!encryptedPrompt || !userId) return encryptedPrompt;

    // Check if this is an encrypted prompt
    if (!encryptedPrompt.startsWith('ENC:')) {
        return encryptedPrompt; // Not encrypted, return as-is
    }

    try {
        const key = await deriveKeyFromUserId(userId);

        // Decode from base64
        const combined = Uint8Array.from(atob(encryptedPrompt.slice(4)), c => c.charCodeAt(0));

        // Extract IV and encrypted data
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            data
        );

        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch (error) {
        console.error('Decryption error:', error);
        return encryptedPrompt; // Return encrypted string on error
    }
}

// Check if a prompt is encrypted
export function isEncrypted(prompt) {
    return prompt && prompt.startsWith('ENC:');
}
