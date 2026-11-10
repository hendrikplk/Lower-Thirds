const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const JSZip = require('jszip');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PROJECT_FORMAT = 'lowerthird-studio-project';
const PROJECT_VERSION = 1;
const MAX_PROJECT_BYTES = 100 * 1024 * 1024;

const starter = {
  defaultShape: 'boxed',
  defaultAppearance: { shape: 'boxed', accent: '#21a6d7', background: '#142536', textColor: '#ffffff', subtitleColor: '#d6e1e9', logo: '' },
  items: [
    { id: 'welcome', name: 'Begrüßung', title: 'Willkommen zur Veranstaltung', subtitle: 'Schön, dass Sie da sind', accent: '#21a6d7', background: '#142536', textColor: '#ffffff', subtitleColor: '#d6e1e9', shape: 'bar', logo: '', enabled: true },
    { id: 'speaker', name: 'Referent', title: 'Max Mustermann', subtitle: 'Geschäftsführer · Beispiel GmbH', accent: '#f0b429', background: '#142536', textColor: '#ffffff', subtitleColor: '#d6e1e9', shape: 'bar', logo: '', enabled: true }
  ],
  preparedId: 'welcome',
  activeId: null,
  visible: false
};

fs.mkdirSync(DATA_DIR, { recursive: true });
let state = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : starter;
if (!state.defaultShape) state.defaultShape = 'boxed';
if (!state.defaultAppearance) state.defaultAppearance = { shape: state.defaultShape, accent: '#21a6d7', background: '#142536', textColor: '#ffffff', subtitleColor: '#d6e1e9', logo: '' };
state.defaultAppearance = { shape: state.defaultAppearance.shape || state.defaultShape, accent: state.defaultAppearance.accent || '#21a6d7', background: state.defaultAppearance.background || '#142536', textColor: state.defaultAppearance.textColor || '#ffffff', subtitleColor: state.defaultAppearance.subtitleColor || '#d6e1e9', logo: typeof state.defaultAppearance.logo === 'string' ? state.defaultAppearance.logo : '' };

function persist() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}
function snapshot() {
  return { ...state, items: state.items };
}
function broadcast() {
  const msg = JSON.stringify({ type: 'state', state: snapshot() });
  for (const client of wss.clients) if (client.readyState === 1) client.send(msg);
}
function changed() { persist(); broadcast(); }
function findItem(id) { return state.items.find(x => x.id === id); }
function publicState(req, res) { res.json(snapshot()); }

app.get('/api/state', publicState);

// Exportiert das komplette Projekt als einzelnes ZIP. Logos liegen als Data-URLs
// direkt in project.json und sind dadurch vollständig im Archiv enthalten.
app.get('/api/project/export', async (_req, res) => {
  try {
    const project = {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      exportedAt: new Date().toISOString(),
      state: {
        defaultShape: state.defaultShape || 'boxed',
        defaultAppearance: state.defaultAppearance || {},
        items: state.items || []
      }
    };
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(project, null, 2));
    zip.file('README.txt', [
      'LowerThird Studio – Projektarchiv',
      '',
      'Dieses Archiv enthält alle Bauchbinden, Layouts, Farben und Logos.',
      'Import: In LowerThird Studio „Projekt importieren“ wählen und diese ZIP-Datei öffnen.',
      'Der Import ersetzt das aktuell geladene Projekt. Vorher wird ein Export empfohlen.',
      '',
      `Exportiert: ${project.exportedAt}`
    ].join('\n'));
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="lowerthird-studio-${stamp}.zip"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    console.error('Projekt-Export fehlgeschlagen:', error);
    res.status(500).json({ error: 'Projekt konnte nicht exportiert werden.' });
  }
});

