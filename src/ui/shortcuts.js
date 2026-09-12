/**
 * Global keys, and the overlay that lists them.
 *
 * Tool keys live with the editor that owns them. What is here is everything
 * that belongs to the app rather than to one tool.
 */
import { sharedDialog } from './dialog.js';

const GROUPS = [
  {
    name: 'Tools',
    keys: [
      ['B', 'Place. Click, or drag to paint a run'],
      ['V', 'Select. Click, shift-click to add, drag a piece to move it'],
      ['V then drag', 'Rubber-band from empty ground to select several'],
      ['E', 'Erase. Click or drag'],
      ['R', 'Rotate the pending piece or the selection'],
      ['Delete', 'Delete the selection'],
      ['Esc', 'Clear the selection']
    ]
  },
  {
    name: 'Camera',
    keys: [
      ['Right-drag', 'Orbit'],
      ['Middle-drag', 'Pan'],
      ['Scroll', 'Zoom at the cursor']
    ]
  },
  {
    name: 'Build',
    keys: [
      ['Ctrl+Z', 'Undo'],
      ['Ctrl+Shift+Z', 'Redo'],
      ['Ctrl+C / Ctrl+V', 'Copy and paste'],
      ['Ctrl+D', 'Duplicate the selection'],
      ['?', 'This list']
    ]
  }
];

export function bindShortcuts({ history }) {
  const dialog = sharedDialog();

  const showHelp = () => dialog.open({
    title: 'Keyboard and mouse',
    body: GROUPS.map((group) => `
      <section>
        <div class="label">${group.name}</div>
        <dl class="keys">
          ${group.keys.map(([key, what]) => `<dt><kbd>${key}</kbd></dt><dd>${what}</dd>`).join('')}
        </dl>
      </section>
    `).join('')
  });

  window.addEventListener('keydown', (event) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;

    if (event.metaKey || event.ctrlKey) {
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) history.redo(); else history.undo();
      } else if (key === 'y') {
        event.preventDefault();
        history.redo();
      }
      return;
    }

    if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
      event.preventDefault();
      showHelp();
    }
  });

  return { showHelp };
}
