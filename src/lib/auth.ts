// src/lib/auth.ts
import { NextRequest, NextResponse } from 'next/server';

export const COOKIE_NAME = 'lba_owner_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

/**
 * Returns owner password strictly from environment variable OWNER_PASSWORD.
 * Refuses any hard-coded default.
 */
export function getOwnerPassword(): string {
  return process.env.OWNER_PASSWORD || '';
}

/**
 * Returns the secret used to HMAC-sign session cookies strictly from SESSION_SECRET.
 * Refuses any hard-coded default.
 */
export function getSessionSecret(): string {
  return process.env.SESSION_SECRET || '';
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBuffer(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export async function createSessionToken(): Promise<string> {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('SESSION_SECRET environment variable is missing.');
  }
  const timestamp = Date.now().toString();
  const key = await getHmacKey(secret);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp));
  const signatureHex = bufferToHex(signatureBuffer);
  return `${timestamp}.${signatureHex}`;
}

export async function verifySessionToken(token?: string | null): Promise<boolean> {
  if (!token) return false;
  const secret = getSessionSecret();
  if (!secret) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [timestampStr, providedSignatureHex] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  // Max age check (7 days)
  if (Date.now() - timestamp > SESSION_MAX_AGE * 1000) {
    return false;
  }

  try {
    const key = await getHmacKey(secret);
    const sigBytes = hexToBuffer(providedSignatureHex);
    const dataBytes = new TextEncoder().encode(timestampStr);
    return await crypto.subtle.verify('HMAC', key, sigBytes, dataBytes);
  } catch {
    return false;
  }
}

export async function setSessionCookie(res: NextResponse): Promise<void> {
  const token = await createSessionToken();
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.delete(COOKIE_NAME);
}

export async function isOwnerAuthenticated(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get(COOKIE_NAME);
  return await verifySessionToken(cookie?.value);
}

export const CHAT_COOKIE_NAME = 'lba_customer_session';

export async function createCustomerSessionToken(conversationId: string): Promise<string> {
  const secret = getSessionSecret() || 'customer_session_hmac_secret';
  const key = await getHmacKey(secret);
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(conversationId)
  );
  return `${conversationId}.${bufferToHex(signatureBuffer)}`;
}

export async function verifyCustomerSessionToken(
  token?: string | null,
  conversationId?: string | null
): Promise<boolean> {
  if (!token || !conversationId) return false;
  const secret = getSessionSecret() || 'customer_session_hmac_secret';
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;
  const tokenConvId = token.slice(0, dotIndex);
  const tokenSig = token.slice(dotIndex + 1);
  if (tokenConvId !== conversationId) return false;

  try {
    const key = await getHmacKey(secret);
    const sigBytes = hexToBuffer(tokenSig);
    return await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(conversationId)
    );
  } catch {
    return false;
  }
}
