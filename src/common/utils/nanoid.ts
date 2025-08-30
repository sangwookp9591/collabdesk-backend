import { customAlphabet } from 'nanoid';

export function generateShortCode() {
  const alphabet =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const nanoid = customAlphabet(alphabet, 6);
  return nanoid();
}
