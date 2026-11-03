/* Retired reservation helper: remove only this worker's notification subscription. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const subscription = await self.registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
    } catch { /* Continue retirement if the push subscription is already unavailable. */ }
    try {
      const notifications = await self.registration.getNotifications();
      notifications.forEach(notification => notification.close());
    } catch { /* Notification cleanup must not keep this retired worker registered. */ }
    await self.registration.unregister();
  })());
});
