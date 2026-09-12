/** Keyboard shortcuts that belong to the whole app rather than one tool. */
export function bindShortcuts({ model, history }) {
  window.addEventListener('keydown', (event) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
    if (typing) return;

    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) history.redo(); else history.undo();
      return;
    }
    if (meta && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      history.redo();
      return;
    }
    if (event.key === 'PageUp') {
      event.preventDefault();
      model.setSlice(model.slice + 1);
    }
    if (event.key === 'PageDown') {
      event.preventDefault();
      model.setSlice(model.slice - 1);
    }
  });
}
