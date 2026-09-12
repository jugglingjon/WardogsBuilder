/**
 * Saving, loading, sharing and exporting.
 *
 * Autosave holds the current session. Named saves are explicit. Export and
 * share links are how a build leaves the browser, and both work with no server
 * behind them.
 */
import { Storage } from '../model/storage.js';
import { toDocument, toJSON, fromDocument } from '../model/serialize.js';
import { shareUrl, readShare, stripShare } from '../model/share.js';
import { sharedDialog, toast } from './dialog.js';

const AUTOSAVE_DELAY = 700;

const formatWhen = (time) => new Date(time).toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
});

export class FileActions {
  #timer = null;

  constructor({ model, history, view, storage = new Storage() }) {
    this.model = model;
    this.history = history;
    this.view = view;
    this.storage = storage;
    this.dialog = sharedDialog();

    model.on('change', () => this.#scheduleAutosave());
  }

  #scheduleAutosave() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      if (!this.storage.autosave(toDocument(this.model)) && this.storage.available) {
        toast('Could not autosave: browser storage is full', { level: 'warn' });
      }
    }, AUTOSAVE_DELAY);
  }

  /**
   * Restore on boot. A build in the link wins over the autosave, but the
   * autosave is put somewhere safe first rather than being overwritten.
   */
  async restore() {
    const shared = await readShare();
    if (shared) {
      const existing = this.storage.restore();
      if (existing?.pieces?.length) {
        this.storage.save(`Recovered ${formatWhen(Date.now())}`, existing);
      }
      fromDocument(this.model, shared);
      this.history.clear();

      // Consume the link. Leaving the build in the address bar means every
      // reload reopens it and quietly discards whatever you did since, so
      // starting over becomes impossible without editing the URL by hand.
      globalThis.history?.replaceState(null, '', stripShare(globalThis.location));

      toast('Opened a shared build');
      return 'shared';
    }

    const autosaved = this.storage.restore();
    if (!autosaved) return 'empty';
    try {
      fromDocument(this.model, autosaved);
      this.history.clear();
      return 'restored';
    } catch (error) {
      toast(`Could not restore the last session: ${error.message}`, { level: 'warn' });
      return 'empty';
    }
  }

  // --- actions ---------------------------------------------------------------

  newBuild() {
    // Clearing the build also clears the undo stack, so there is no taking it
    // back. Anything already placed is worth one question.
    if (this.model.count > 0 &&
        !globalThis.confirm?.(
          `Clear ${this.model.count} placed ${this.model.count === 1 ? 'element' : 'elements'} ` +
          'and start over? This cannot be undone.'
        )) {
      return;
    }
    this.model.reset({ name: 'Untitled construction', pieces: [] });
    this.history.clear();
    this.dialog.close();
    toast('Started a new build');
  }

  saveAs(name) {
    const trimmed = name.trim();
    if (!trimmed) {
      toast('Give the build a name first', { level: 'warn' });
      return;
    }
    // Rename before serialising, or the saved document keeps the old name and
    // reopening it silently reverts what the user just typed.
    this.model.setName(trimmed);
    const entry = this.storage.save(trimmed, toDocument(this.model));
    if (!entry) {
      toast('Could not save: browser storage is full', { level: 'warn' });
      return;
    }
    this.dialog.close();
    toast(`Saved as "${entry.name}"`);
  }

  openSaved(id) {
    const doc = this.storage.load(id);
    if (!doc) return toast('That save could not be read', { level: 'warn' });
    try {
      fromDocument(this.model, doc);
      this.history.clear();
      this.dialog.close();
      toast(`Opened "${doc.name || 'build'}"`);
    } catch (error) {
      toast(error.message, { level: 'warn' });
    }
  }

  exportFile() {
    const name = (this.model.name || 'build').replace(/[^\w\- ]+/g, '').trim() || 'build';
    this.#download(
      new Blob([toJSON(this.model)], { type: 'application/json' }),
      `${name}.wardogs.json`
    );
    this.dialog.close();
    toast('Exported');
  }

  async importFile(file) {
    try {
      fromDocument(this.model, JSON.parse(await file.text()));
      this.history.clear();
      this.dialog.close();
      toast(`Imported "${this.model.name || file.name}"`);
    } catch (error) {
      toast(`Could not import that file: ${error.message}`, { level: 'warn' });
    }
  }

  async share() {
    const url = await shareUrl(toDocument(this.model));
    this.dialog.open({
      title: 'Share this build',
      body: `
        <p class="dialog__note">The whole build is packed into the link. No account, no server.</p>
        <div class="dialog__row">
          <input class="field field--wide" id="share-url" readonly value="${url}" />
          <button class="btn" id="share-copy" type="button">Copy</button>
        </div>
        <p class="dialog__note mono">${url.length} characters${
          url.length > 8000 ? ' — long enough that some chat apps may cut it. Export a file instead.' : ''
        }</p>
      `,
      onMount: (element) => {
        const field = element.querySelector('#share-url');
        field.select();
        element.querySelector('#share-copy').addEventListener('click', async () => {
          field.select();
          try {
            await navigator.clipboard.writeText(url);
            toast('Link copied');
          } catch {
            toast('Press Ctrl+C to copy the selected link');
          }
        });
      }
    });
  }

  screenshot() {
    const url = this.view.snapshot();
    if (!url) return toast('Could not capture the view', { level: 'warn' });
    const name = (this.model.name || 'build').replace(/[^\w\- ]+/g, '').trim() || 'build';
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.png`;
    link.click();
    toast('Image saved');
  }

  // --- the builds dialog -----------------------------------------------------

  openBuildsDialog() {
    const saves = this.storage.list();
    const rows = saves.length
      ? saves.map((entry) => `
          <li class="save">
            <span class="save__name">${entry.name}</span>
            <span class="save__meta mono">${entry.pieces} pcs · ${formatWhen(entry.savedAt)}</span>
            <button class="btn" type="button" data-open="${entry.id}">Open</button>
            <button class="btn btn--quiet" type="button" data-delete="${entry.id}" aria-label="Delete ${entry.name}">Delete</button>
          </li>`).join('')
      : '<li class="dialog__note">No saved builds yet.</li>';

    this.dialog.open({
      title: 'Builds',
      body: `
        <div class="dialog__row">
          <input class="field field--wide" id="save-name" placeholder="Name this build"
                 value="${this.model.name ?? ''}" />
          <button class="btn" type="button" id="save-go">Save</button>
        </div>
        <ul class="saves">${rows}</ul>
        <div class="dialog__row dialog__row--end">
          <button class="btn" type="button" id="import-go">Import file</button>
          <button class="btn" type="button" id="export-go">Export file</button>
          <button class="btn" type="button" id="new-go">New build</button>
        </div>
        <input type="file" id="import-input" accept=".json,application/json" hidden />
      `,
      onMount: (element) => {
        const nameField = element.querySelector('#save-name');
        const commit = () => this.saveAs(nameField.value);
        element.querySelector('#save-go').addEventListener('click', commit);
        nameField.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') { event.preventDefault(); commit(); }
        });

        for (const button of element.querySelectorAll('[data-open]')) {
          button.addEventListener('click', () => this.openSaved(button.dataset.open));
        }
        for (const button of element.querySelectorAll('[data-delete]')) {
          button.addEventListener('click', () => {
            this.storage.remove(button.dataset.delete);
            this.openBuildsDialog();
          });
        }

        const fileInput = element.querySelector('#import-input');
        element.querySelector('#import-go').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
          if (fileInput.files[0]) this.importFile(fileInput.files[0]);
        });
        element.querySelector('#export-go').addEventListener('click', () => this.exportFile());
        element.querySelector('#new-go').addEventListener('click', () => this.newBuild());
      }
    });
  }

  #download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
