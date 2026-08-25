// Follow Thunderbird's theme colours when the active theme exposes them. Extension pages always get a light
// prefers-color-scheme, and the System-auto theme reports no colours, so this only helps with an explicit theme.
messenger.theme.getCurrent().then(({ colors }) => {
  if (!colors) return;
  const vars = {
    '--bg': colors.popup, '--fg': colors.popup_text,
    '--field-bg': colors.toolbar_field, '--field-fg': colors.toolbar_field_text, '--border': colors.toolbar_field_border,
  };
  for (const [k, v] of Object.entries(vars)) if (v) document.documentElement.style.setProperty(k, v);
}).catch(console.error);
