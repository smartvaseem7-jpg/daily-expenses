importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA4Kh806eyIy3yjuRmmF6HSKM93xwtQ00A",
  authDomain: "wm-point-e9196.firebaseapp.com",
  projectId: "wm-point-e9196",
  storageBucket: "wm-point-e9196.firebasestorage.app",
  messagingSenderId: "708620946182",
  appId: "1:708620946182:web:620dabf9c46418d92dec87"
});

const fcmMessaging = firebase.messaging();

const CACHE_NAME = "sham-expenses-v2";
const FILES_TO_CACHE = ["./", "./index.html", "./logo.png", "./manifest.json"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first: always try to get the latest file, fall back to cache only if offline
self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    clients.matchAll({type:"window", includeUncontrolled:true}).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          try { client.navigate(targetUrl); } catch (_) {}
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
