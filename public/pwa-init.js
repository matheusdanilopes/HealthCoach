try {
  window.__pwaInstallEvent = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__pwaInstallEvent = e;
    window.dispatchEvent(new Event('pwa-install-ready'));
  });
} catch (e) {}
