self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '家族カレンダー';
  const options = {
    body:  data.body  || '予定が更新されました',
    icon:  '/icon.png',
    badge: '/icon.png',
    data:  { url: '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
});
