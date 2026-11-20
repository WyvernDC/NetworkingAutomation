const demoData = {
  generatedAt: new Date().toISOString(),
  device: { name: 'R1 · Core Router', host: 'EVE-NG node · IOS', platform: 'Cisco IOS' },
  metrics: { uptime: '14d 06h', latencyMs: 12 },
  interfaces: [
    { name: 'GigabitEthernet0/0', ip: '192.168.10.1', status: 'up', protocol: 'up', rxMbps: 2.4, txMbps: 1.8 },
    { name: 'GigabitEthernet0/1', ip: '10.10.0.1', status: 'up', protocol: 'up', rxMbps: 1.2, txMbps: 0.9 },
    { name: 'Loopback0', ip: '10.0.0.1', status: 'up', protocol: 'up', rxMbps: 0.1, txMbps: 0.1 },
    { name: 'GigabitEthernet0/2', ip: 'unassigned', status: 'down', protocol: 'down', rxMbps: 0, txMbps: 0 }
  ],
  diagnostics: [
    { title: 'Device reachable', status: 'ok', detail: 'Router responded to diagnostics' },
    { title: 'Interface health', status: 'warning', detail: 'One interface is down; 3 of 4 are operational' },
    { title: 'Routing table', status: 'ok', detail: 'Routes are available' },
    { title: 'Configuration snapshot', status: 'ok', detail: 'Running configuration collected' }
  ],
  latencyHistory: [15, 13, 14, 11, 12, 16, 13, 10, 12, 9, 14, 12],
  commandOutputs: {
    interfaces: 'Interface              IP-Address      OK? Method Status                Protocol\nGigabitEthernet0/0     192.168.10.1    YES manual up                    up\nGigabitEthernet0/1     10.10.0.1       YES manual up                    up\nLoopback0              10.0.0.1        YES manual up                    up\nGigabitEthernet0/2     unassigned      YES unset  administratively down down',
    version: 'Cisco IOS Software, IOSv Software\nTechnical Support: http://www.cisco.com/techsupport\nROM: Bootstrap program is IOSv\nSystem image file is "flash0:/vios-adventerprisek9-m"\n\nRouter uptime is 14 days, 6 hours',
    routes: 'Codes: C - connected, S - static, R - RIP, O - OSPF\n\nC    10.0.0.1/32 is directly connected, Loopback0\nC    10.10.0.0/24 is directly connected, GigabitEthernet0/1\nC    192.168.10.0/24 is directly connected, GigabitEthernet0/0'
  }
};

const requestedCommands = ['show version', 'show ip interface brief', 'show running-config', 'show ip route'];
const state = { data: demoData, activeCommand: 'interfaces', showAllInterfaces: false };
const byId = (id) => document.getElementById(id);
const svgNs = 'http://www.w3.org/2000/svg';

function safeText(value, fallback = '—') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function formatTime(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? 'Just now' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showNotice(message, isError = false) {
  const notice = byId('notice');
  notice.textContent = message;
  notice.classList.toggle('error', isError);
  notice.hidden = false;
}

function clearNotice() {
  byId('notice').hidden = true;
  byId('notice').classList.remove('error');
}

function normalizedStatus(value) {
  return ['ok', 'warning', 'critical'].includes(String(value).toLowerCase()) ? String(value).toLowerCase() : 'warning';
}

function validateDiagnostics(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.interfaces) || !Array.isArray(data.diagnostics) || !data.metrics || typeof data.metrics !== 'object') {
    throw new Error('The API response is missing required fields: metrics, interfaces, or diagnostics.');
  }
  return data;
}

