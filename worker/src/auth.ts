import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { VerifiedUser } from './types';

const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let remoteJwks: JWTVerifyGetKey | null = null;

export async function verifyFirebaseToken(
  token: string,
  projectId: string,
  jwks: JWTVerifyGetKey = (remoteJwks ??= createRemoteJWKSet(new URL(FIREBASE_JWKS_URL))),
): Promise<VerifiedUser> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Firebase token missing subject claim');
  }

  return {
    uid: payload.sub,
    displayName: typeof payload.name === 'string' ? payload.name : null,
    avatarUrl: typeof payload.picture === 'string' ? payload.picture : null,
  };
}
