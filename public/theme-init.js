try {
  var t = localStorage.getItem('theme');
  var p = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  if ((t || p) === 'dark') document.documentElement.classList.add('dark');
} catch (e) {}
