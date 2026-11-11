// Loaded only on the server; no service-account credentials reach browser code.
export async function firebaseStore() {
  const {FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail, FIREBASE_PRIVATE_KEY: rawKey, FIREBASE_STORAGE_BUCKET: storageBucket} = process.env;
  if (!projectId || !clientEmail || !rawKey || !storageBucket) throw Error('Firebase is not configured');
  const [{getApps, initializeApp, cert}, {getFirestore}, {getStorage}] = await Promise.all([
    import('firebase-admin/app'), import('firebase-admin/firestore'), import('firebase-admin/storage')
  ]);
  const app = getApps().find(app => app.name === 'faxbridge') || initializeApp({
    credential: cert({projectId, clientEmail, privateKey: rawKey.replace(/\\n/g, '\n')}), storageBucket
  }, 'faxbridge');
  const db = getFirestore(app), bucket = getStorage(app).bucket();
  const records = db.collection('inbound_faxes');
  return {
    async exists(id) {return (await records.doc(id).get()).exists;},
    async savePDF(id, pdf) {
      await bucket.file(`faxes/${id}.pdf`).save(pdf, {resumable: false, metadata: {contentType: 'application/pdf', cacheControl: 'private, no-store'}});
    },
    async saveRecord(record) {
      try {await records.doc(record.fax_id).create(record);} catch (error) {if (error.code !== 6) throw error;}
    },
    async list() {
      const snapshot = await records.orderBy('received_at', 'desc').limit(100).get();
      return snapshot.docs.map(doc => {const {object_path, ...record} = doc.data(); return record;});
    },
    async download(id) {const [pdf] = await bucket.file(`faxes/${id}.pdf`).download(); return pdf;}
  };
}
