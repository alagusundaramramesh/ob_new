const crypto = require('crypto');

/*
 * Encrypts secrets that must be read back by the server (the GST portal API password of a company).
 * AES-256-GCM. The key is SECRET_KEY from .env (64 hex characters); when it is missing a key is derived from JWT_SECRET.
 * Change of the key makes the saved passwords unreadable, the user has to enter them again.
 */
class Secret {

    getKey() {
        if (process.env.SECRET_KEY && /^[0-9a-fA-F]{64}$/.test(process.env.SECRET_KEY)) {
            return Buffer.from(process.env.SECRET_KEY, 'hex');
        }
        return crypto.createHash('sha256').update(`ob-secret:${process.env.JWT_SECRET}`).digest();
    }

    /* Returns "iv:tag:data" in base64 parts */
    encrypt(plain_text) {
        let iv = crypto.randomBytes(12);
        let cipher = crypto.createCipheriv('aes-256-gcm', this.getKey(), iv);
        let encrypted = Buffer.concat([cipher.update(String(plain_text), 'utf8'), cipher.final()]);
        return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64')).join(':');
    }

    /* Returns '' when the value cannot be read (wrong key, damaged data) */
    decrypt(stored_value) {
        try {
            let [iv, tag, encrypted] = String(stored_value).split(':').map(part => Buffer.from(part, 'base64'));
            let decipher = crypto.createDecipheriv('aes-256-gcm', this.getKey(), iv);
            decipher.setAuthTag(tag);
            return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
        } catch (error) {
            return '';
        }
    }
}

module.exports = new Secret();
