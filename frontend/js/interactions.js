// interactions.js — Shared UI: modal, toast, notification panel, confirm dialog

// ─── TOAST ───────────────────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position:fixed; bottom:24px; right:24px; z-index:9999;
      display:flex; flex-direction:column; gap:8px; pointer-events:none;
    `;
    document.body.appendChild(container);
  }

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️', broadcast: '📢' };
  const colors = {
    success: 'var(--accent-green)', error: 'var(--accent-red)',
    warning: 'var(--accent-yellow)', info: 'var(--accent-blue)', broadcast: 'var(--accent-orange)'
  };

  const toast = document.createElement('div');
  toast.style.cssText = `
    background: var(--bg-card); border: 1px solid var(--border-light);
    border-left: 3px solid ${colors[type] || colors.info};
    border-radius: var(--radius-sm); padding: 12px 16px;
    display: flex; align-items: center; gap: 10px;
    font-size: 13px; color: var(--text-primary);
    box-shadow: var(--shadow); pointer-events: all;
    animation: slideInRight 0.3s ease; min-width: 280px; max-width: 380px;
  `;
  toast.innerHTML = `<span style="font-size:16px;">${icons[type] || icons.info}</span><span style="flex:1;">${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
function showModal({ title, body, actions = [], size = 'md' }) {
  closeModal();
  const widths = { sm: '400px', md: '560px', lg: '720px' };

  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:8000;
    display:flex; align-items:center; justify-content:center; padding:20px;
    animation: fadeIn 0.2s ease;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    background: var(--bg-card); border: 1px solid var(--border-light);
    border-radius: var(--radius); width: 100%; max-width: ${widths[size]};
    max-height: 85vh; display: flex; flex-direction: column;
    box-shadow: 0 24px 64px rgba(0,0,0,0.6);
    animation: slideInUp 0.25s ease;
  `;

  const actionsHtml = actions.map(a =>
    `<button class="btn btn-${a.style || 'secondary'}" data-action="${a.id}">${a.label}</button>`
  ).join('');

  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--border);">
      <div style="font-size:15px;font-weight:700;">${title}</div>
      <button id="modal-close" style="background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;line-height:1;padding:2px 6px;border-radius:4px;" onmouseover="this.style.color='var(--text-primary)'" onmouseout="this.style.color='var(--text-muted)'">×</button>
    </div>
    <div style="padding:20px;overflow-y:auto;flex:1;">${body}</div>
    ${actionsHtml ? `<div style="display:flex;gap:8px;justify-content:flex-end;padding:14px 20px;border-top:1px solid var(--border);">${actionsHtml}</div>` : ''}
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  modal.querySelector('#modal-close').addEventListener('click', closeModal);

  actions.forEach(a => {
    const btn = modal.querySelector(`[data-action="${a.id}"]`);
    if (btn && a.onClick) btn.addEventListener('click', () => { a.onClick(); if (a.closeOnClick !== false) closeModal(); });
  });

  return modal;
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.remove();
}

// ─── CONFIRM DIALOG ──────────────────────────────────────────────────────────
function showConfirm(message, onConfirm, confirmLabel = 'Confirm', confirmStyle = 'danger') {
  showModal({
    title: '⚠️ Confirm Action',
    body: `<p style="color:var(--text-secondary);font-size:14px;line-height:1.6;">${message}</p>`,
    size: 'sm',
    actions: [
      { id: 'cancel', label: 'Cancel', style: 'secondary' },
      { id: 'confirm', label: confirmLabel, style: confirmStyle, onClick: onConfirm },
    ]
  });
}

// ─── NOTIFICATION PANEL ──────────────────────────────────────────────────────
const NOTIFICATIONS = [
  { id: 1, title: 'Koshi River — Level 4 Flood', desc: 'Embankment breach risk. NDRRMA alerted.', time: '8 min ago', type: 'critical', read: false },
  { id: 2, title: 'Sindhupalchok Landslide', desc: 'Major landslide on Araniko Highway.', time: '22 min ago', type: 'critical', read: false },
  { id: 3, title: 'Rapti River rising', desc: 'Level 3 alert issued for Dang district.', time: '1h ago', type: 'warning', read: false },
  { id: 4, title: 'Model accuracy updated', desc: 'Prediction model retrained — 91.8%', time: '2h ago', type: 'info', read: true },
];

function openNotificationPanel() {
  const unread = NOTIFICATIONS.filter(n => !n.read);
  const typeColors = { critical: 'var(--accent-red)', warning: 'var(--accent-orange)', info: 'var(--accent-blue)' };

  showModal({
    title: `🔔 Notifications (${unread.length} unread)`,
    size: 'sm',
    body: NOTIFICATIONS.map(n => `
      <div style="
        display:flex;gap:12px;padding:12px;border-radius:var(--radius-sm);
        background:${n.read ? 'transparent' : 'rgba(59,130,246,0.05)'};
        border:1px solid ${n.read ? 'transparent' : 'rgba(59,130,246,0.15)'};
        margin-bottom:8px;
      ">
        <div style="width:8px;height:8px;border-radius:50%;background:${typeColors[n.type]};margin-top:5px;flex-shrink:0;${n.read ? 'opacity:0.3' : ''}"></div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:${n.read ? '500' : '700'};margin-bottom:2px;">${n.title}</div>
          <div style="font-size:11px;color:var(--text-muted);">${n.desc}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">🕐 ${n.time}</div>
        </div>
      </div>
    `).join(''),
    actions: [
      { id: 'mark-all', label: 'Mark All Read', style: 'secondary', onClick: () => {
        NOTIFICATIONS.forEach(n => n.read = true);
        document.querySelectorAll('.notif-badge').forEach(b => b.style.display = 'none');
        showToast('All notifications marked as read', 'success');
      }, closeOnClick: false }
    ]
  });
}

// ─── BROADCAST MODAL ─────────────────────────────────────────────────────────
function openBroadcastModal() {
  showModal({
    title: '🚨 Broadcast Emergency Alert',
    size: 'md',
    body: `
      <div style="margin-bottom:14px;">
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px;">Alert Type</label>
        <select class="filter-select" style="width:100%;padding:10px;" id="bc-type">
          <option>Flood Warning</option>
          <option>Landslide Warning</option>
          <option>Evacuation Order</option>
          <option>All Clear</option>
        </select>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px;">Target Area</label>
        <select class="filter-select" style="width:100%;padding:10px;" id="bc-area">
          <option>All Nepal</option>
          <option>Province 1 (Koshi)</option>
          <option>Province 2 (Madhesh)</option>
          <option>Province 3 (Bagmati)</option>
          <option>Province 4 (Gandaki)</option>
          <option>Province 5 (Lumbini)</option>
          <option>Province 6 (Karnali)</option>
          <option>Province 7 (Sudurpashchim)</option>
        </select>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px;">Message</label>
        <textarea id="bc-msg" style="
          width:100%;background:var(--bg-secondary);border:1px solid var(--border);
          border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;
          font-size:13px;padding:10px;resize:vertical;min-height:80px;outline:none;
        " placeholder="Enter broadcast message..."></textarea>
      </div>
      <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:var(--radius-sm);padding:10px 12px;">
        <div style="font-size:12px;color:var(--accent-red);font-weight:600;">⚠️ This will send SMS alerts to all registered contacts in the target area.</div>
      </div>
    `,
    actions: [
      { id: 'cancel', label: 'Cancel', style: 'secondary' },
      { id: 'send', label: '🚨 Send Broadcast', style: 'danger', onClick: () => {
        const type = document.getElementById('bc-type')?.value;
        const area = document.getElementById('bc-area')?.value;
        showToast(`📢 Broadcast sent: "${type}" to ${area}`, 'broadcast', 5000);
      }}
    ]
  });
}

// ─── EXPORT CSV ──────────────────────────────────────────────────────────────
function exportCSV(data, filename) {
  if (!data || !data.length) { showToast('No data to export', 'warning'); return; }
  const headers = Object.keys(data[0]);
  const rows = data.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  showToast(`📥 Exported ${filename}`, 'success');
}

// ─── PROFILE MODAL ───────────────────────────────────────────────────────────
function openProfileModal() {
  showModal({
    title: '👤 NDRRMA Admin',
    size: 'sm',
    body: `
      <div style="text-align:center;margin-bottom:20px;">
        <div style="width:64px;height:64px;border-radius:12px;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;margin:0 auto 12px;">ND</div>
        <div style="font-size:16px;font-weight:700;">NDRRMA Admin</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">National Disaster Risk Reduction & Management Authority</div>
      </div>
      <div style="display:grid;gap:8px;">
        <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:10px 14px;display:flex;justify-content:space-between;">
          <span style="font-size:12px;color:var(--text-muted);">Role</span>
          <span style="font-size:12px;font-weight:600;">System Administrator</span>
        </div>
        <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:10px 14px;display:flex;justify-content:space-between;">
          <span style="font-size:12px;color:var(--text-muted);">Access Level</span>
          <span style="font-size:12px;font-weight:600;color:var(--accent-green);">Full Access</span>
        </div>
        <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:10px 14px;display:flex;justify-content:space-between;">
          <span style="font-size:12px;color:var(--text-muted);">Last Login</span>
          <span style="font-size:12px;font-weight:600;">Today, ${new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    `,
    actions: [{ id: 'close', label: 'Close', style: 'secondary' }]
  });
}

// ─── INJECT ANIMATION STYLES ─────────────────────────────────────────────────
const interactionStyles = document.createElement('style');
interactionStyles.textContent = `
  @keyframes slideInRight { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
  @keyframes slideOutRight { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(20px); } }
  @keyframes slideInUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
`;
document.head.appendChild(interactionStyles);

// ─── GLOBAL HEADER WIRING (runs on every page) ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Notification bell
  document.querySelectorAll('.header-btn').forEach(btn => {
    if (btn.textContent.includes('🔔')) btn.addEventListener('click', openNotificationPanel);
    if (btn.textContent.includes('🔄')) btn.addEventListener('click', () => {
      btn.style.animation = 'spin 0.6s linear';
      showToast('Data refreshed successfully', 'success');
      setTimeout(() => btn.style.animation = '', 700);
    });
  });

  // Avatar → profile
  document.querySelectorAll('.avatar').forEach(a => a.addEventListener('click', openProfileModal));

  // Broadcast button (any page)
  document.querySelectorAll('.btn-danger').forEach(btn => {
    if (btn.textContent.includes('Broadcast')) btn.addEventListener('click', openBroadcastModal);
  });
});
