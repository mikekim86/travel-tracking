import type { AppState } from './types.ts';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderDatePreference(datePreference?: {
  kind: string;
  dates?: string[];
  months?: Array<{ year: number; month: number }>;
  year?: number;
  month?: number;
  startDate?: string;
  endDate?: string;
}): string {
  if (!datePreference) {
    return 'No date window';
  }

  if (datePreference.kind === 'exact') {
    return `Exact dates: ${(datePreference.dates ?? []).join(', ')}`;
  }

  if (datePreference.kind === 'months') {
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return `Months: ${(datePreference.months ?? [])
      .map((item) => `${monthNames[item.month - 1]} ${item.year}`)
      .join(', ')}`;
  }

  if (datePreference.kind === 'month' && datePreference.year && datePreference.month) {
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return `Month: ${monthNames[datePreference.month - 1]} ${datePreference.year}`;
  }

  if (datePreference.kind === 'range') {
    return `Date range: ${datePreference.startDate ?? ''} to ${datePreference.endDate ?? ''}`;
  }

  return 'Custom date window';
}

function renderTargetCard(target: {
  id: string;
  type: string;
  name: string;
  status: string;
  providerId: string;
  lastScannedAt?: string;
  lastScanOutcome?: string;
  lastScanError?: string;
  alertedFingerprints?: string[];
  maxPoints?: number;
  hotelName?: string;
  publicSearchUrl?: string;
  airline?: string;
  route?: { origin: string; destination: string };
  cabinClass?: string;
  datePreference?: { kind: string; dates?: string[]; year?: number; month?: number; startDate?: string; endDate?: string };
}): string {
  const detail =
    target.type === 'hotel'
      ? `${target.hotelName ?? ''} · max ${Number(target.maxPoints ?? 0).toLocaleString()} pts`
      : `${target.airline ?? ''} · ${target.route?.origin ?? ''}-${target.route?.destination ?? ''} · ${target.cabinClass ?? ''}`;

  return `
    <article class="card target-card">
      <div class="card-head">
        <div>
          <p class="eyebrow">${escapeHtml(target.type.toUpperCase())}</p>
          <h3>${escapeHtml(target.name)}</h3>
        </div>
        <span class="status-pill ${escapeHtml(target.status)}">${escapeHtml(target.status)}</span>
      </div>
      <p class="muted">${escapeHtml(target.providerId)}</p>
      <p class="detail">${escapeHtml(detail)}</p>
      <p class="muted">${escapeHtml(renderDatePreference(target.datePreference))}</p>
      ${target.publicSearchUrl ? `<p class="muted url">${escapeHtml(target.publicSearchUrl)}</p>` : ''}
      <div class="mini-grid">
        <div><span>Last scan</span><strong>${escapeHtml(target.lastScannedAt ?? 'Never')}</strong></div>
        <div><span>Outcome</span><strong>${escapeHtml(target.lastScanOutcome ?? 'n/a')}</strong></div>
        <div><span>Alerts sent</span><strong>${String(target.alertedFingerprints?.length ?? 0)}</strong></div>
      </div>
      <p class="error ${target.lastScanError ? 'visible' : ''}">${escapeHtml(target.lastScanError ?? '')}</p>
      <button class="secondary" data-action="scan-one" data-target-id="${escapeHtml(target.id)}">Scan now</button>
    </article>
  `;
}

function renderContactCard(contact: {
  id: string;
  name: string;
  phoneNumber: string;
  enabled: boolean;
  updatedAt: string;
}): string {
  return `
    <article class="contact-item">
      <div>
        <strong>${escapeHtml(contact.name)}</strong>
        <p>${escapeHtml(contact.phoneNumber)}</p>
        <span class="muted">${contact.enabled ? 'Enabled' : 'Disabled'} · ${escapeHtml(contact.updatedAt)}</span>
      </div>
      <button class="secondary" data-action="delete-contact" data-contact-id="${escapeHtml(contact.id)}">Delete</button>
    </article>
  `;
}

