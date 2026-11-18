/* ==========================================================================
   QUESTIONARY NOTIFICATIONS & ANNOUNCEMENTS CENTER (v2.4.0)
   User-facing updates, release notes, and real-time announcements
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_NOTIFS = 'questionary-notifications';
  const STORAGE_UPDATES = 'questionary-blog-updates';

  const DEFAULT_UPDATES = [
    {
      id: 'update_v240_launch',
      title: 'Questionary v2.4.0: Major Academic Overhaul!',
      category: 'Feature Update',
      version: 'v2.4.0',
      author: 'Sayan',
      date: Date.now() - 3600000 * 4,
      excerpt: 'Massive study upgrades: 3D Flashcards with ICSE decks, Rich Markdown Notes with split preview, Lo-Fi Study Room soundscapes, and Accessibility tools.',
      content: `### Welcome to Questionary v2.4.0!

We are excited to deliver this comprehensive overhaul designed for high performance:

1. **Interactive 3D Flashcards**:
   - Modern 3D flip card animations with keyboard shortcuts (Space to flip, 1-4 for Spaced Repetition SRS).
   - Pre-loaded with official high-yield ICSE Class 10 study decks (Physics, Chemistry, Biology, Java OOPs).
   - Audio text-to-speech speaker to listen to definitions and formulas out loud.
   - Interactive Quiz mode with instant multiple choice scoring!

2. **Advanced Notes with Markdown & Split Preview**:
   - Full Markdown editor with live formatting toolbar (Bold, Italic, Code, Formulas, Quotes, Lists).
   - Split preview toggle, pin to top for favorite notes, and one-click markdown (.md) export.

3. **Study Room & Focus Workstation**:
   - Circular Pomodoro focus timer with custom work/break intervals and gentle audio chimes.
   - Procedural Web Audio Lo-Fi soundscape mixer: Gentle Rain, Ocean Waves, Cafe chatter, Campfire, and 10Hz Alpha Binaural Beats (100% offline).
   - Real-time study goals checklist and daily focus stats.

4. **Universal Accessibility**:
   - High-contrast visual modes, dyslexia-friendly typography, customizable text sizing, and focus ruler.`
    }
  ];

  const DEFAULT_NOTIFS = [
    {
      id: 'notif_welcome_v24',
      title: '🚀 Big Update: Flashcards, Notes & Study Room Revamped!',
      type: 'update',
      updateId: 'update_v240_launch',
      unread: true,
      date: Date.now() - 3600000 * 4,
      body: 'Check out the new 3D flashcards, markdown notes, lo-fi study room soundscapes, and accessibility toolbar.'
    }
  ];

  let notifications = [];
  let blogUpdates = [];
  let currentNotifFilter = 'all';

  function loadState() {
    try {
      const savedUpdates = localStorage.getItem(STORAGE_UPDATES);
      blogUpdates = savedUpdates ? JSON.parse(savedUpdates) : JSON.parse(JSON.stringify(DEFAULT_UPDATES));
    } catch (e) {
      blogUpdates = JSON.parse(JSON.stringify(DEFAULT_UPDATES));
    }

    try {
      const savedNotifs = localStorage.getItem(STORAGE_NOTIFS);
      notifications = savedNotifs ? JSON.parse(savedNotifs) : JSON.parse(JSON.stringify(DEFAULT_NOTIFS));
    } catch (e) {
      notifications = JSON.parse(JSON.stringify(DEFAULT_NOTIFS));
    }

    // Attempt to sync from server announcements API if available
    fetchServerAnnouncements();
  }

  async function fetchServerAnnouncements() {
    try {
      const res = await fetch('/api/announcements');
      if (res.ok) {
        const serverPosts = await res.json();
        if (Array.isArray(serverPosts) && serverPosts.length > 0) {
          blogUpdates = serverPosts;
          localStorage.setItem(STORAGE_UPDATES, JSON.stringify(blogUpdates));

          // Ensure notifications exist for these posts
          let updatedNotifs = false;
          for (const post of serverPosts) {
            const hasNotif = notifications.some(n => n.updateId === post.id);
            if (!hasNotif) {
              notifications.unshift({
                id: 'notif_' + post.id,
                title: `📢 ${post.title}`,
                type: 'update',
                updateId: post.id,
                unread: true,
                date: post.date || Date.now(),
                body: post.excerpt || (post.content ? post.content.substring(0, 90) : '')
              });
              updatedNotifs = true;
            }
          }
          if (updatedNotifs) {
            localStorage.setItem(STORAGE_NOTIFS, JSON.stringify(notifications));
          }
          updateBadgeCounts();
          if (document.getElementById('notificationsModal')?.classList.contains('active')) {
            renderNotificationsList();
          }
        }
      }
    } catch (e) {
      // Offline or network error; use localStorage
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_UPDATES, JSON.stringify(blogUpdates));
      localStorage.setItem(STORAGE_NOTIFS, JSON.stringify(notifications));
    } catch (e) {}
    updateBadgeCounts();
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function updateBadgeCounts() {
    const unreadCount = notifications.filter(n => n.unread).length;
    const badge = document.getElementById('notifDropdownBadge');
    if (badge) {
      badge.textContent = unreadCount;
      badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
    }
  }

  // Inject Notifications entry into user dropdown menu
  function injectDropdownItems() {
    const menu = document.getElementById('userDropdownMenu');
    if (!menu) return;

    if (document.getElementById('notifDropdownItem')) return;

    const notifItem = document.createElement('div');
    notifItem.id = 'notifDropdownItem';
    notifItem.className = 'user-dropdown-item has-badge';
    notifItem.style.cursor = 'pointer';
    notifItem.innerHTML = `
      <i class="fas fa-bell" style="color:var(--accent,#cf6215);"></i>
      <span>Updates & Announcements</span>
      <span class="notif-badge-pill" id="notifDropdownBadge" style="display:none;">0</span>
    `;
    notifItem.onclick = (e) => {
      e.stopPropagation();
      if (typeof window.closeUserDropdown === 'function') {
        window.closeUserDropdown();
      } else {
        menu.classList.remove('active');
      }
      openNotificationsModal();
    };

    const openSettingsBtn = document.getElementById('openSettingsBtn');
    if (openSettingsBtn) {
      menu.insertBefore(notifItem, openSettingsBtn.nextSibling);
    } else {
      menu.prepend(notifItem);
    }

    updateBadgeCounts();
  }

  // Modal creation
  function createNotificationsModal() {
    if (document.getElementById('notificationsModal')) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'notificationsModal';
    modal.innerHTML = `
      <div class="modal notif-modal" style="max-width: 540px; width: 95%;">
        <div class="modal-sheet-handle"></div>
        <div class="modal-header">
          <h3><i class="fas fa-bell" style="color:var(--accent,#cf6215);"></i> Updates & Announcements</h3>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="window.NotificationsCenter.markAllRead()" style="font-size:0.75rem;">
              <i class="fas fa-check-double"></i> Mark All Read
            </button>
            <button class="modal-close" onclick="document.getElementById('notificationsModal').classList.remove('active')">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        <div class="modal-body" style="padding-top:0.5rem;">
          <div class="notif-tabs-bar">
            <button type="button" class="notif-tab active" data-filter="all" onclick="window.NotificationsCenter.setNotifFilter('all', this)">All</button>
            <button type="button" class="notif-tab" data-filter="update" onclick="window.NotificationsCenter.setNotifFilter('update', this)">App Updates</button>
            <button type="button" class="notif-tab" data-filter="system" onclick="window.NotificationsCenter.setNotifFilter('system', this)">Announcements</button>
          </div>
          <div class="notif-list" id="notifListContainer"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function openNotificationsModal() {
    createNotificationsModal();
    renderNotificationsList();
    document.getElementById('notificationsModal')?.classList.add('active');
  }

  function renderNotificationsList() {
    const container = document.getElementById('notifListContainer');
    if (!container) return;

    loadState();
    let filtered = notifications;
    if (currentNotifFilter !== 'all') {
      filtered = notifications.filter(n => n.type === currentNotifFilter);
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:2.5rem 1rem; color:var(--fg3,#71717a);">
          <i class="fas fa-bell-slash" style="font-size:2rem; margin-bottom:8px; display:block; opacity:0.6;"></i>
          <p style="font-size:0.85rem; margin:0;">No updates in this section.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(n => `
      <div class="notif-item ${n.unread ? 'unread' : ''}" data-notif-id="${escapeHtml(n.id)}">
        <div class="notif-item-top">
          <span class="notif-tag">${escapeHtml(n.type === 'update' ? 'App Update' : 'Announcement')}</span>
          <span class="notif-date">${new Date(n.date).toLocaleDateString()}</span>
        </div>
        <h4 class="notif-title">${escapeHtml(n.title)}</h4>
        <p class="notif-body-preview">${escapeHtml(n.body)}</p>
      </div>
    `).join('');

    container.querySelectorAll('.notif-item[data-notif-id]').forEach(el => {
      el.addEventListener('click', () => handleNotifClick(el.dataset.notifId));
    });
  }

  function handleNotifClick(notifId) {
    const notif = notifications.find(n => n.id === notifId);
    if (!notif) return;

    notif.unread = false;
    saveState();
    renderNotificationsList();

    if (notif.updateId) {
      const update = blogUpdates.find(u => u.id === notif.updateId);
      if (update) {
        showUpdatePostReader(update);
      }
    }
  }

  function markAllRead() {
    notifications.forEach(n => n.unread = false);
    saveState();
    renderNotificationsList();
  }

  // Full Blog Post / Update Reader
  function showUpdatePostReader(post) {
    let reader = document.getElementById('blogPostReaderModal');
    if (!reader) {
      reader = document.createElement('div');
      reader.className = 'modal-overlay';
      reader.id = 'blogPostReaderModal';
      document.body.appendChild(reader);
    }

    const rawRendered = escapeHtml(post.content || '')
      .replace(/^### (.*$)/gim, '<h3 style="color:var(--accent,#cf6215); margin-top:14px; margin-bottom:6px; font-size:1.05rem;">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 style="color:var(--accent,#cf6215); margin-top:18px; margin-bottom:8px; font-size:1.15rem;">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 style="color:var(--accent,#cf6215); margin-top:20px; font-size:1.25rem;">$1</h1>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/```([\s\S]*?)```/gim, '<pre style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; overflow-x:auto;"><code>$1</code></pre>')
      .replace(/^\- (.*$)/gim, '<li style="margin-left:16px; margin-bottom:4px;">$1</li>')
      .replace(/\n/gim, '<br>');
    const renderedBody = (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function')
      ? window.DOMPurify.sanitize(rawRendered)
      : rawRendered;

    reader.innerHTML = `
      <div class="modal" style="max-width: 620px; width: 95%;">
        <div class="modal-sheet-handle"></div>
        <div class="modal-header">
          <div>
            <span class="notif-tag" style="margin-bottom:6px; display:inline-block;">${escapeHtml(post.category || 'Update')}</span>
            <h3 style="margin:0; font-size:1.15rem;">${escapeHtml(post.title)}</h3>
          </div>
          <button class="modal-close" onclick="document.getElementById('blogPostReaderModal').classList.remove('active')"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" style="max-height: 480px; overflow-y:auto; line-height:1.6; font-size:0.9rem; color:var(--fg,#f4f4f5);">
          <div style="font-size:0.75rem; color:var(--fg3,#71717a); margin-bottom:1rem; display:flex; gap:12px; flex-wrap:wrap;">
            <span><i class="fas fa-user"></i> ${escapeHtml(post.author || 'Academic Admin')}</span>
            <span><i class="fas fa-tag"></i> ${escapeHtml(post.version || 'v2.4.0')}</span>
            <span><i class="fas fa-calendar"></i> ${new Date(post.date).toLocaleDateString()}</span>
          </div>
          <div style="line-height:1.65;">${renderedBody}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" onclick="document.getElementById('blogPostReaderModal').classList.remove('active')">Got It</button>
        </div>
      </div>
    `;
    reader.classList.add('active');
  }

  // Cross-tab synchronization: when admin publishes from /admin.html, sync instantly
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_UPDATES || e.key === STORAGE_NOTIFS) {
      loadState();
      updateBadgeCounts();
      if (document.getElementById('notificationsModal')?.classList.contains('active')) {
        renderNotificationsList();
      }
    }
  });

  // Inject CSS styles for notifications
  function injectStyles() {
    if (document.getElementById('questionary-notif-styles')) return;
    const style = document.createElement('style');
    style.id = 'questionary-notif-styles';
    style.textContent = `
      .notif-badge-pill {
        margin-left: auto;
        background: #ef4444;
        color: #fff;
        font-size: 0.65rem;
        font-weight: 800;
        padding: 2px 7px;
        border-radius: 999px;
        box-shadow: 0 2px 6px rgba(239,68,68,0.4);
      }
      .notif-tabs-bar {
        display: flex;
        gap: 6px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--line, #2e3035);
        margin-bottom: 10px;
      }
      .notif-tab {
        background: transparent;
        border: 1px solid transparent;
        color: var(--fg3, #8b8f94);
        padding: 5px 12px;
        border-radius: 6px;
        font-size: 0.78rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .notif-tab:hover {
        color: var(--fg, #f4f4f5);
      }
      .notif-tab.active {
        background: rgba(207,98,21,0.12);
        color: var(--accent, #cf6215);
        border-color: rgba(207,98,21,0.3);
      }
      .notif-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 420px;
        overflow-y: auto;
      }
      .notif-item {
        background: var(--bg, #111113);
        border: 1px solid var(--line, #2e3035);
        border-radius: 10px;
        padding: 12px;
        cursor: pointer;
        transition: transform 0.1s ease, border-color 0.15s ease, background 0.15s ease;
        position: relative;
      }
      .notif-item:hover {
        transform: translateY(-1px);
        border-color: var(--accent, #cf6215);
      }
      .notif-item.unread {
        border-left: 3px solid var(--accent, #cf6215);
        background: rgba(207,98,21,0.03);
      }
      .notif-item.unread::after {
        content: '';
        position: absolute;
        top: 14px;
        right: 14px;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--accent, #cf6215);
      }
      .notif-item-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
      }
      .notif-tag {
        font-size: 0.68rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 2px 7px;
        border-radius: 4px;
        background: rgba(207,98,21,0.15);
        color: var(--accent, #cf6215);
      }
      .notif-date {
        font-size: 0.7rem;
        color: var(--fg3, #8b8f94);
      }
      .notif-title {
        font-size: 0.88rem;
        font-weight: 700;
        margin: 0 0 4px 0;
        color: var(--fg, #f4f4f5);
      }
      .notif-body-preview {
        font-size: 0.78rem;
        color: var(--fg2, #a1a1aa);
        margin: 0;
        line-height: 1.4;
      }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();
    loadState();
    injectDropdownItems();
    createNotificationsModal();
  }

  window.NotificationsCenter = {
    loadState,
    saveState,
    openNotifications: openNotificationsModal,
    markAllRead,
    handleNotifClick,
    setNotifFilter: (filter, btn) => {
      currentNotifFilter = filter;
      document.querySelectorAll('.notif-tab').forEach(b => b.classList.remove('active'));
      btn?.classList.add('active');
      renderNotificationsList();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.getElementById('userBadge')?.addEventListener('click', () => {
    setTimeout(injectDropdownItems, 20);
  });
})();
