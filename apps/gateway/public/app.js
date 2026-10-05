// Fast while pairing so a new QR or a scan shows up quickly, slow once connected.
const POLL_FAST_MS = 1000;
const POLL_SLOW_MS = 5000;
// WhatsApp rotates the pairing QR roughly this often; refined from observed changes.
const QR_REFRESH_DEFAULT_MS = 20000;
const SECRET_STORAGE_KEY = 'whappr-secret';

const PILLS = {
  locked: ['Locked', ''],
  unreachable: ['Unreachable', 'bad'],
  awaiting_scan: ['Waiting for scan', 'warn'],
  starting: ['Starting', 'warn'],
  linking: ['Linking', 'warn'],
  disconnected: ['Reconnecting', 'warn'],
  ready: ['Connected', 'good'],
  failed: ['Failed', 'bad'],
};
const FAVICON_DOT = { '': '#8696a0', warn: '#e9a23b', good: '#25d366', bad: '#f15c6d' };

const $ = (id) => document.getElementById(id);
const views = {
  login: $('view-login'),
  qr: $('view-qr'),
  progress: $('view-progress'),
  ready: $('view-ready'),
  problem: $('view-problem'),
};
const statusPill = $('status-pill');
const favicon = $('favicon');
const lockButton = $('lock-button');
const secretInput = $('secret-input');
const revealButton = $('reveal-button');
const loginError = $('login-error');
const qrImage = $('qr-image');
const freshnessFill = $('freshness-fill');
const progressTitle = $('progress-title');
const progressText = $('progress-text');
const webhookStatus = $('webhook-status');
const versionLabel = $('version');
const accountBox = $('account');
const accountInitials = $('account-initials');
const accountGlyph = $('account-glyph');
const accountName = $('account-name');
const accountPhone = $('account-phone');
const logoutButton = $('logout-button');
const logoutConfirm = $('logout-confirm');
const logoutConfirmButton = $('logout-confirm-button');
const logoutError = $('logout-error');
const problemTitle = $('problem-title');
const problemText = $('problem-text');

let currentView = null;
let currentPill = null;
let lastStatus = null;
let linking = false;
let qrChangedAt = 0;
let pollTimer = null;
let polling = false;

function getSecret() {
  try {
    return sessionStorage.getItem(SECRET_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setSecret(secret) {
  try {
    if (secret) sessionStorage.setItem(SECRET_STORAGE_KEY, secret);
    else sessionStorage.removeItem(SECRET_STORAGE_KEY);
  } catch {}
  lockButton.hidden = !secret;
}

function showView(name) {
  if (name === currentView) return;
  const isFirstRender = currentView === null;
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
  if (currentView === 'ready') closeLogoutConfirm();
  currentView = name;
  // Moves screen readers and keyboard users to the new content; skipped on load so the
  // page doesn't open scrolled or focused mid-way.
  if (name === 'login') secretInput.focus();
  else if (!isFirstRender) views[name].querySelector('h1').focus();
}

function setPill(key) {
  if (key === currentPill) return;
  currentPill = key;
  const [label, tone] = PILLS[key];
  statusPill.textContent = label;
  statusPill.dataset.tone = tone;
  document.title = `${label} · Whappr`;
  favicon.href = faviconFor(FAVICON_DOT[tone]);
}

function faviconFor(dotColor) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">' +
    '<mask id="m"><rect width="50" height="50" fill="#fff"/><circle cx="38" cy="38" r="12" fill="#000"/></mask>' +
    '<path mask="url(#m)" fill="#25d366" d="M5 17a13 13 0 0 1 13-13h8a17 17 0 0 1 17 17v1a17 17 0 0 1-17 17h-10l-11 7z"/>' +
    `<circle cx="38" cy="38" r="9" fill="${dotColor}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function restartFreshness(durationMs) {
  freshnessFill.style.animation = 'none';
  void freshnessFill.offsetWidth;
  freshnessFill.style.animation = '';
  freshnessFill.style.animationDuration = `${durationMs}ms`;
}

function showLocked(message = '') {
  setSecret(null);
  loginError.textContent = message;
  lastStatus = null;
  setPill('locked');
  showView('login');
}

function showProgress(pill, title, text) {
  progressTitle.textContent = title;
  progressText.textContent = text;
  setPill(pill);
  showView('progress');
}

function showProblem(pill, title, text) {
  problemTitle.textContent = title;
  problemText.textContent = text;
  setPill(pill);
  showView('problem');
}

// Unauthenticated and best-effort: older gateways answer `{ ok: true }` only, and a failure
// here must not affect the session view.
async function refreshHealth() {
  try {
    const response = await fetch('/health');
    if (!response.ok) return;
    const health = await response.json();
    if (health.version) versionLabel.textContent = ` v${health.version}`;
    if (health.webhook !== undefined) renderWebhook(health.webhook);
  } catch {}
}

function renderWebhook(delivery) {
  if (!delivery) {
    webhookStatus.textContent = 'Incoming messages will be forwarded to your webhook.';
    delete webhookStatus.dataset.tone;
    return;
  }
  const ago = timeAgo(delivery.at);
  if (delivery.ok) {
    webhookStatus.textContent = `Webhook delivered ${ago}`;
    webhookStatus.dataset.tone = 'good';
  } else {
    const reason = delivery.status ? `HTTP ${delivery.status}` : 'no response';
    webhookStatus.textContent = `Webhook failing (${reason}) ${ago}. Check WEBHOOK_URL and the gateway logs.`;
    webhookStatus.dataset.tone = 'bad';
  }
}

// Clamped at zero: the browser's clock may run slightly behind the gateway's.
function timeAgo(iso) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  return `${Math.floor(seconds / 3600)} h ago`;
}

// Older gateways don't send `account`; the card stays hidden then.
function renderAccount(account) {
  accountBox.hidden = !account;
  if (!account) return;
  const phone = `+${account.phone}`;
  const initials = (account.name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => [...word][0] ?? '')
    .join('')
    .toUpperCase();
  accountName.textContent = account.name || phone;
  accountPhone.textContent = account.name ? phone : '';
  accountPhone.hidden = !account.name;
  accountInitials.textContent = initials;
  accountGlyph.style.display = initials ? 'none' : '';
}

function render(state) {
  // `starting` right after `awaiting_scan` means the code was scanned and WhatsApp Web is loading.
  if (state.status === 'starting' && lastStatus === 'awaiting_scan') linking = true;
  else if (state.status !== 'starting') linking = false;
  lastStatus = state.status;

  switch (state.status) {
    case 'awaiting_scan':
      if (state.qr && qrImage.getAttribute('src') !== state.qr) {
        const now = Date.now();
        const observed = qrChangedAt ? now - qrChangedAt : 0;
        const refreshMs = observed > 5000 && observed < 120000 ? observed : QR_REFRESH_DEFAULT_MS;
        qrChangedAt = now;
        qrImage.src = state.qr;
        restartFreshness(refreshMs);
      }
      setPill('awaiting_scan');
      showView('qr');
      return;
    case 'ready':
      renderAccount(state.account);
      setPill('ready');
      showView('ready');
      return;
    case 'failed':
      showProblem(
        'failed',
        state.error ?? 'The gateway failed to start',
        'Check the gateway logs for details. Restarting the gateway tries again.',
      );
      return;
    case 'disconnected':
      showProgress('disconnected', 'Reconnecting…', 'The WhatsApp session dropped. The gateway restarts it automatically.');
      return;
    default:
      if (linking) {
        showProgress('linking', 'Linking with your phone…', 'Keep WhatsApp open on your phone until this finishes.');
      } else {
        showProgress('starting', 'Starting…', 'Loading WhatsApp Web. The first start can take a minute.');
      }
  }
}

async function api(path, init = {}) {
  const response = await fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${getSecret()}` },
  });
  if (response.status === 401 || response.status === 400) {
    showLocked('That secret is not valid. Check SECRET_KEY in the gateway environment.');
    return null;
  }
  return response;
}