function renderScanRow(scan: {
  id: string;
  targetId?: string;
  startedAt: string;
  finishedAt?: string;
  outcome: string;
  error?: string;
  matches?: Array<{ title: string; date: string; points: number }>;
}): string {
  const matchText =
    scan.matches && scan.matches.length > 0
      ? scan.matches
          .map((match) => `${match.title} · ${match.date} · ${match.points.toLocaleString()} pts`)
          .join('<br />')
      : 'No matches';

  return `
    <tr>
      <td>${escapeHtml(scan.startedAt)}</td>
      <td>${escapeHtml(scan.targetId ?? 'all targets')}</td>
      <td><span class="status-pill ${escapeHtml(scan.outcome)}">${escapeHtml(scan.outcome)}</span></td>
      <td>${matchText}</td>
      <td class="scan-error">${escapeHtml(scan.error ?? '')}</td>
    </tr>
  `;
}

function renderState(
  state: AppState,
  status: { targets: number; activeTargets: number; scans: number; nextPollHours: number },
  recentLogs: string[],
): string {
  const active = state.targets.filter((target) => target.status === 'active').length;
  const matched = state.targets.filter((target) => target.lastScanOutcome === 'matched').length;
  const paused = state.targets.filter((target) => target.status === 'paused').length;
  const enabledContacts = state.contacts.filter((contact) => contact.enabled).length;

  return `
    <div class="dashboard-shell">
      <header class="hero card">
        <div>
          <p class="eyebrow">Travel Redemption Watcher</p>
          <h1>Award tracking dashboard</h1>
          <p class="lede">Monitor hotels and airlines, review the latest scans, and trigger a manual check when something looks close.</p>
        </div>
        <div class="hero-stats">
          <div><span>Targets</span><strong>${state.targets.length}</strong></div>
          <div><span>Active</span><strong>${active}</strong></div>
          <div><span>Matched</span><strong>${matched}</strong></div>
          <div><span>Paused</span><strong>${paused}</strong></div>
          <div><span>Contacts</span><strong>${enabledContacts}</strong></div>
        </div>
      </header>

      <section class="grid">
        <section class="card">
          <div class="section-head">
            <div>
              <p class="eyebrow">Status</p>
              <h2>Watcher health</h2>
            </div>
            <button id="refresh-dashboard" class="secondary">Refresh</button>
          </div>
          <div class="status-grid">
            <div><span>Saved targets</span><strong>${status.targets}</strong></div>
            <div><span>Active targets</span><strong>${status.activeTargets}</strong></div>
            <div><span>Total scans</span><strong>${status.scans}</strong></div>
            <div><span>Polling</span><strong>Every ${status.nextPollHours} hours</strong></div>
          </div>
          <p class="hint">The scheduler checks active targets on the configured cadence. New matches trigger WhatsApp alerts once.</p>
        </section>

        <section class="card">
          <div class="section-head">
            <div>
              <p class="eyebrow">Create target</p>
              <h2>Watchlist entry</h2>
            </div>
          </div>
          <form id="target-form" class="form">
            <div class="row">
              <label>
                Type
                <select name="type" required>
                  <option value="hotel">Hotel</option>
                  <option value="airline">Airline</option>
                </select>
              </label>
              <label>
                Provider ID
                <input name="providerId" placeholder="hilton-public" required />
              </label>
            </div>
            <label>
              Display name
              <input name="name" placeholder="Hilton Waikiki or SFO to HND business" required />
            </label>
            <label>
              Date mode
              <select name="dateMode" required>
                <option value="exact">Exact dates</option>
                <option value="month" selected>Month / year</option>
                <option value="range">Date range</option>
              </select>
            </label>
            <div class="row" data-kind="hotel">
              <label>
                Hotel name
                <input name="hotelName" placeholder="Hilton Waikiki" />
              </label>
              <label>
                Max points
                <input name="maxPoints" type="number" min="0" step="1" placeholder="50000" />
              </label>
            </div>
            <label data-kind="hotel">
              Public Hilton search URL
              <input
                name="publicSearchUrl"
                placeholder="https://www.hilton.com/en/book/reservation/rooms/?ctyhocn=MLEONWA"
              />
            </label>
            <div class="row hidden" data-kind="airline">
              <label>
                Airline
                <input name="airline" placeholder="United" />
              </label>
              <label>
                Cabin class
                <input name="cabinClass" placeholder="business" />
              </label>
            </div>
            <div class="row hidden" data-kind="airline">
              <label>
                Origin
                <input name="origin" placeholder="SFO" />
              </label>
              <label>
                Destination
                <input name="destination" placeholder="HND" />
              </label>
            </div>
            <div class="row" data-mode="exact">
              <label>
                Exact dates
                <input name="exactDates" placeholder="2026-11-01, 2026-11-03" />
              </label>
            </div>
            <div class="row hidden" data-mode="month">
              <label>
                Year
                <input name="monthYear" type="number" min="2000" max="2100" />
              </label>
              <label>
                Month
                <input name="monthMonth" type="number" min="1" max="12" />
              </label>
            </div>
            <div class="row hidden" data-mode="range">
              <label>
                Start date
                <input name="startDate" type="date" />
              </label>
              <label>
                End date
                <input name="endDate" type="date" />
              </label>
            </div>
            <button type="submit">Save target</button>
            <p id="form-message" class="hint"></p>
          </form>
        </section>
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <p class="eyebrow">WhatsApp</p>
            <h2>Alert contacts</h2>
          </div>
        </div>
        <div class="contacts-layout">
          <form id="contact-form" class="form contact-form">
            <label>
              Contact name
              <input name="name" placeholder="Mike" required />
            </label>
            <label>
              WhatsApp number
              <input name="phoneNumber" placeholder="+1 555 555 5555" required />
            </label>
            <label class="inline-check">
              <input name="enabled" type="checkbox" checked />
              Enabled for alerts
            </label>
            <button type="submit">Add contact</button>
            <p id="contact-message" class="hint"></p>
          </form>
          <div class="contacts-list">
            <div class="section-head compact">
              <div>
                <p class="eyebrow">Recipients</p>
                <h3>Saved contacts</h3>
              </div>
              <button id="test-message" class="secondary" type="button">Send test message</button>
            </div>
            ${state.contacts.length ? state.contacts.map(renderContactCard).join('') : '<p class="empty">No WhatsApp contacts yet. Add the numbers that should receive alerts.</p>'}
          </div>
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Watchlist</p>
            <h2>Tracked targets</h2>
          </div>
          <button id="scan-all" class="secondary">Scan all now</button>
        </div>
        <div class="targets-grid">
          ${state.targets.length ? state.targets.map(renderTargetCard).join('') : '<p class="empty">No targets yet. Add one on the right.</p>'}
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <p class="eyebrow">History</p>
            <h2>Latest scans</h2>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Target</th>
                <th>Outcome</th>
                <th>Matches</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              ${state.scans.length ? state.scans.slice().reverse().map(renderScanRow).join('') : '<tr><td colspan="5" class="empty">No scans yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Debug</p>
            <h2>Recent logs</h2>
          </div>
        </div>
        <div class="table-wrap">
          <pre class="log-view">${escapeHtml(recentLogs.length ? recentLogs.join('\n') : 'No logs yet.')}</pre>
        </div>
      </section>
    </div>

    <script>
      const api = {
        status: () => fetch('/status').then((r) => r.json()),
        targets: () => fetch('/targets').then((r) => r.json()),
        contacts: () => fetch('/contacts').then((r) => r.json()),
        scans: () => fetch('/scans').then((r) => r.json()),
        scanAll: () => fetch('/scan', { method: 'POST' }).then((r) => r.json()),
        scanOne: (targetId) => fetch('/scan', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ targetId }) }).then((r) => r.json()),
        createTarget: (body) => fetch('/targets', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) }).then((r) => r.json()),
        createContact: (body) => fetch('/contacts', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) }).then((r) => r.json()),
        deleteContact: (contactId) => fetch('/contacts/' + contactId, { method: 'DELETE' }).then((r) => r.json()),
        sendTestMessage: () => fetch('/test-message', { method: 'POST' }).then((r) => r.json())
      };

      const form = document.getElementById('target-form');
      const message = document.getElementById('form-message');
      const contactForm = document.getElementById('contact-form');
      const contactMessage = document.getElementById('contact-message');
      const testMessageButton = document.getElementById('test-message');
      const refreshButton = document.getElementById('refresh-dashboard');
      const scanAllButton = document.getElementById('scan-all');
      const today = new Date();
      const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);

      function setMessage(text, isError = false) {
        message.textContent = text;
        message.className = isError ? 'hint error' : 'hint';
      }

      function setContactMessage(text, isError = false) {
        contactMessage.textContent = text;
        contactMessage.className = isError ? 'hint error' : 'hint';
      }

      function currentDatePreference(formData) {
        const mode = formData.get('dateMode');
        if (mode === 'month') {
          return {
            kind: 'month',
            year: Number(formData.get('monthYear')),
            month: Number(formData.get('monthMonth'))
          };
        }
        if (mode === 'range') {
          return {
            kind: 'range',
            startDate: String(formData.get('startDate') || ''),
            endDate: String(formData.get('endDate') || '')
          };
        }
        return {
          kind: 'exact',
          dates: String(formData.get('exactDates') || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        };
      }

      function showFields() {
        const type = form.type.value;
        const mode = form.dateMode.value;
        document.querySelectorAll('[data-kind]').forEach((node) => node.classList.toggle('hidden', node.getAttribute('data-kind') !== type));
        document.querySelectorAll('[data-mode]').forEach((node) => node.classList.toggle('hidden', node.getAttribute('data-mode') !== mode));
        if (type === 'hotel' && !form.providerId.value) {
          form.providerId.value = 'hilton-public';
        }
        if (type === 'hotel' && form.dateMode.value === 'exact') {
          form.dateMode.value = 'month';
          document.querySelectorAll('[data-mode]').forEach((node) => node.classList.toggle('hidden', node.getAttribute('data-mode') !== 'month'));
        }
        if (form.dateMode.value === 'month') {
          if (!form.monthYear.value) {
            form.monthYear.value = String(nextMonthDate.getFullYear());
          }
          if (!form.monthMonth.value) {
            form.monthMonth.value = String(nextMonthDate.getMonth() + 1);
          }
        }
      }

      form.type.addEventListener('change', showFields);
      form.dateMode.addEventListener('change', showFields);
      form.addEventListener('reset', () => {
        setTimeout(showFields, 0);
      });
      showFields();

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const type = formData.get('type');
        const common = {
          type,
          providerId: String(formData.get('providerId') || ''),
          name: String(formData.get('name') || ''),
          datePreference: currentDatePreference(formData),
          status: 'active'
        };
        const payload = type === 'hotel'
          ? {
              ...common,
              hotelName: String(formData.get('hotelName') || ''),
              maxPoints: Number(formData.get('maxPoints') || 0),
              publicSearchUrl: String(formData.get('publicSearchUrl') || '')
            }
          : {
              ...common,
              airline: String(formData.get('airline') || ''),
              cabinClass: String(formData.get('cabinClass') || ''),
              route: {
                origin: String(formData.get('origin') || ''),
                destination: String(formData.get('destination') || '')
              }
            };
        try {
          await api.createTarget(payload);
          form.reset();
          showFields();
          setMessage('Target saved.');
          setTimeout(() => window.location.reload(), 250);
        } catch (error) {
          setMessage(String(error), true);
        }
      });

      document.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const action = button.dataset.action;
        const targetId = button.dataset.targetId;
        if (action === 'scan-one' && targetId) {
          button.disabled = true;
          button.textContent = 'Scanning...';
          try {
            await api.scanOne(targetId);
            window.location.reload();
          } catch (error) {
            alert(String(error));
          } finally {
            button.disabled = false;
            button.textContent = 'Scan now';
          }
        }
      });

      refreshButton.addEventListener('click', () => window.location.reload());
      scanAllButton.addEventListener('click', async () => {
        scanAllButton.disabled = true;
        scanAllButton.textContent = 'Scanning...';
        try {
          await api.scanAll();
          window.location.reload();
        } finally {
          scanAllButton.disabled = false;
          scanAllButton.textContent = 'Scan all now';
        }
      });

      contactForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(contactForm);
        const payload = {
          name: String(formData.get('name') || ''),
          phoneNumber: String(formData.get('phoneNumber') || ''),
          enabled: formData.get('enabled') === 'on'
        };
        try {
          await api.createContact(payload);
          contactForm.reset();
          setContactMessage('Contact saved.');
          setTimeout(() => window.location.reload(), 250);
        } catch (error) {
          setContactMessage(String(error), true);
        }
      });

      testMessageButton.addEventListener('click', async () => {
        testMessageButton.disabled = true;
        testMessageButton.textContent = 'Sending...';
        try {
          await api.sendTestMessage();
          alert('Test message sent.');
        } catch (error) {
          alert(String(error));
        } finally {
          testMessageButton.disabled = false;
          testMessageButton.textContent = 'Send test message';
        }
      });

      document.addEventListener('click', async (event) => {
        const contactButton = event.target.closest('button[data-action="delete-contact"]');
        if (contactButton) {
          const contactId = contactButton.dataset.contactId;
          if (!contactId) return;
          contactButton.disabled = true;
          contactButton.textContent = 'Deleting...';
          try {
            await api.deleteContact(contactId);
            window.location.reload();
          } catch (error) {
            alert(String(error));
          }
        }
      });
    </script>
  `;
}

