// ВАЖНО: меняйте версию при деплое, чтобы PWA гарантированно подтягивал обновления
const CACHE_NAME = 'hockey-lineup-v7';
const BASE_PATH = '/hockey_team_lineup/';
const urlsToCache = [
  BASE_PATH,
  BASE_PATH + 'index.html',
  BASE_PATH + 'styles.css',
  BASE_PATH + 'app.js',
  BASE_PATH + 'manifest.json',
  BASE_PATH + 'icon-192.png',
  BASE_PATH + 'icon-512.png',
  BASE_PATH + 'logo-1000.png'
];

// Установка service worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Установка...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Кэширование файлов');
        // Используем addAll, но обрабатываем ошибки для каждого файла отдельно
        return Promise.allSettled(
          urlsToCache.map(url => 
            cache.add(url).catch(err => {
              console.warn(`[Service Worker] Не удалось кэшировать ${url}:`, err);
            })
          )
        );
      })
      .then(() => {
        console.log('[Service Worker] Установка завершена');
        // Принудительная активация нового Service Worker
        return self.skipWaiting();
      })
  );
});

// Активация service worker
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Активация...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Удаление старого кэша:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('[Service Worker] Активация завершена');
      // Уведомляем все клиенты о новой версии
      return self.clients.claim();
    })
  );
});

// Перехват запросов
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const requestUrl = request.url;

  // Для внешних CDN ресурсов (html2canvas) - пробуем кэш, затем сеть
  if (url.origin !== location.origin) {
    // Проверяем, это ли html2canvas
    if (requestUrl.includes('html2canvas')) {
      event.respondWith(
        caches.match(request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              console.log('[Service Worker] html2canvas из кэша');
              return cachedResponse;
            }
            // Загружаем из сети и кэшируем
            return fetch(request)
              .then((response) => {
                if (response && response.status === 200) {
                  const responseToCache = response.clone();
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, responseToCache);
                    console.log('[Service Worker] html2canvas кэширован');
                  });
                }
                return response;
              })
              .catch(() => {
                // Если не удалось загрузить, возвращаем ошибку
                console.warn('[Service Worker] html2canvas недоступен, экспорт JPEG может не работать');
                return new Response('', { status: 404 });
              });
          })
      );
      return;
    }
    
    // Для других внешних ресурсов - пробуем сеть, игнорируем ошибки
    event.respondWith(
      fetch(request).catch(() => new Response('', { status: 404 }))
    );
    return;
  }

  // Файлы приложения: всегда сначала сеть, чтобы подхватывать обновления без переустановки PWA
  const pathname = url.pathname || '';
  const isAppShell = pathname.endsWith('index.html') || pathname.includes('app.js') || pathname.includes('styles.css');

  if (isAppShell) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
            console.log('[Service Worker] Обновлён из сети и закэширован:', request.url);
          }).catch(() => {});
          return response;
        })
        .catch(() => {
          console.log('[Service Worker] Офлайн, из кэша:', request.url);
          return caches.match(request).then((cached) => cached || new Response('', { status: 503 }));
        })
    );
    return;
  }

  // Остальные локальные ресурсы: кэш сначала, затем сеть
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request)
          .then((response) => {
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache)).catch(() => {});
            return response;
          })
          .catch((error) => {
            if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
              return caches.match(BASE_PATH + 'index.html') || caches.match('./index.html') || caches.match('/index.html');
            }
            throw error;
          });
      })
  );
});