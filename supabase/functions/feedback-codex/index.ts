import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.2.12';
import { createHandler, OIDC_ISSUER, pinnedWorkerEnv } from './handler.mjs';

const githubKeys = createRemoteJWKSet(new URL(`${OIDC_ISSUER}/.well-known/jwks`), {
  timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 600000,
});

Deno.serve(createHandler({
  env: pinnedWorkerEnv((name: string) => Deno.env.get(name)),
  verifyOidc: async (token: string, audience: string) => {
    const { payload } = await jwtVerify(token, githubKeys, {
      algorithms: ['RS256'], issuer: OIDC_ISSUER, audience, clockTolerance: 0,
      requiredClaims: ['sub', 'exp', 'iat', 'nbf', 'repository_id', 'repository',
        'repository_visibility', 'workflow_ref', 'ref', 'event_name', 'run_id', 'run_attempt'],
      maxTokenAge: '10 minutes',
    });
    return payload;
  },
}));
