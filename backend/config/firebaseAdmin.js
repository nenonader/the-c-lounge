// Made By Eng Nayer Nader
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function parseServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    return JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const configured = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const filename = path.basename(configured);

    // Render mounts a Secret File at the service root (which is `rootDir`, i.e.
    // backend/) and at /etc/secrets/<filename>. A path copied from a local
    // checkout — './config/serviceAccountKey.json' — therefore resolves to a
    // file that does not exist on Render, and every Firestore write fails at
    // request time with the service otherwise looking healthy. Try the
    // configured path first, then the two locations Render guarantees.
    const candidates = [
      path.resolve(process.cwd(), configured),
      path.resolve(__dirname, '..', configured),
      path.join('/etc/secrets', filename),
      path.resolve(process.cwd(), filename),
    ];

    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      if (candidate !== candidates[0]) {
        console.warn(
          `[firebase] FIREBASE_SERVICE_ACCOUNT_PATH="${configured}" did not resolve; `
          + `using ${candidate} instead. Set the variable to this path to silence this warning.`
        );
      }
      return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    }

    throw new Error(
      `Firebase credential file not found. Tried: ${candidates.join(', ')}. `
      + 'On Render, either set FIREBASE_SERVICE_ACCOUNT_PATH=/etc/secrets/'
      + `${filename} or use FIREBASE_SERVICE_ACCOUNT_BASE64 instead.`
    );
  }
  return null;
}

function initializeFirebase() {
  if (admin.apps.length) return admin.app();
  const serviceAccount = parseServiceAccount();
  const options = {
    credential: serviceAccount
      ? admin.credential.cert(serviceAccount)
      : admin.credential.applicationDefault(),
  };
  if (process.env.FIREBASE_PROJECT_ID) options.projectId = process.env.FIREBASE_PROJECT_ID;
  return admin.initializeApp(options);
}

function getDb() {
  initializeFirebase();
  return admin.firestore();
}

function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

module.exports = { getDb, serverTimestamp, initializeFirebase };
