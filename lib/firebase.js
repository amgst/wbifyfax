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
  const outbound = db.collection('outbound_faxes');
  return {
    async reserveOutbound(job) {
      try {await outbound.doc(job.id).create(job); return true;} catch (error) {if (error.code === 6) return false; throw error;}
    },
    async getOutbound(id) {return (await outbound.doc(id).get()).data();},
    async listOutbound() {return (await outbound.orderBy('createdAt', 'desc').limit(100).get()).docs.map(doc => doc.data());},
    async uploadOutbound(id, pdf) {
      const file = bucket.file(`outbound/${id}.pdf`);
      await file.save(pdf, {resumable: false, metadata: {contentType: 'application/pdf', cacheControl: 'private, no-store'}});
      const [url] = await file.getSignedUrl({action: 'read', expires: Date.now() + 60 * 60 * 1000});
      return url;
    },
    async deleteOutboundPDF(id) {await bucket.file(`outbound/${id}.pdf`).delete({ignoreNotFound: true});},
    async updateOutbound(id, patch) {
      await db.runTransaction(async transaction => {
        const ref = outbound.doc(id), snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw Error('Unknown outbound fax');
        const old = snapshot.data();
        if (old.fax_id && patch.fax_id && old.fax_id !== patch.fax_id) throw Error('Fax ID mismatch');
        const ranks = {submitting: 0, unknown: 0, queued: 1, processing: 2, sending: 3, delivered: 4, failed: 4};
        if (['delivered', 'failed'].includes(old.status) || ranks[patch.status] < ranks[old.status]) {
          if (patch.fax_id && !old.fax_id) transaction.update(ref, {fax_id: patch.fax_id});
          return;
        }
        transaction.update(ref, {...patch, updatedAt: new Date().toISOString()});
      });
    },
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