function makeSvgElement(name, attrs = {}) {
  const element = document.createElementNS(svgNs, name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function appendSvgText(svg, x, y, text, className, anchor = 'middle') {
  const node = makeSvgElement('text', { x, y, 'text-anchor': anchor, class: className });
  node.textContent = text;
  svg.append(node);
}

function renderTopology(interfaces) {
  const svg = byId('topology-svg');
  svg.replaceChildren();
  const visible = interfaces.slice(0, 4);
  const centerX = 310;
  const centerY = 132;
  const positions = [
    [112, 67], [508, 67], [112, 197], [508, 197]
  ];

  visible.forEach((item, index) => {
    const [x, y] = positions[index];
    const isUp = String(item.status).toLowerCase() === 'up' && String(item.protocol).toLowerCase() === 'up';
    const line = makeSvgElement('path', { d: `M ${centerX} ${centerY} L ${x} ${y}`, class: `link ${isUp ? 'active' : 'inactive'}` });
    svg.append(line);
    appendSvgText(svg, (centerX + x) / 2, (centerY + y) / 2 - 5, item.name.replace(/^GigabitEthernet/, 'Gi'), 'link-label');

    const node = makeSvgElement('g');
    node.append(makeSvgElement('rect', { x: x - 65, y: y - 22, width: 130, height: 44, rx: 5, class: `node-shape ${isUp ? 'up' : 'down'}` }));
    node.append(makeSvgElement('circle', { cx: x + 53, cy: y - 11, r: 3, class: `port-dot ${isUp ? '' : 'down'}` }));
    appendSvgText(node, x - 4, y - 2, item.name.replace(/^GigabitEthernet/, 'Gi'), 'node-text');
    appendSvgText(node, x - 4, y + 12, safeText(item.ip, 'unassigned'), 'node-state');
    svg.append(node);
  });

  const router = makeSvgElement('g');
  router.append(makeSvgElement('circle', { cx: centerX, cy: centerY, r: 37, class: 'router-halo' }));
  router.append(makeSvgElement('rect', { x: centerX - 25, y: centerY - 24, width: 50, height: 48, rx: 10, class: 'router-shape' }));
  router.append(makeSvgElement('path', { d: `M${centerX - 13} ${centerY - 6}h26m-26 12h26m-20-17-6 5 6 5m14 2 6 5-6 5`, class: 'router-glyph' }));
  const routerLabel = safeText(state.data.device?.name, 'Router').split(' · ')[0];
  appendSvgText(router, centerX, centerY + 43, `${routerLabel} · ROUTER`, 'router-name');
  appendSvgText(router, centerX, centerY + 56, 'EVE-NG NODE', 'router-type');
  svg.append(router);
  byId('device-name').textContent = safeText(state.data.device?.name, 'Router');
  byId('device-host').textContent = safeText(state.data.device?.host, 'EVE-NG node');
}

function renderLatencyChart(history) {
  const values = history.length ? history : [0, 0];
  const max = Math.max(40, Math.ceil(Math.max(...values) / 10) * 10);
  byId('chart-y-labels').querySelectorAll('span').forEach((label, index) => {
    label.textContent = String(Math.round(max * (4 - index) / 4));
  });
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 430 : (index / (values.length - 1)) * 430;
    const y = 158 - (Math.min(max, Math.max(0, Number(value) || 0)) / max) * 148;
    return [x, y];
  });
  const path = points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = points[points.length - 1];
  byId('chart-line').setAttribute('d', path);
  byId('chart-area').setAttribute('d', `${path} L 430 158 L 0 158 Z`);
  byId('chart-point').setAttribute('cx', lastX);
  byId('chart-point').setAttribute('cy', lastY);
}

