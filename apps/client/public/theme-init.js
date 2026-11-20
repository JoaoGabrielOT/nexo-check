// Aplica o tema escolhido antes do React, para não piscar claro (espelho em localStorage).
try {
  var t = localStorage.getItem('nexo-theme');
  if (t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
