const CACHE_NAME = "dsa-messenger-cache-v9";
const urlsToCache = [
  "/manifest.json",
  "/static/manifest.json",
  "/static/tailwindcss-colors.css",
  "/static/login-carousel.css",
  "/static/pwa-installer.css",
  "/static/pwa-installer.js",
  "/static/icons/dsa-logo-192x192.png",
  "/static/icons/dsa-logo-512x512.png",
  "/static/images/default-profile.png",
  "/static/images/dsa-logo.png"
];

// Install: pre-cache core static assets resiliently
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await Promise.allSettled(
        urlsToCache.map(url => cache.add(url).catch(err => console.warn("[SW] Failed to cache:", url, err)))
      );
    })
  );
});

// Activate: clean up old caches and claim clients immediately
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => (key !== CACHE_NAME ? caches.delete(key) : Promise.resolve())))
    ).then(() => self.clients.claim())
  );
});

// Fetch: Network-first strategy while bypassing Socket.IO and non-HTTP/GET requests
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") {
    return;
  }

  const url = new URL(req.url);
  if (!url.protocol.startsWith("http")) {
    return;
  }

  // Never intercept Socket.IO polling/websocket transport or dynamic session checks
  if (url.pathname.startsWith("/socket.io/") || url.pathname === "/check_session") {
    return;
  }

  event.respondWith(
    fetch(req)
      .then(networkResponse => {
        // Update cache for static assets when online
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (url.pathname.startsWith("/static/") || url.pathname === "/login")
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, responseClone)).catch(() => {});
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(req);
        if (cachedResponse) {
          return cachedResponse;
        }
        return new Response("Network error: You appear to be offline.", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      })
  );
});

// Push Notifications
self.addEventListener("push", function (event) {
  let data = { title: "DSA Messenger", body: "You have a new message", url: "/chat" };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "DSA Messenger", {
      body: data.body || "You have a new message",
      icon: "/static/icons/dsa-logo-192x192.png",
      badge: "/static/icons/dsa-logo-192x192.png",
      tag: data.chat_id ? `chat-${data.chat_id}` : "dsa-message",
      renotify: true,
      data: {
        url: data.url || "/chat",
        chat_id: data.chat_id,
        chat_type: data.chat_type
      }
    })
  );
});

// Focus or open app when a notification is clicked
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/chat";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