function renderInterfaces(interfaces) {
  const tbody = byId('interface-rows');
  tbody.replaceChildren();
  const rows = state.showAllInterfaces ? interfaces : interfaces.slice(0, 4);
  rows.forEach((item) => {
    const isUp = String(item.status).toLowerCase() === 'up';
    const tr = document.createElement('tr');
    const nameCell = document.createElement('td');
    const nameWrap = document.createElement('span');
    nameWrap.className = 'interface-name';
    const icon = document.createElement('span');
    icon.className = 'interface-icon-small';
    icon.textContent = '↔';
    const name = document.createElement('span');
    name.textContent = safeText(item.name);
    nameWrap.append(icon, name);
    nameCell.append(nameWrap);

    const ipCell = document.createElement('td');
    ipCell.className = 'mono';
    ipCell.textContent = safeText(item.ip, 'unassigned');
    const statusCell = document.createElement('td');
    const statusPill = document.createElement('span');
    statusPill.className = `status-pill ${isUp ? '' : 'down'}`;
    statusPill.textContent = isUp ? 'Up' : safeText(item.status, 'Down');
    statusCell.append(statusPill);
    const protocolCell = document.createElement('td');
    protocolCell.textContent = safeText(item.protocol);

    const trafficCell = document.createElement('td');
    trafficCell.className = 'traffic-cell';
    const traffic = document.createElement('span');
    traffic.className = 'traffic-value';
    const rx = document.createElement('span');
    rx.textContent = `↓ ${Number(item.rxMbps) || 0} Mbps`;
    const tx = document.createElement('span');
    tx.className = 'tx';
    tx.textContent = `↑ ${Number(item.txMbps) || 0} Mbps`;
    traffic.append(rx, tx);
    trafficCell.append(traffic);
    const checkCell = document.createElement('td');
    checkCell.className = 'last-check';
    checkCell.textContent = 'Just now';
    tr.append(nameCell, ipCell, statusCell, protocolCell, trafficCell, checkCell);
    tbody.append(tr);
  });
  const upCount = interfaces.filter((item) => String(item.status).toLowerCase() === 'up' && String(item.protocol).toLowerCase() === 'up').length;
  byId('interfaces-up').textContent = String(upCount);
  byId('interfaces-total').textContent = String(interfaces.length);
  byId('show-all-interfaces').textContent = state.showAllInterfaces ? 'Show less ↑' : 'View all →';
}

function renderChecks(checks) {
  const list = byId('check-list');
  list.replaceChildren();
  checks.forEach((check) => {
    const status = normalizedStatus(check.status);
    const row = document.createElement('div');
    row.className = 'check-item';
    const icon = document.createElement('span');
    icon.className = `check-status ${status}`;
    icon.textContent = status === 'ok' ? '✓' : status === 'warning' ? '!' : '×';
    const info = document.createElement('span');
    info.className = 'check-info';
    const title = document.createElement('strong');
    title.textContent = safeText(check.title);
    const detail = document.createElement('small');
    detail.textContent = safeText(check.detail);
    info.append(title, detail);
    const result = document.createElement('span');
    result.className = `check-result ${status}`;
    result.textContent = status === 'ok' ? 'Passed' : status;
    row.append(icon, info, result);
    list.append(row);
  });
  byId('check-count').textContent = `${checks.length} check${checks.length === 1 ? '' : 's'}`;
}

function renderCommandOutput() {
  const commands = state.data.commandOutputs || {};
  const command = commands[state.activeCommand];
  byId('command-text').textContent = typeof command === 'string' && command ? command : 'No command output was included in this API response.';
}

function renderDashboard(data) {
  state.data = data;
  const interfaces = Array.isArray(data.interfaces) ? data.interfaces : [];
  const checks = Array.isArray(data.diagnostics) ? data.diagnostics : [];
  const metrics = data.metrics || {};
  const criticalCount = checks.filter((check) => normalizedStatus(check.status) === 'critical').length;
  const warningCount = checks.filter((check) => normalizedStatus(check.status) === 'warning').length;
  const overall = criticalCount ? 'Critical' : warningCount ? 'Review' : 'Healthy';

  byId('device-status').textContent = overall;
  byId('device-status').parentElement.classList.toggle('critical', overall === 'Critical');
  byId('device-status').parentElement.classList.toggle('warning', overall === 'Review');
  byId('last-checked').textContent = formatTime(data.generatedAt);
  byId('latency-value').textContent = String(Number(metrics.latencyMs) || 0);
  byId('chart-latency').textContent = String(Number(metrics.latencyMs) || 0);
  byId('uptime-value').textContent = safeText(metrics.uptime, 'Unknown');
  byId('platform-value').textContent = safeText(data.device?.platform, 'Unknown');
  byId('footer-timestamp').textContent = `Last updated ${formatTime(data.generatedAt)}`;
  renderTopology(interfaces);
  renderInterfaces(interfaces);
  renderChecks(checks);
  renderLatencyChart(Array.isArray(data.latencyHistory) ? data.latencyHistory : [Number(metrics.latencyMs) || 0]);
  renderCommandOutput();
}

