// ticket-server.js
// Node.js print server for Epson TM-T88V ? writes directly to USB device
// Uses ESC/POS commands for feed + cut
// Requires: npm install express cors

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const os      = require('os');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve the frontends
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/lists', (req, res) => {
  res.sendFile(path.join(__dirname, 'list-printer.html'));
});
app.get('/watch', (req, res) => {
  res.sendFile(path.join(__dirname, 'watch-printer.html'));
});

// -- Config --------------------------------------------------
const PORT           = 3000;
const PRINTER_DEVICE = '/dev/usb/lp0';
// ------------------------------------------------------------

const WIDTH = 42;

// ESC/POS command bytes
const ESC_INIT    = Buffer.from([0x1b, 0x40]);
const NV_LOGO_OFF = Buffer.from([0x1c, 0x28, 0x4c, 0x06, 0x00, 0x30, 0x45, 0x01, 0x00, 0x00, 0x00, 0x00]);
const FEED_CUT    = Buffer.from([0x1d, 0x56, 0x41, 0x05]);
const SIZE_2X     = Buffer.from([0x1d, 0x21, 0x11]);
const SIZE_NORMAL = Buffer.from([0x1d, 0x21, 0x00]);
const INVERT_ON   = Buffer.from([0x1d, 0x42, 0x01]);
const INVERT_OFF  = Buffer.from([0x1d, 0x42, 0x00]);
const BOLD_ON     = Buffer.from([0x1b, 0x45, 0x01]);
const BOLD_OFF    = Buffer.from([0x1b, 0x45, 0x00]);

function center(str) {
  const p = Math.max(0, Math.floor((WIDTH - str.length) / 2));
  return ' '.repeat(p) + str;
}