export function renderDashboardPage(
  state: AppState,
  status: { targets: number; activeTargets: number; scans: number; nextPollHours: number },
  recentLogs: string[] = [],
): string {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Travel Redemption Watcher</title>
      <style>
        :root {
          color-scheme: light;
          --bg: #f3efe6;
          --panel: rgba(255, 255, 255, 0.78);
          --panel-strong: #fffaf2;
          --text: #1f2430;
          --muted: #646b78;
          --accent: #d98324;
          --accent-2: #0f766e;
          --border: rgba(31, 36, 48, 0.12);
          --shadow: 0 16px 40px rgba(25, 30, 40, 0.12);
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          min-height: 100vh;
          font-family: Inter, "Segoe UI", system-ui, -apple-system, sans-serif;
          color: var(--text);
          background:
            radial-gradient(circle at top left, rgba(217, 131, 36, 0.22), transparent 36%),
            radial-gradient(circle at top right, rgba(15, 118, 110, 0.18), transparent 28%),
            linear-gradient(180deg, #fffaf0 0%, var(--bg) 42%, #efe5d2 100%);
        }
        .dashboard-shell {
          max-width: 1440px;
          margin: 0 auto;
          padding: 28px;
          display: grid;
          gap: 20px;
        }
        .card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 24px;
          box-shadow: var(--shadow);
          backdrop-filter: blur(14px);
          padding: 22px;
        }
        .hero {
          display: grid;
          grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.8fr);
          gap: 20px;
          align-items: end;
          background: linear-gradient(135deg, rgba(255,255,255,0.88), rgba(255,250,242,0.68));
        }
        h1, h2, h3, p { margin: 0; }
        h1 { font-size: clamp(2rem, 4vw, 3.8rem); line-height: 0.98; margin-top: 8px; }
        h2 { font-size: 1.15rem; }
        h3 { font-size: 1.04rem; }
        .lede { max-width: 70ch; color: var(--muted); margin-top: 12px; line-height: 1.6; }
        .eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--accent);
          font-size: 0.72rem;
          font-weight: 700;
        }
        .hero-stats, .status-grid, .mini-grid, .targets-grid, .grid {
          display: grid;
          gap: 14px;
        }
        .hero-stats {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .hero-stats div, .status-grid div, .mini-grid div {
          padding: 14px;
          border-radius: 18px;
          background: rgba(255,255,255,0.7);
          border: 1px solid var(--border);
        }
        .hero-stats span, .status-grid span, .mini-grid span {
          display: block;
          font-size: 0.76rem;
          color: var(--muted);
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .hero-stats strong, .status-grid strong, .mini-grid strong {
          font-size: 1.1rem;
        }
        .grid {
          grid-template-columns: 1fr 1fr;
          align-items: start;
        }
        .section-head {
          display: flex;
          align-items: start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
        }
        .targets-grid {
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        }
        .target-card {
          display: grid;
          gap: 12px;
        }
        .card-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: start;
        }
        .detail, .muted, .hint {
          color: var(--muted);
        }
        .detail { line-height: 1.5; }
        .hint {
          font-size: 0.92rem;
          line-height: 1.5;
        }
        .hint.error, .error {
          color: #a33a2f;
        }
        .error {
          min-height: 1.2em;
          opacity: 0;
        }
        .error.visible {
          opacity: 1;
        }
        .status-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 0.74rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          border: 1px solid transparent;
          background: rgba(255,255,255,0.72);
        }
        .status-pill.active, .status-pill.matched {
          color: #0f766e;
          border-color: rgba(15, 118, 110, 0.18);
        }
        .status-pill.paused, .status-pill.no_match {
          color: #8a5a00;
          border-color: rgba(217, 131, 36, 0.2);
        }
        .status-pill.error {
          color: #a33a2f;
          border-color: rgba(163, 58, 47, 0.2);
        }
        .form {
          display: grid;
          gap: 12px;
        }
        .contacts-layout {
          display: grid;
          grid-template-columns: minmax(280px, 380px) 1fr;
          gap: 16px;
          align-items: start;
        }
        .contacts-list {
          display: grid;
          gap: 12px;
        }
        .section-head.compact {
          margin-bottom: 4px;
        }
        .contact-item {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 18px;
          background: rgba(255,255,255,0.72);
          border: 1px solid var(--border);
        }
        .contact-item p {
          margin-top: 4px;
          color: var(--muted);
        }
        .inline-check {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .inline-check input {
          width: auto;
        }
        .row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .row.hidden { display: none; }
        label {
          display: grid;
          gap: 6px;
          font-size: 0.9rem;
          color: var(--text);
        }
        input, select, button {
          font: inherit;
        }
        input, select {
          width: 100%;
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.86);
          border-radius: 14px;
          padding: 12px 14px;
          color: var(--text);
          outline: none;
        }
        input:focus, select:focus {
          border-color: rgba(217, 131, 36, 0.7);
          box-shadow: 0 0 0 4px rgba(217, 131, 36, 0.12);
        }
        button {
          border: 0;
          border-radius: 14px;
          padding: 12px 16px;
          background: linear-gradient(135deg, var(--accent), #f0a34e);
          color: white;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
          box-shadow: 0 10px 24px rgba(217, 131, 36, 0.28);
        }
        button:hover { transform: translateY(-1px); }
        button:disabled { opacity: 0.7; cursor: progress; transform: none; }
        button.secondary {
          background: rgba(255,255,255,0.82);
          color: var(--text);
          border: 1px solid var(--border);
          box-shadow: none;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          text-align: left;
          vertical-align: top;
          padding: 14px 10px;
          border-bottom: 1px solid var(--border);
          font-size: 0.95rem;
        }
        th {
          color: var(--muted);
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .table-wrap {
          overflow-x: auto;
        }
        .log-view {
          margin: 0;
          white-space: pre-wrap;
          font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
          max-height: 320px;
          overflow: auto;
          background: #0f172a;
          color: #e2e8f0;
          padding: 16px;
          border-radius: 16px;
        }
        .empty {
          color: var(--muted);
          text-align: center;
          padding: 22px;
        }
        .scan-error {
          color: #a33a2f;
        }
        @media (max-width: 980px) {
          .hero, .grid, .row {
            grid-template-columns: 1fr;
          }
          .contacts-layout {
            grid-template-columns: 1fr;
          }
          .dashboard-shell {
            padding: 16px;
          }
        }
      </style>
    </head>
    <body>
      ${renderState(state, status, recentLogs)}
    </body>
  </html>`;
}
