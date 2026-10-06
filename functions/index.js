const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const crypto = require("crypto");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

function hash(value){
  return crypto.createHash("sha256").update(value).digest("hex");
}

exports.registerAdminNotificationToken = onCall(async (request) => {
  if(!request.auth) throw new HttpsError("unauthenticated", "Sign in is required.");
  const token = String((request.data || {}).token || "").trim();
  if(!token || token.length < 20 || token.length > 5000){
    throw new HttpsError("invalid-argument", "Invalid notification token.");
  }
  await db.collection("notificationTokens").doc(hash(token)).set({
    token: token,
    role: "admin",
    active: true,
    uid: request.auth.uid,
    updatedAt: new Date().toISOString()
  }, {merge:true});
  return {ok:true};
});

exports.notifyAdminOnSupplierMatta = onDocumentUpdated("machineTeam/{date}", async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  const beforeIds = new Set();
  const bs = before.sections || {};
  Object.keys(bs).forEach(k => {
    const entries = Array.isArray(bs[k] && bs[k].entries) ? bs[k].entries : [];
    entries.forEach(e => {
      if(e && e.source === "supplier" && e.id) beforeIds.add(String(e.id));
    });
  });

  const newEntries = [];
  const as = after.sections || {};
  Object.keys(as).forEach(k => {
    const entries = Array.isArray(as[k] && as[k].entries) ? as[k].entries : [];
    entries.forEach(e => {
      if(!e || e.source !== "supplier" || !e.id) return;
      if(!beforeIds.has(String(e.id))) newEntries.push({section:k, entry:e});
    });
  });
  if(!newEntries.length) return null;

  const tokenSnap = await db.collection("notificationTokens")
    .where("role","==","admin").where("active","==",true).get();
  const tokens = [];
  tokenSnap.forEach(doc => {
    const d = doc.data() || {};
    if(d.token) tokens.push({ref:doc.ref, token:d.token});
  });
  if(!tokens.length) return null;

  for(const item of newEntries){
    const entry = item.entry;
    const title = "🔔 New Matta Added";
    const body = "Supplier: " + String(entry.name || "Unknown") +
      " | Place: " + String(item.section) +
      " | " + String(Number(entry.amount) || 0) + " Mattai";

    for(let i=0; i<tokens.length; i+=500){
      const batch = tokens.slice(i,i+500);
      const response = await messaging.sendEachForMulticast({
        tokens: batch.map(x => x.token),
        notification: {title:title, body:body},
        data: {
          entryId: String(entry.id),
          date: String(event.params.date),
          section: String(item.section)
        },
        webpush: {
          fcmOptions: {link: "https://smartvaseem7-jpg.github.io/daily-expenses/"},
          notification: {
            title:title,
            body:body,
            icon:"/logo.png",
            badge:"/logo.png",
            tag:"supplier-matta-" + String(entry.id)
          }
        }
      });

      const removals = [];
      response.responses.forEach((result,index) => {
        if(!result.success) {
          const code = result.error && result.error.code;
          if(code === "messaging/registration-token-not-registered" ||
             code === "messaging/invalid-registration-token") {
            removals.push(batch[index].ref.delete());
          }
        }
      });
      if(removals.length) await Promise.all(removals);
    }
  }
  return null;
});
