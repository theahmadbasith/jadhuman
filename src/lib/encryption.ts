import bcrypt from 'bcryptjs';
import CryptoJS from 'crypto-js';

const FIXED_SALT = '$2b$10$T8Zq3/b2u7xL/8Lh.l3.hO';
const APP_SECRET = 'jadhuman_secret_2026_super_secure_key_123';

export const hashPinLayered = (pin: string): string => {
  // Layer 1: bcrypt with fixed salt
  const layer1 = bcrypt.hashSync(pin, FIXED_SALT);
  // Layer 2: SHA256
  const layer2 = CryptoJS.SHA256(layer1).toString();
  // Layer 3: final bcrypt with random salt
  return bcrypt.hashSync(layer2, 10);
};

export const verifyPinLayered = (pin: string, hashFromDb: string): boolean => {
  try {
    const layer1 = bcrypt.hashSync(pin, FIXED_SALT);
    const layer2 = CryptoJS.SHA256(layer1).toString();
    return bcrypt.compareSync(layer2, hashFromDb);
  } catch (e) {
    return false;
  }
};

export const decryptAppCredential = (encryptedText: string): string => {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedText, APP_SECRET);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    return '';
  }
};

export const encryptAppCredential = (text: string): string => {
  return CryptoJS.AES.encrypt(text, APP_SECRET).toString();
};

