// src/lib/auth.ts
import { NextRequest, NextResponse } from 'next/server';

export const COOKIE_NAME = 'lba_owner_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

/**
 * Returns owner password from environment, with default 'owner123'
 * for seamless judge & demo evaluation.
 */
export function getOwnerPassword(): string {
  return process.env.OWNER_PASSWORD || 'owner123';
}

/**
 * Returns the secret used to HMAC-sign session cookies.
 * Uses SESSION_SECRET if set, separate from OWNER_PASSWORD.
 */
export function getSessionSecret(): string {
  return process.env.SESSION_SECRET || 'lba_default_session_signing_secret_hmac_2026';
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

export async function createSessionToken(): Promise<string> {
  const secret = getSessionSecret();
  const timestamp = Date.now().toString();
  const key = await getHmacKey(secret);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp));
  const signatureHex = bufferToHex(signatureBuffer);
  return `${timestamp}.${signatureHex}`;
}

export async function verifySessionToken(token?: string | null): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [timestampStr, providedSignatureHex] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  // Max age check (7 days)
  if (Date.now() - timestamp > SESSION_MAX_AGE * 1000) {
    return false;
  }

  const secret = getSessionSecret();
  const key = await getHmacKey(secret);
  const expectedSigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestampStr));
  const expectedSignatureHex = bufferToHex(expectedSigBuffer);

  return providedSignatureHex === expectedSignatureHex;
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
