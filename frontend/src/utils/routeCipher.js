/**
 * Route ID obfuscation utility.
 *
 * Encodes integer package IDs into URL-safe opaque strings so that raw
 * database IDs are never visible in the browser address bar.
 *
 * Approach: XOR each character of the stringified ID with a static salt,
 * then Base64-encode the result and make it URL-safe.
 *
 * NOTE: This is obfuscation, NOT cryptographic encryption.  Real
 * authorization is enforced by the JWT token on every API call.
 */

// const SALT = 'ops_qc_route_2026';
const SALT = 'truedata_qc_loandna_2026';

/**
 * Encode an integer package ID into a URL-safe opaque string.
 * @param {number|string} id - The integer package ID (e.g. 42)
 * @returns {string} URL-safe encoded string (e.g. "aBcDeFgH")
 */
export const encodePackageId = (id) => {
  const str = String(id);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) ^ SALT.charCodeAt(i % SALT.length);
  }
  // Convert Uint8Array → binary string → Base64
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  // Make URL-safe: replace + → -, / → _, strip =
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Decode a URL-safe encoded string back to an integer package ID.
 * @param {string} encoded - The encoded string from the URL
 * @returns {number} The original integer package ID
 * @throws {Error} If the encoded string is invalid or tampered
 */
export const decodePackageId = (encoded) => {
  if (!encoded || typeof encoded !== 'string') {
    throw new Error('Invalid encoded package ID');
  }
  // Restore Base64: - → +, _ → /, add padding
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) {
    base64 += '='.repeat(4 - pad);
  }

  let binary;
  try {
    binary = atob(base64);
  } catch {
    throw new Error('Invalid encoded package ID');
  }

  // Un-XOR with salt
  let result = '';
  for (let i = 0; i < binary.length; i++) {
    result += String.fromCharCode(
      binary.charCodeAt(i) ^ SALT.charCodeAt(i % SALT.length)
    );
  }

  const id = parseInt(result, 10);
  if (isNaN(id) || id <= 0 || String(id) !== result) {
    throw new Error('Invalid encoded package ID');
  }
  return id;
};