function sanitise(text) {
  return text
    .replace(/[���']/g, "'")
    .replace(/[���"]/g, '"')
    .replace(/[��]/g, '-')
    .replace(/�/g, '...');
}

function wrapText(text, maxW) {
  const lines = [];
  for (const para of text.split(/\r?\n/)) {
    if (para === '') { lines.push(''); continue; }
    const words = para.split(' ');
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxW) {
        if (current) lines.push(current);
        current = word.slice(0, maxW);
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

// -- Ticket builder -------------------------------------------
function buildTicketBuffer(title, notes, priority, dueDate) {
  const line = '-'.repeat(WIDTH);
  const dbl  = '='.repeat(WIDTH);
  const now  = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  const printedDt = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  const titleLines = wrapText(title.toUpperCase(), WIDTH);
  const noteLines  = notes ? wrapText(notes, WIDTH) : [];

  let priorityBuffer;
  if (priority === 'HIGH') {
    priorityBuffer = Buffer.concat([
      Buffer.from('PRIORITY: ', 'utf8'),
      BOLD_ON,
      INVERT_ON,
      Buffer.from('HIGH', 'utf8'),
      INVERT_OFF,
      BOLD_OFF,
      Buffer.from('\n', 'utf8'),
    ]);
  } else if (priority === 'MED') {
    priorityBuffer = Buffer.concat([
      Buffer.from('PRIORITY: ', 'utf8'),
      BOLD_ON,
      Buffer.from('MED', 'utf8'),
      BOLD_OFF,
      Buffer.from('\n', 'utf8'),
    ]);
  } else {
    priorityBuffer = Buffer.from(`PRIORITY: ${priority}\n`, 'utf8');
  }

  const topParts = [line, `DUE:      ${dueDate}`];
  // With notes: [line] title [line] notes [blank] [dbl]
  // No notes:   [line] [blank] title [blank] [dbl]
  const topOfBottom = noteLines.length ? [line] : [line, ''];
  const afterTitle  = noteLines.length
    ? [line, ...noteLines, '']
    : [''];
  afterTitle.push(dbl);
  afterTitle.push(center(`printed ${printedDt}`));
  afterTitle.push(''); afterTitle.push(''); afterTitle.push(''); afterTitle.push('');

  const halfWidth = Math.floor(WIDTH / 2);
  const innerText = 'TASK TICKET';
  const totalPad = Math.max(0, halfWidth - innerText.length);
  const leftPad  = Math.floor(totalPad / 2);
  const headerFull = ' '.repeat(leftPad) + innerText;
  const headerBuffer    = Buffer.from(headerFull + '\n', 'utf8');
  const topBuffer       = Buffer.from(topParts.join('\n') + '\n', 'utf8');
  const topOfBotBuffer  = Buffer.from(topOfBottom.join('\n') + '\n', 'utf8');
  const titleBuffer     = Buffer.concat([BOLD_ON, Buffer.from(titleLines.join('\n') + '\n', 'utf8'), BOLD_OFF]);
  const afterBuffer     = Buffer.from(afterTitle.join('\n'), 'utf8');

  return Buffer.concat([ESC_INIT, NV_LOGO_OFF, BOLD_ON, SIZE_2X, headerBuffer, BOLD_OFF, SIZE_NORMAL, topBuffer, priorityBuffer, topOfBotBuffer, titleBuffer, afterBuffer, FEED_CUT]);
}

// -- List builder ---------------------------------------------
function buildListBuffer(listName, items) {
  const line = '-'.repeat(WIDTH);
  const dbl  = '='.repeat(WIDTH);
  const now  = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  const printedDt = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  const nameLines = wrapText(listName.toUpperCase(), WIDTH);

  const textParts = [line, ...nameLines, line];
  for (const item of items) {
    const wrapped = wrapText(item, WIDTH - 4); // leave room for checkbox
    textParts.push('[ ] ' + wrapped[0]);
    for (let i = 1; i < wrapped.length; i++) {
      textParts.push('    ' + wrapped[i]); // indent continuation lines
    }
  }
  textParts.push(dbl);
  textParts.push(center(`printed ${printedDt}`));
  textParts.push(''); textParts.push(''); textParts.push(''); textParts.push('');

  const halfWidth = Math.floor(WIDTH / 2);
  const innerText = 'LIST';
  const totalPad = Math.max(0, halfWidth - innerText.length);
  const leftPad  = Math.floor(totalPad / 2);
  const headerFull = ' '.repeat(leftPad) + innerText;
  const headerBuffer = Buffer.from(headerFull + '\n', 'utf8');
  const textBuffer = Buffer.from(textParts.join('\n'), 'utf8');

  return Buffer.concat([ESC_INIT, NV_LOGO_OFF, BOLD_ON, SIZE_2X, headerBuffer, BOLD_OFF, SIZE_NORMAL, textBuffer, FEED_CUT]);
}

// -- Status ---------------------------------------------------
app.get('/status', (req, res) => {
  fs.access(PRINTER_DEVICE, fs.constants.W_OK, (err) => {
    if (err) return res.json({ ok: false, printer: PRINTER_DEVICE, detail: err.message });
    res.json({ ok: true, printer: PRINTER_DEVICE });
  });
});

// -- Print ticket ---------------------------------------------
app.post('/print', (req, res) => {
  const { title, notes = '', priority = 'MED', dueDate = '' } = req.body;
  if (!title || typeof title !== 'string' || title.trim().length === 0)
    return res.status(400).json({ ok: false, error: 'title is required' });

  const prio = ['HIGH', 'MED', 'LOW'].includes(priority) ? priority : 'MED';
  const buf  = buildTicketBuffer(sanitise(title.trim()), sanitise(notes.trim()), prio, dueDate);

  fs.writeFile(PRINTER_DEVICE, buf, (err) => {
    if (err) { console.error('[print error]', err.message); return res.status(500).json({ ok: false, error: err.message }); }
    console.log(`[ticket] ${prio} - ${title}`);
    res.json({ ok: true });
  });
});

// -- Watch builder --------------------------------------------
function buildWatchBuffer(title) {
  const dbl  = '='.repeat(WIDTH);
  const now  = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  const printedDt = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  // Wrap and centre each title line within half-width (double-size)
  const halfWidth  = Math.floor(WIDTH / 2);
  const titleLines = wrapText(title, halfWidth);

  const preBuffer  = Buffer.from(dbl + '\n\n', 'utf8');
  const postBuffer = Buffer.from('\n' + dbl + '\n\n\n\n', 'utf8');

  // Build centred title lines as double-size bold
  const titleBuffers = titleLines.map(line => {
    const pad = Math.max(0, Math.floor((halfWidth - line.length) / 2));
    return Buffer.from(' '.repeat(pad) + line + '\n', 'utf8');
  });

  return Buffer.concat([
    ESC_INIT, NV_LOGO_OFF,
    preBuffer,
    BOLD_ON, SIZE_2X,
    ...titleBuffers,
    BOLD_OFF, SIZE_NORMAL,
    postBuffer,
    FEED_CUT
  ]);
}

// -- Print list -----------------------------------------------
app.post('/print-list', (req, res) => {
  const { listName, items } = req.body;
  if (!listName || typeof listName !== 'string' || listName.trim().length === 0)
    return res.status(400).json({ ok: false, error: 'listName is required' });
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ ok: false, error: 'items must be a non-empty array' });

  const buf = buildListBuffer(sanitise(listName.trim()), items.map(i => sanitise(String(i).trim())).filter(Boolean));

  fs.writeFile(PRINTER_DEVICE, buf, (err) => {
    if (err) { console.error('[list error]', err.message); return res.status(500).json({ ok: false, error: err.message }); }
    console.log(`[list] "${listName}" - ${items.length} items`);
    res.json({ ok: true });
  });
});

// -- Print watch ----------------------------------------------
app.post('/print-watch', (req, res) => {
  const { title } = req.body;
  if (!title || typeof title !== 'string' || title.trim().length === 0)
    return res.status(400).json({ ok: false, error: 'title is required' });

  const buf = buildWatchBuffer(sanitise(title.trim()));
  fs.writeFile(PRINTER_DEVICE, buf, (err) => {
    if (err) { console.error('[watch error]', err.message); return res.status(500).json({ ok: false, error: err.message }); }
    console.log(`[watch] "${title}"`);
    res.json({ ok: true });
  });
});

app.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`\n  Task Ticket print server`);
  console.log(`  Device: ${PRINTER_DEVICE}`);
  console.log(`  Port:   ${PORT}`);
  ips.forEach(ip => console.log(`  LAN:    http://${ip}:${PORT}`));
  console.log();
});