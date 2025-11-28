export class WebAuthnService {
    /**
     * Checks if WebAuthn is supported and available
     */
    static async isAvailable(): Promise<boolean> {
        if (!window.PublicKeyCredential) return false;

        // Check for platform authenticator (TouchID, FaceID, Windows Hello)
        if (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) {
            return true;
        }

        return false;
    }

    /**
     * Registers a new credential (fingerprint/face) for a user
     */
    static async registerCredential(userId: string, userName: string): Promise<PublicKeyCredential | null> {
        if (!await this.isAvailable()) {
            throw new Error('Biometría no disponible en este dispositivo');
        }

        // Challenge should come from server in production, but we mock it here
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const publicKey: PublicKeyCredentialCreationOptions = {
            challenge,
            rp: {
                name: 'Farmacias Vallenar',
                id: window.location.hostname // Must match current domain
            },
            user: {
                id: Uint8Array.from(userId, c => c.charCodeAt(0)),
                name: userName,
                displayName: userName
            },
            pubKeyCredParams: [
                { alg: -7, type: 'public-key' }, // ES256
                { alg: -257, type: 'public-key' } // RS256
            ],
            authenticatorSelection: {
                authenticatorAttachment: 'platform', // Force TouchID/FaceID
                userVerification: 'required'
            },
            timeout: 60000,
            attestation: 'none'
        };

        try {
            const credential = await navigator.credentials.create({ publicKey });
            return credential as PublicKeyCredential;
        } catch (error) {
            console.error('WebAuthn Registration Error:', error);
            throw error;
        }
    }

    /**
     * Authenticates a user via biometrics
     */
    /**
     * Authenticates a user via biometrics
     * @param allowedCredentialIds Optional list of credential IDs to allow (for non-resident keys)
     */
    static async authenticateCredential(allowedCredentialIds: string[] = []): Promise<PublicKeyCredential | null> {
        if (!await this.isAvailable()) {
            throw new Error('Biometría no disponible');
        }

        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const publicKey: PublicKeyCredentialRequestOptions = {
            challenge,
            rpId: window.location.hostname,
            userVerification: 'required',
            timeout: 60000,
        };

        if (allowedCredentialIds.length > 0) {
            publicKey.allowCredentials = allowedCredentialIds.map(id => {
                // Convert Base64URL to Base64
                const base64 = id.replace(/-/g, '+').replace(/_/g, '/');
                const pad = base64.length % 4;
                const padded = pad ? base64 + '='.repeat(4 - pad) : base64;

                return {
                    id: Uint8Array.from(atob(padded), c => c.charCodeAt(0)),
                    type: 'public-key',
                    transports: ['internal']
                };
            });
        }

        try {
            const credential = await navigator.credentials.get({ publicKey });
            return credential as PublicKeyCredential;
        } catch (error) {
            console.error('WebAuthn Authentication Error:', error);
            throw error;
        }
    }
}
