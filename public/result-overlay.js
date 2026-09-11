const AUTO_DISMISS_MS = 12000;

function maskPhone(phone) {
  if (!phone || phone.length < 6) return phone || '';
  return phone.slice(0, 3) + ' *** *** ' + phone.slice(-4);
}

function riskConfig(type, riskLevel) {
  const descriptions = {
    sim: { HIGH: 'Recent SIM change detected', MEDIUM: 'SIM changed within 30 days', LOW: 'No recent SIM change' },
    device: { HIGH: 'Recent device change detected', MEDIUM: 'Device changed within 30 days', LOW: 'No recent device change' },
  };
  const colors = {
    RISK_LEVEL_HIGH: { label: 'High Risk', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
    RISK_LEVEL_MEDIUM: { label: 'Medium', color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
    RISK_LEVEL_LOW: { label: 'Low Risk', color: '#059669', bg: 'rgba(5,150,105,0.1)' },
  };
  const c = colors[riskLevel];
  if (!c) return { label: 'Unknown', color: '#6b7280', bg: 'rgba(107,114,128,0.08)', description: 'Could not determine risk' };
  const key = riskLevel.replace('RISK_LEVEL_', '');
  return { ...c, description: descriptions[type]?.[key] || '' };
}

function signalRowHTML(label, iconSvg, swap, type) {
  if (!swap) return '';
  const risk = swap.risk_level ? riskConfig(type, swap.risk_level) : null;
  
  let body = `<div class="ro-signal-name">${label}</div>`;
  if (swap.checked) {
    if (risk) body += `<span class="ro-badge" style="background:${risk.bg};color:${risk.color};border-color:${risk.color}">${risk.label}</span>`;
    if (risk) body += `<div class="ro-signal-desc">${risk.description}</div>`;
    if (swap.age_band) body += `<div class="ro-signal-sub">Last change: ${swap.age_band}</div>`;
    if (swap.carrier_name) body += `<div class="ro-signal-sub">Carrier: ${swap.carrier_name}</div>`;
  } else {
    body += '<span class="ro-badge ro-badge-na">Unavailable</span>';
    if (swap.reason) body += `<div class="ro-signal-sub">Reason: ${swap.reason}</div>`;
  }
  
  return `<div class="ro-signal-row"><div class="ro-sim-icon">${iconSvg}</div><div class="ro-signal-body">${body}</div></div>`;
}

const SIM_ICON = '<svg viewBox="0 0 40 40" width="40" height="40" fill="none"><rect x="6" y="2" width="28" height="36" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="M6 12h10l4-4h8" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><rect x="13" y="18" width="14" height="12" rx="1.5" stroke="currentColor" stroke-width="1.2"/><line x1="20" y1="18" x2="20" y2="30" stroke="currentColor" stroke-width="1" opacity="0.5"/><line x1="13" y1="24" x2="27" y2="24" stroke="currentColor" stroke-width="1" opacity="0.5"/></svg>';
const DEVICE_ICON = '<svg viewBox="0 0 40 40" width="40" height="40" fill="none"><rect x="10" y="2" width="20" height="36" rx="3" stroke="currentColor" stroke-width="1.5"/><line x1="16" y1="6" x2="24" y2="6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="20" cy="33" r="2" stroke="currentColor" stroke-width="1.2"/><rect x="13" y="10" width="14" height="18" rx="1" stroke="currentColor" stroke-width="1" opacity="0.5"/></svg>';

let _timers = [];
let _dismissFn = null;

window.showResultOverlay = function(result, onDismiss) {
  hideResultOverlay();
  _dismissFn = onDismiss;

  const isVerified = result.verified !== false;
  const simSwap = result.sim_swap;
  const deviceSwap = result.device_swap;
  const hasSignals = simSwap || deviceSwap;

  const checkSvg = '<svg class="ro-check-svg" viewBox="0 0 52 52"><circle class="ro-check-ring" cx="26" cy="26" r="25" fill="none"/><path class="ro-check-tick" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/></svg>';
  const xSvg = '<svg class="ro-x-svg" viewBox="0 0 52 52"><circle class="ro-x-ring" cx="26" cy="26" r="25" fill="none"/><path class="ro-x-lines" fill="none" d="M16 16l20 20M36 16l-20 20"/></svg>';

  const title = result.verified !== undefined
    ? (isVerified ? 'Phone Verified' : 'Verification Failed')
    : 'Phone Number Retrieved';

  let signalsHTML = '';
  if (hasSignals) {
    const shieldIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
    signalsHTML = `<div class="ro-signals"><div class="ro-signals-label">${shieldIcon} Anti-Fraud Signals</div>${signalRowHTML('SIM Swap Check', SIM_ICON, simSwap, 'sim')}${deviceSwap ? '<div style="margin-top:0.5rem">' + signalRowHTML('Device Swap Check', DEVICE_ICON, deviceSwap, 'device') + '</div>' : ''}</div>`;
  }

  const audHTML = result.aud ? `<div class="ro-aud"><span>aud</span> ${result.aud}</div>` : '';

  const countdown = Math.ceil(AUTO_DISMISS_MS / 1000);

  const backdrop = document.createElement('div');
  backdrop.id = 'ro-overlay';
  backdrop.className = 'ro-backdrop';
  backdrop.innerHTML = `
    <div class="ro-card">
      <div class="ro-glow ${isVerified ? 'ro-glow-success' : 'ro-glow-fail'}"></div>
      <div class="ro-icon-wrap">${isVerified ? checkSvg : xSvg}</div>
      <h3 class="ro-title">${title}</h3>
      <p class="ro-phone">${maskPhone(result.phone_number)}</p>
      ${signalsHTML}
      ${audHTML}
      <button class="ro-btn">Dismiss <span class="ro-countdown">(${countdown}s)</span></button>
    </div>
  `;

  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', function(e) {
    if (e.target === backdrop) handleDismiss();
  });
  backdrop.querySelector('.ro-card').addEventListener('click', function(e) { e.stopPropagation(); });
  backdrop.querySelector('.ro-btn').addEventListener('click', handleDismiss);

  const glow = backdrop.querySelector('.ro-glow');
  const iconWrap = backdrop.querySelector('.ro-icon-wrap');
  const titleEl = backdrop.querySelector('.ro-title');
  const phoneEl = backdrop.querySelector('.ro-phone');
  const signalsEl = backdrop.querySelector('.ro-signals');
  const audEl = backdrop.querySelector('.ro-aud');
  const btnEl = backdrop.querySelector('.ro-btn');

  _timers.push(setTimeout(function() { backdrop.classList.add('ro-in'); }, 10));
  _timers.push(setTimeout(function() { backdrop.querySelector('.ro-card').classList.add('ro-card-in'); }, 80));
  _timers.push(setTimeout(function() {
    if (glow) glow.classList.add('ro-glow-in');
    if (iconWrap) iconWrap.classList.add('ro-reveal');
    if (titleEl) { titleEl.classList.add('ro-reveal', 'ro-d1'); }
    if (phoneEl) { phoneEl.classList.add('ro-reveal', 'ro-d2'); }
    if (signalsEl) { signalsEl.classList.add('ro-reveal', 'ro-d3'); }
    if (audEl) { audEl.classList.add('ro-reveal', 'ro-d4'); }
    if (btnEl) { btnEl.classList.add('ro-reveal', 'ro-d5'); }
  }, 350));

  _timers.push(setTimeout(handleDismiss, AUTO_DISMISS_MS));

  let remaining = countdown;
  const countdownEl = backdrop.querySelector('.ro-countdown');
  const tick = setInterval(function() {
    remaining--;
    if (countdownEl) countdownEl.textContent = '(' + remaining + 's)';
    if (remaining <= 0) clearInterval(tick);
  }, 1000);
  _timers.push(tick);
};

function handleDismiss() {
  const el = document.getElementById('ro-overlay');
  if (!el) return;
  el.classList.remove('ro-in');
  el.classList.add('ro-out');
  _timers.forEach(function(t) { clearTimeout(t); clearInterval(t); });
  _timers = [];
  setTimeout(function() {
    el.remove();
    if (_dismissFn) { _dismissFn(); _dismissFn = null; }
  }, 350);
}

window.hideResultOverlay = function() {
  const el = document.getElementById('ro-overlay');
  if (el) el.remove();
  _timers.forEach(function(t) { clearTimeout(t); clearInterval(t); });
  _timers = [];
  _dismissFn = null;
};
