// Small popup window opened by the background: an error (title, text, details, Close) or a question
// (text, `ok` button, Cancel). Only a click on `ok` reports back; closing the window any other way is "no".
const q = new URLSearchParams(location.search);
for (const id of ['title', 'text', 'details']) {
  const el = document.getElementById(id);
  el.textContent = q.get(id) ?? '';
  el.hidden = !el.textContent;
}
const ok = document.getElementById('ok');
const close = document.getElementById('close');
ok.hidden = !q.get('ok');
ok.textContent = q.get('ok') ?? '';
close.textContent = messenger.i18n.getMessage(ok.hidden ? 'close' : 'cancel');
close.addEventListener('click', () => window.close());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.close(); });
(ok.hidden ? close : ok).focus();

(async () => {
  const { id } = await messenger.windows.getCurrent();
  ok.addEventListener('click', async () => {
    await messenger.runtime.sendMessage({ cmd: 'confirmed', windowId: id });
    window.close();
  });
  // Fit the window to the content; the height passed to windows.create is not reliable.
  const chrome = window.outerHeight - window.innerHeight;
  await messenger.windows.update(id, { height: document.body.offsetHeight + chrome });
})().catch(console.error);
