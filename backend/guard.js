/**
 * Start-up safety checks. In production (NODE_ENV=production) the server refuses to start with
 * the insecure development defaults. In development it only warns, so local work stays zero-setup.
 */
'use strict';
const DEV_SECRET = 'dev-only-insecure-secret-do-not-use-in-production';

function problems(env){
  env = env || process.env;
  const out = [];
  if(!env.JWT_SECRET || env.JWT_SECRET === DEV_SECRET || env.JWT_SECRET.length < 32){
    out.push('JWT_SECRET must be set to a random value of at least 32 characters (e.g. `node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"`).');
  }
  if(!env.CORS_ORIGIN || env.CORS_ORIGIN.trim() === '*'){
    out.push('CORS_ORIGIN must list the exact origin(s) of the app, e.g. https://agents.yourcompany.co.ke (comma-separated for several). "*" is not allowed in production.');
  }
  return out;
}
function assertProduction(env){
  env = env || process.env;
  const list = problems(env);
  if(env.NODE_ENV === 'production'){
    if(list.length){
      console.error('\nRefusing to start in production:\n - ' + list.join('\n - ') + '\n');
      process.exit(1);
    }
  } else if(list.length && env.NODE_ENV !== 'test' && !env.PI_QUIET){
    console.warn('[security] Development defaults in use (fine locally, never in production):\n - ' + list.join('\n - '));
  }
}
module.exports = { problems, assertProduction, DEV_SECRET };
