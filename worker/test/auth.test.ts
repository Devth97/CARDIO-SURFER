import { describe, expect, it } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { verifyFirebaseToken } from '../src/auth';

const PROJECT_ID = 'test-project';
const KID = 'test-key';

async function buildTestJwks() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  return { privateKey, jwks: createLocalJWKSet({ keys: [publicJwk] }) };
}

describe('verifyFirebaseToken', () => {
  it('returns the verified user for a valid token', async () => {
    const { privateKey, jwks } = await buildTestJwks();
    const token = await new SignJWT({ name: 'Ada Lovelace', picture: 'https://example.com/a.png' })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setSubject('user-123')
      .setIssuer(`https://securetoken.google.com/${PROJECT_ID}`)
      .setAudience(PROJECT_ID)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    const result = await verifyFirebaseToken(token, PROJECT_ID, jwks);

    expect(result).toEqual({
      uid: 'user-123',
      displayName: 'Ada Lovelace',
      avatarUrl: 'https://example.com/a.png',
    });
  });

  it('falls back to null displayName/avatarUrl when absent from the token', async () => {
    const { privateKey, jwks } = await buildTestJwks();
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setSubject('user-456')
      .setIssuer(`https://securetoken.google.com/${PROJECT_ID}`)
      .setAudience(PROJECT_ID)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    const result = await verifyFirebaseToken(token, PROJECT_ID, jwks);

    expect(result).toEqual({ uid: 'user-456', displayName: null, avatarUrl: null });
  });

  it('rejects a token signed for a different Firebase project', async () => {
    const { privateKey, jwks } = await buildTestJwks();
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setSubject('user-123')
      .setIssuer(`https://securetoken.google.com/${PROJECT_ID}`)
      .setAudience('some-other-project')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(verifyFirebaseToken(token, PROJECT_ID, jwks)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const { privateKey, jwks } = await buildTestJwks();
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setSubject('user-123')
      .setIssuer(`https://securetoken.google.com/${PROJECT_ID}`)
      .setAudience(PROJECT_ID)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);

    await expect(verifyFirebaseToken(token, PROJECT_ID, jwks)).rejects.toThrow();
  });
});
