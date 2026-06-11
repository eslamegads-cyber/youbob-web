
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

firebase.initializeApp({
    apiKey: 'AIzaSyBRojdPALUTePvNPSyT6E1bqn2D8FM23vU',
    appId: '1:296619136381:web:955c6f674d268b220a6814',
    messagingSenderId: '296619136381',
    projectId: 'youbob-3e9ee',
    authDomain: 'youbob-3e9ee.firebaseapp.com',
    storageBucket: 'youbob-3e9ee.firebasestorage.app',
    measurementId: 'G-BP22TVB0MZ',
});

const messaging = firebase.messaging();
const badgeStoreName = 'youbob_badge_store';
const badgeKey = 'unread_notifications';

function openBadgeDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('youbob_badges', 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(badgeStoreName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readBadgeCount() {
  const db = await openBadgeDb();

  return new Promise((resolve) => {
    const transaction = db.transaction(badgeStoreName, 'readonly');
    const request = transaction.objectStore(badgeStoreName).get(badgeKey);

    request.onsuccess = () => resolve(Number(request.result || 0));
    request.onerror = () => resolve(0);
    transaction.oncomplete = () => db.close();
  });
}

async function writeBadgeCount(count) {
  const safeCount = Math.max(Number(count || 0), 0);
  const db = await openBadgeDb();

  await new Promise((resolve) => {
    const transaction = db.transaction(badgeStoreName, 'readwrite');
    transaction.objectStore(badgeStoreName).put(safeCount, badgeKey);
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
  });

  db.close();

  if ('setAppBadge' in navigator) {
    await navigator.setAppBadge(safeCount);
  }
}

async function nextBadgeCount(data) {
  const explicitBadge = Number(data.badge || data.badge_count || data.unread_count);

  if (Number.isFinite(explicitBadge) && explicitBadge >= 0) {
    await writeBadgeCount(explicitBadge);
    return explicitBadge;
  }

  const count = await readBadgeCount() + 1;
  await writeBadgeCount(count);
  return count;
}

function normalizeMessageType(value) {
  const raw = (value || 'text').toString().trim().toLowerCase();

  if (raw === 'audio' || raw === 'voice_note' || raw === 'voice_message') {
    return 'voice';
  }

  if (raw === 'photo' || raw === 'picture') {
    return 'image';
  }

  if (raw === 'document' || raw === 'attachment') {
    return 'file';
  }

  return raw || 'text';
}

function bodyForType(type, fallback) {
  const text = (fallback || '').toString().trim();

  if (type === 'voice') return text || 'رسالة صوتية جديدة';
  if (type === 'image') return text && !looksLikeUrl(text) ? text : 'صورة جديدة';
  if (type === 'video') return text && !looksLikeUrl(text) ? text : 'فيديو جديد';
  if (type === 'file') return text && !looksLikeUrl(text) ? text : 'ملف جديد';

  return text || 'لديك رسالة جديدة';
}

function looksLikeUrl(value) {
  return value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('/') ||
      value.startsWith('file:');
}

messaging.onBackgroundMessage(async (payload) => {
  const data = payload.data || {};
  await nextBadgeCount(data);
  const type = data.type || 'notification';
  const messageType = normalizeMessageType(
    data.message_type || data.content_type || data.event_type || data.media_type
  );

  const title = payload.notification?.title ||
      data.sender_name ||
      data.caller_name ||
      (type === 'call' ? 'مكالمة واردة' : 'YOUBOB');

  const body = payload.notification?.body ||
      (type === 'call'
        ? `من ${data.caller_name || data.sender_name || 'متصل'}`
        : bodyForType(messageType, data.content));

  return self.registration.showNotification(title, {
    body,
    icon: '/icons/Icon-192.png',
    badge: '/icons/Icon-192.png',
    tag: type === 'call'
      ? `call-${data.sender_id || ''}-${data.receiver_id || ''}`
      : `message-${data.sender_id || ''}-${Date.now()}`,
    renotify: true,
    requireInteraction: type === 'call',
    silent: false,
    data: {
      type,
      message_type: messageType,
      sender_id: data.sender_id || '',
      receiver_id: data.receiver_id || '',
      click_action: data.click_action || '/',
    },
  });
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_APP_BADGE') {
    event.waitUntil(writeBadgeCount(0));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = event.notification.data?.click_action || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            return;
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(target);
        }
      })
  );
});