function schedulePoll() {
  clearTimeout(pollTimer);
  if (document.hidden || !getSecret()) return;
  pollTimer = setTimeout(poll, lastStatus === 'ready' ? POLL_SLOW_MS : POLL_FAST_MS);
}

async function poll() {
  if (polling) return;
  if (!getSecret()) {
    showLocked(loginError.textContent);
    return;
  }
  polling = true;
  try {
    const response = await api('/api/session');
    if (response?.ok) render(await response.json());
    else if (response) throw new Error(`HTTP ${response.status}`);
    if (lastStatus === 'ready') void refreshHealth();
  } catch (error) {
    console.error('Failed to fetch session state', error);
    lastStatus = null;
    showProblem('unreachable', "Can't reach the gateway", 'Check that it is running. This page keeps retrying.');
  } finally {
    polling = false;
    schedulePoll();
  }
}

function closeLogoutConfirm() {
  logoutConfirm.hidden = true;
  logoutButton.hidden = false;
  logoutError.textContent = '';
}

views.login.addEventListener('submit', (event) => {
  event.preventDefault();
  const secret = secretInput.value.trim();
  if (!secret) {
    loginError.textContent = 'Enter the secret first.';
    return;
  }
  setSecret(secret);
  secretInput.value = '';
  secretInput.type = 'password';
  revealButton.textContent = 'Show';
  revealButton.setAttribute('aria-pressed', 'false');
  loginError.textContent = '';
  poll();
});

revealButton.addEventListener('click', () => {
  const reveal = secretInput.type === 'password';
  secretInput.type = reveal ? 'text' : 'password';
  revealButton.textContent = reveal ? 'Hide' : 'Show';
  revealButton.setAttribute('aria-pressed', String(reveal));
  secretInput.focus();
});

lockButton.addEventListener('click', () => {
  clearTimeout(pollTimer);
  showLocked();
});

logoutButton.addEventListener('click', () => {
  logoutButton.hidden = true;
  logoutConfirm.hidden = false;
  $('logout-cancel').focus();
});

$('logout-cancel').addEventListener('click', () => {
  closeLogoutConfirm();
  logoutButton.focus();
});

// The request resolves only after the client restarts, so the view usually switches away first.
logoutConfirmButton.addEventListener('click', async () => {
  logoutError.textContent = '';
  logoutConfirmButton.disabled = true;
  logoutConfirmButton.textContent = 'Logging out…';
  try {
    const response = await api('/api/session/logout', { method: 'POST' });
    if (response && !response.ok) logoutError.textContent = 'Log out failed. Try again.';
  } catch {
    logoutError.textContent = 'Log out failed. Try again.';
  }
  logoutConfirmButton.disabled = false;
  logoutConfirmButton.textContent = 'Log out';
  poll();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(pollTimer);
  else poll();
});

setSecret(getSecret());
poll();
void refreshHealth();
