/* Deployment settings — edit this file once per deployment (no rebuild needed).
 *
 * api      Address of your backend server (the Node app in /backend), e.g.
 *          "https://illustrator.yourcompany.co.ke". Leave "" to run fully
 *          stand-alone: no OTP login, no usage reporting, feedback by email app.
 * company  The numeric company id shown in the admin console.
 *
 * publicKey  Signing key for access leases (strict mode). Create it once with:
 *          node scripts/make-signing-key.js --write
 *          and set the matching private key on the backend. While null, leases are not enforced.
 *
 * checkIntervalDays / maxOfflineDays are only fallbacks. Once the backend is
 * connected, the values you set in the admin console (Updates tab) take over.
 */
window.APP_CONFIG = {
  api: "",
  company: "",
  publicKey: null,        // set by scripts/make-signing-key.js --write
  checkIntervalDays: 7,   // how often an installed app looks for a new version
  maxOfflineDays: 30      // an app that hasn't managed a successful check in this long must reconnect (0 = never)
};