// ZIP-Upload getrennt als Raw-Body behandeln, damit Binärdaten unverändert bleiben.
app.post('/api/project/import', express.raw({ type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'], limit: '100mb' }), async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length < 4) return res.status(400).json({ error: 'Keine gültige ZIP-Datei erhalten.' });
    const zip = await JSZip.loadAsync(req.body, { checkCRC32: true });
    const projectFile = zip.file('project.json');
    if (!projectFile) return res.status(400).json({ error: 'In der ZIP-Datei fehlt project.json.' });
    const raw = await projectFile.async('nodebuffer');
    if (raw.length > MAX_PROJECT_BYTES) return res.status(413).json({ error: 'Das Projektarchiv ist zu groß.' });
    const project = JSON.parse(raw.toString('utf8'));
    if (project.format !== PROJECT_FORMAT || !project.state || !Array.isArray(project.state.items)) {
      return res.status(400).json({ error: 'Diese Datei ist kein gültiges LowerThird-Studio-Projekt.' });
    }
    if (project.version !== PROJECT_VERSION) return res.status(400).json({ error: `Nicht unterstützte Projektversion: ${project.version}` });
    if (project.state.items.length > 500) return res.status(400).json({ error: 'Das Projekt enthält zu viele Bauchbinden (maximal 500).' });

    const validShapes = ['bar', 'split', 'minimal', 'boxed', 'stacked', 'headline', 'badge'];
    const validColor = value => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
    const cleanItems = project.state.items.map((item, index) => {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || typeof item.name !== 'string') {
        throw new Error(`Bauchbinde ${index + 1} ist unvollständig.`);
      }
      const shape = validShapes.includes(item.shape) ? item.shape : 'boxed';
      const logo = typeof item.logo === 'string' ? item.logo : '';
      if (logo.length > 11 * 1024 * 1024) throw new Error(`Das Logo in „${item.name}“ ist zu groß.`);
      return {
        id: item.id.slice(0, 120), name: item.name.slice(0, 80),
        title: String(item.title || '').slice(0, 160), subtitle: String(item.subtitle || '').slice(0, 200),
        shape,
        accent: validColor(item.accent) ? item.accent : '#21a6d7',
        background: validColor(item.background) ? item.background : '#142536',
        textColor: validColor(item.textColor) ? item.textColor : '#ffffff',
        subtitleColor: validColor(item.subtitleColor) ? item.subtitleColor : '#d6e1e9',
        logo, enabled: item.enabled !== false
      };
    });
    const ids = new Set();
    for (const item of cleanItems) {
      if (ids.has(item.id)) throw new Error(`Doppelte Bauchbinden-ID: ${item.id}`);
      ids.add(item.id);
    }
    const oldDefault = project.state.defaultAppearance || {};
    const defaultShape = validShapes.includes(oldDefault.shape || project.state.defaultShape) ? (oldDefault.shape || project.state.defaultShape) : 'boxed';
    const defaultLogo = typeof oldDefault.logo === 'string' ? oldDefault.logo : '';
    if (defaultLogo.length > 11 * 1024 * 1024) throw new Error('Das Standardlogo ist zu groß.');
    state = {
      defaultShape,
      defaultAppearance: {
        shape: defaultShape,
        accent: validColor(oldDefault.accent) ? oldDefault.accent : '#21a6d7',
        background: validColor(oldDefault.background) ? oldDefault.background : '#142536',
        textColor: validColor(oldDefault.textColor) ? oldDefault.textColor : '#ffffff',
        subtitleColor: validColor(oldDefault.subtitleColor) ? oldDefault.subtitleColor : '#d6e1e9',
        logo: defaultLogo
      },
      items: cleanItems,
      preparedId: cleanItems[0]?.id || null,
      activeId: null,
      visible: false
    };
    changed();
    res.json({ ok: true, importedItems: state.items.length, message: 'Projekt erfolgreich importiert.' });
  } catch (error) {
    console.error('Projekt-Import fehlgeschlagen:', error);
    res.status(400).json({ error: error.message || 'Projekt konnte nicht importiert werden.' });
  }
});
app.post('/api/settings/default-style', (req, res) => {
  const allowed = ['bar','split','minimal','boxed','stacked','headline','badge'];
  const a = req.body || {};
  const shape = String(a.shape || '');
  if (!allowed.includes(shape)) return res.status(400).json({ error: 'Ungültiger Bauchbinden-Stil' });
  for (const key of ['accent','background','textColor','subtitleColor']) {
    if (typeof a[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(a[key])) return res.status(400).json({ error: 'Ungültige Farbeinstellung: ' + key });
  }
  const logo = typeof a.logo === 'string' ? a.logo : '';
  if (logo.length > 11 * 1024 * 1024) return res.status(413).json({ error: 'Standardlogo ist zu groß.' });
  state.defaultShape = shape;
  state.defaultAppearance = { shape, accent: a.accent, background: a.background, textColor: a.textColor, subtitleColor: a.subtitleColor, logo };
  changed();
  res.json({ defaultShape: state.defaultShape, defaultAppearance: state.defaultAppearance });
});
app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'LowerThird Studio' }));

