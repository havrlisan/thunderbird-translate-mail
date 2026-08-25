const q = new URLSearchParams(location.search);
for (const id of ['title', 'text', 'details']) document.getElementById(id).textContent = q.get(id) ?? '';
const close = document.getElementById('close');
close.textContent = messenger.i18n.getMessage('close');
close.addEventListener('click', () => window.close());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.close(); });
close.focus();

(async () => {
  // Fit the window to the content; the height passed to windows.create is not reliable.
  const { id } = await messenger.windows.getCurrent();
  const chrome = window.outerHeight - window.innerHeight;
  await messenger.windows.update(id, { height: document.body.offsetHeight + chrome });
})().catch(console.error);