function validateEndpoint(value) {
  if (value.startsWith('/')) {
    return new URL(value, window.location.origin).href;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a complete API URL, including http:// or https://.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('The API URL must use HTTP or HTTPS.');
  }
  return url.href;
}

async function runDiagnostics() {
  const button = byId('run-diagnostics');
  const endpoint = byId('api-endpoint').value.trim();
  clearNotice();
  button.disabled = true;
  button.querySelector('span').textContent = endpoint ? 'Connecting…' : 'Running…';

  try {
    let data;
    if (endpoint) {
      const url = validateEndpoint(endpoint);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ checks: requestedCommands })
      });
      if (!response.ok) {
        let apiError = '';
        try {
          const errorPayload = await response.json();
          apiError = typeof errorPayload.error === 'string' ? errorPayload.error : '';
        } catch {
          apiError = '';
        }
        throw new Error(apiError || `Diagnostics API returned HTTP ${response.status}.`);
      }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) throw new Error('The diagnostics endpoint must return JSON.');
      data = validateDiagnostics(await response.json());
      byId('connection-label').textContent = 'Live API';
      byId('connection-label').parentElement.classList.add('connected');
      showNotice('Live diagnostics loaded from the configured API endpoint.');
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      data = { ...demoData, generatedAt: new Date().toISOString() };
      byId('connection-label').textContent = 'Demo data';
      byId('connection-label').parentElement.classList.remove('connected');
      showNotice('Demo diagnostics refreshed. This is sample data and is not connected to a router.');
    }
    state.showAllInterfaces = false;
    renderDashboard(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred while loading diagnostics.';
    showNotice(message, true);
    if (endpoint) {
      byId('connection-label').textContent = 'API unavailable';
      byId('connection-label').parentElement.classList.remove('connected');
    }
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Run diagnostics';
  }
}

function setTopologyMode(mode) {
  const is3d = mode === '3d';
  byId('topology-stage').classList.toggle('is-3d', is3d);
  byId('view-2d').classList.toggle('active', !is3d);
  byId('view-3d').classList.toggle('active', is3d);
  byId('view-2d').setAttribute('aria-pressed', String(!is3d));
  byId('view-3d').setAttribute('aria-pressed', String(is3d));
}

byId('run-diagnostics').addEventListener('click', runDiagnostics);
byId('view-2d').addEventListener('click', () => setTopologyMode('2d'));
byId('view-3d').addEventListener('click', () => setTopologyMode('3d'));
byId('demo-mode').addEventListener('click', () => {
  byId('api-endpoint').value = '';
  byId('connection-label').textContent = 'Demo data';
  byId('connection-label').parentElement.classList.remove('connected');
  clearNotice();
  showNotice('Demo mode selected. The next run will use sample lab data.');
});
byId('show-all-interfaces').addEventListener('click', () => {
  state.showAllInterfaces = !state.showAllInterfaces;
  renderInterfaces(state.data.interfaces);
});
byId('center-topology').addEventListener('click', () => setTopologyMode('2d'));
byId('zoom-topology').addEventListener('click', () => {
  const svg = byId('topology-svg');
  svg.classList.toggle('zoomed');
  svg.style.scale = svg.classList.contains('zoomed') ? '1.12' : '';
});
byId('copy-output').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(byId('command-text').textContent);
    showNotice('Command output copied to the clipboard.');
  } catch {
    showNotice('Clipboard access is unavailable in this browser context.', true);
  }
});
document.querySelectorAll('.command-tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.command-tab').forEach((item) => {
    item.classList.remove('active');
    item.setAttribute('aria-selected', 'false');
  });
  tab.classList.add('active');
  tab.setAttribute('aria-selected', 'true');
  state.activeCommand = tab.dataset.command;
  renderCommandOutput();
}));
document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => {
  document.querySelectorAll('.nav-link').forEach((item) => item.classList.remove('active'));
  link.classList.add('active');
  document.getElementById(link.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));
renderDashboard(demoData);
