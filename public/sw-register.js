if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js', { updateViaCache: 'none' })
    .then(function (reg) {
      window.__swStatus = 'ok';
      window.dispatchEvent(new Event('sw-registered'));
    })
    .catch(function (err) {
      window.__swStatus = 'error:' + err;
    });
}
