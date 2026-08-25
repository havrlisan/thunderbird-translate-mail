const q = new URLSearchParams(location.search);
for (const id of ['title', 'text', 'details']) document.getElementById(id).textContent = q.get(id) ?? '';
const close = document.getElementById('close');
close.textContent = messenger.i18n.getMessage('close');
close.addEventListener('click', () => window.close());
close.focus();

(async () => {
  // Follow Thunderbird's theme, not the OS colour scheme (the default theme returns no colours; keep the page defaults then).
  // ponytail: the System-auto theme reports no colours and extension pages get a light scheme, so the popup stays light there; only an explicit Dark theme is followed.
  const { colors } = await messenger.theme.getCurrent();
  if (colors?.popup) Object.assign(document.body.style, { background: colors.popup, color: colors.popup_text ?? '' });
  // Fit the window to the content; the height passed to windows.create is not reliable.
  const { id } = await messenger.windows.getCurrent();
  const chrome = window.outerHeight - window.innerHeight;
  await messenger.windows.update(id, { height: document.body.offsetHeight + chrome });
})().catch(console.error);