app.post('/api/items', (req, res) => {
  const item = req.body || {};
  const id = String(item.id || `lt-${Date.now()}`);
  if (findItem(id)) return res.status(409).json({ error: 'ID exists' });
  const clean = {
    id, name: String(item.name || 'Neue Bauchbinde').slice(0, 80),
    title: String(item.title || '').slice(0, 160),
    subtitle: String(item.subtitle || '').slice(0, 200),
    accent: item.accent || state.defaultAppearance.accent || '#21a6d7', background: item.background || state.defaultAppearance.background || '#142536',
    textColor: item.textColor || state.defaultAppearance.textColor || '#ffffff', subtitleColor: item.subtitleColor || state.defaultAppearance.subtitleColor || '#d6e1e9', shape: item.shape || state.defaultAppearance.shape || state.defaultShape || 'boxed',
    logo: typeof item.logo === 'string' ? item.logo : (state.defaultAppearance.logo || ''), enabled: item.enabled !== false
  };
  state.items.push(clean); state.preparedId = id; changed(); res.status(201).json(clean);
});
app.put('/api/items/:id', (req, res) => {
  const item = findItem(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  for (const key of ['name','title','subtitle','accent','background','textColor','subtitleColor','shape','logo','enabled']) {
    if (req.body[key] !== undefined) item[key] = req.body[key];
  }
  if (typeof item.logo === 'string' && item.logo.length > 11 * 1024 * 1024) return res.status(413).json({ error: 'Logo ist zu groß. Bitte eine Datei unter 8 MB verwenden.' });
  changed(); res.json(item);
});
app.delete('/api/items/:id', (req, res) => {
  if (!findItem(req.params.id)) return res.status(404).json({ error: 'Not found' });
  state.items = state.items.filter(x => x.id !== req.params.id);
  if (state.activeId === req.params.id) { state.activeId = null; state.visible = false; }
  if (state.preparedId === req.params.id) state.preparedId = state.items[0]?.id || null;
  changed(); res.json(snapshot());
});

app.post('/api/prepare/:id', (req, res) => {
  if (!findItem(req.params.id)) return res.status(404).json({ error: 'Not found' });
  state.preparedId = req.params.id; changed(); res.json(snapshot());
});
app.post('/api/show/:id', (req, res) => {
  if (!findItem(req.params.id)) return res.status(404).json({ error: 'Not found' });
  state.activeId = req.params.id; state.preparedId = req.params.id; state.visible = true;
  changed(); res.json(snapshot());
});
app.post('/api/take', (_req, res) => {
  if (!findItem(state.preparedId)) return res.status(409).json({ error: 'No valid item prepared' });
  state.activeId = state.preparedId; state.visible = true; changed(); res.json(snapshot());
});
app.post('/api/hide', (_req, res) => {
  state.visible = false; changed(); res.json(snapshot());
});
app.post('/api/next', (req, res) => {
  if (!state.items.length) return res.status(409).json({ error: 'No items' });
  const i = state.items.findIndex(x => x.id === state.preparedId);
  state.preparedId = state.items[(i + 1 + state.items.length) % state.items.length].id;
  changed(); res.json(snapshot());
});
app.post('/api/previous', (req, res) => {
  if (!state.items.length) return res.status(409).json({ error: 'No items' });
  const i = state.items.findIndex(x => x.id === state.preparedId);
  state.preparedId = state.items[(i - 1 + state.items.length) % state.items.length].id;
  changed(); res.json(snapshot());
});

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'state', state: snapshot() }));
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`LowerThird Studio lokal: http://localhost:${PORT}`);
  console.log(`Netzwerkzugriff: http://<IP-DES-PC>:${PORT}`);
  console.log(`OBS-Ausgabe: http://localhost:${PORT}/output.html`);
  console.log(`Companion API: http://localhost:${PORT}/api/state`);
});