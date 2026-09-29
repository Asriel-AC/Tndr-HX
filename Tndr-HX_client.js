// ==UserScript==
// @name         Tndr-HX
// @namespace    tm-tndr-hx-tools
// @version      1.2.0
// @description  Unendlich Emojis, Makros, Emoji-Dieb, Block+, Avatar Vault & Profil-Inspektor. Remote-Controlled by Python.
// @author       Asriel
// @license      GPL-3.0
// @match        https://tandro.de/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @connect      tandro.de
// @connect      api.github.com
// @allFrames    true
// ==/UserScript==

(function () {
  'use strict';

  const API_URL = "http://127.0.0.1:54321/api";
  const avatarHost = 'https://cyehwjytcqcjmsvprrgh.supabase.co/storage/v1/object/public/avatars/';
  const emojiHost = 'https://cyehwjytcqcjmsvprrgh.supabase.co/storage/v1/object/public/emojis/';
  const SCRIPT_VERSION = "1.3.1";

  function gmGet(k, d) { try { const v = localStorage.getItem(`tm_${k}`); return v ? JSON.parse(v) : d; } catch { return d; } }
  function gmSet(k, v) { try { localStorage.setItem(`tm_${k}`, JSON.stringify(v)); } catch {} }

  function getToken() {
      try {
          const raw = localStorage.getItem('auth') || localStorage.getItem('token');
          if (raw) {
              try { const parsed = JSON.parse(raw); return parsed.token || raw; }
              catch(e) { return raw; }
          }
      } catch(e) {}
      return null;
  }

  function getMyUserIdFromToken() {
      let token = getToken();
      if (!token) return null;
      try {
          let base64Url = token.split('.')[1];
          let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          let jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));
          let decoded = JSON.parse(jsonPayload);
          return decoded.userId || decoded.id || null;
      } catch(e) {
          return null;
      }
  }

  const state = {
    myUserId: null,
    currentRoomId: null,
    wsConnected: false,

    panelPos: gmGet('panel_pos', { left: null, top: null }),
    panelSize: gmGet('panel_size', { width: 380, height: 500 }),
    collapsed: gmGet('collapsed', true),
    searchTerm: '',
    seenEmojis: [],
    knownUsers: {},
    activeTab: 'emojis',
    backendConnected: false,

    localEmojis: [],
    nextLocalId: 10000,
    macros: [],
    blockedUsers: [],
    blockedWords: [],
    alertWords: [],

    afkMode: false,
    afkMessage: '',
    afkName: '',
    afkCooldown: 60,

    ownAvatars: [],
    myListings: []
  };

  const ui = {};
  const savedUploads = gmGet('uploaded_avatars', []);
  const uploadedAvatars = new Set(savedUploads);
  const seenAvatars = new Set();
  let audioCtx = null;

  function isNewerVersion(current, latest) {
      const v1 = current.split('.').map(Number);
      const v2 = latest.split('.').map(Number);
      for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
          const num1 = v1[i] || 0;
          const num2 = v2[i] || 0;
          if (num1 < num2) return true;
          if (num1 > num2) return false;
      }
      return false;
  }

  function checkForUpdates(manual = false) {
      const lastCheck = gmGet('last_update_check', 0);
      const now = Date.now();

      if (!manual && (now - lastCheck < 12 * 60 * 60 * 1000)) return;

      if (manual) showToast('Suche nach Updates...', 'info');

      GM_xmlhttpRequest({
          method: 'GET',
          url: 'https://api.github.com/repos/Asriel-AC/Tndr-HX/releases/latest',
          onload: function(res) {
              if (res.status === 200) {
                  try {
                      const data = JSON.parse(res.responseText);
                      let latestVersion = data.tag_name;
                      if (latestVersion.startsWith('v')) latestVersion = latestVersion.substring(1);

                      gmSet('last_update_check', now);

                      if (isNewerVersion(SCRIPT_VERSION, latestVersion)) {
                          const banner = document.getElementById('tm-update-banner');
                          const vSpan = document.getElementById('tm-update-version');
                          if (banner && vSpan) {
                              vSpan.textContent = latestVersion;
                              banner.style.display = 'block';
                              banner.onclick = () => window.open('https://github.com/Asriel-AC/Tndr-HX/releases/latest', '_blank');
                          }
                          if (manual) showToast(`Update auf v${latestVersion} verfügbar!`, 'success');
                      } else {
                          if (manual) showToast('Tndr-HX ist auf dem neuesten Stand!', 'success');
                      }
                  } catch(e) {
                      if (manual) showToast('Fehler beim Auslesen der GitHub API.', 'error');
                  }
              } else {
                  if (manual) showToast(`GitHub API Fehler: ${res.status}`, 'error');
              }
          },
          onerror: function() {
              if (manual) showToast('Netzwerkfehler beim Update-Check!', 'error');
          }
      });
  }

  function markAvatarAsOwned(url) {
    if (!url) return;
    if (!uploadedAvatars.has(url)) {
        uploadedAvatars.add(url);
        clearTimeout(window._saveUploadsTimeout);
        window._saveUploadsTimeout = setTimeout(() => {
            let arr = Array.from(uploadedAvatars);
            if (arr.length > 2000) arr = arr.slice(-2000);
            gmSet('uploaded_avatars', arr);
        }, 1000);
    }
  }

  function apiCall(endpoint, method = 'GET', payload = null) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: method,
        url: `${API_URL}${endpoint}`,
        headers: { "Content-Type": "application/json" },
        data: payload ? JSON.stringify(payload) : null,
        onload: (res) => {
          try { resolve(JSON.parse(res.responseText)); }
          catch(e) { reject("Parse Error"); }
        },
        onerror: reject
      });
    });
  }

  function GM_xmlhttpRequestPromise(opts) {
    return new Promise((resolve, reject) => {
        opts.onload = resolve;
        opts.onerror = reject;
        GM_xmlhttpRequest(opts);
    });
  }

  function updateSetting(key, value) {
    state[key] = value;
    apiCall('/action', 'POST', { action: 'update_setting', payload: { key, value } }).catch(() => {});
  }

  function emitWS(payloadString) {
    window.dispatchEvent(new CustomEvent('TndrHXSendWS', { detail: payloadString }));
  }

  function escapeHtml(text) {
      return (text||'').toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  async function silentUpdateKnownUsers() {
      let token = getToken();
      if(!token) return;
      try {
          let res = await GM_xmlhttpRequestPromise({
              method: 'GET',
              url: 'https://tandro.de/api/users/online',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          let data = JSON.parse(res.responseText);
          if(data.users) {
              let changed = false;
              data.users.forEach(u => {
                  const id = String(u.id);
                  // Priorität auf nickname setzen
                  const name = u.nickname || u.username;
                  if (id && name && state.knownUsers[id] !== name) {
                      state.knownUsers[id] = name;
                      changed = true;
                  }
              });
              if (changed && (state.activeTab === 'blocks' || state.activeTab === 'inspector')) {
                  renderUserDropdown();
              }
          }
      } catch(e) {}
  }

  async function inspectUser(userId) {
      if (!userId) return showToast('Keine User-ID angegeben!', 'error');
      let token = getToken();
      if (!token) return showToast('Fehler: Nicht eingeloggt!', 'error');

      const btn = document.getElementById('tm-inspect-btn');
      if (btn) btn.textContent = 'Lade Daten...';

      try {
          // 1. Basis-Informationen (AP, VIP, Avatar)
          const basicRes = await GM_xmlhttpRequestPromise({
              method: 'GET',
              url: `https://tandro.de/api/users/${userId}`,
              headers: { 'Authorization': `Bearer ${token}` }
          });
          const basicData = JSON.parse(basicRes.responseText);

          // 2. Profil-Informationen (Banner, Texte)
          const profRes = await GM_xmlhttpRequestPromise({
              method: 'GET',
              url: `https://tandro.de/api/users/${userId}/profile`,
              headers: { 'Authorization': `Bearer ${token}` }
          });
          const profData = JSON.parse(profRes.responseText);

          renderInspectorResult(basicData, profData);
      } catch (e) {
          showToast('Fehler beim Profil-Abruf (API Error)', 'error');
      }

      if (btn) btn.textContent = '🕵️ Profil inspizieren';
  }

  function renderInspectorResult(basic, profile) {
      const resDiv = document.getElementById('tm-inspector-result');
      if (!resDiv) return;

      const u = basic.user || {};
      const p = profile.profile || {};

      // Das echte Level ist "schoolrank", Klasse ist "roll"
      const userLevel = u.schoolrank || u.level || '?';
      const userClass = u.roll ? ` | Klasse: ${escapeHtml(u.roll)}` : '';

      const avatarUrl = basic.avatarUrl || (u.currentava ? `https://cyehwjytcqcjmsvprrgh.supabase.co/storage/v1/object/public/avatars/${u.currentava}` : '');
      const headerUrl = p.header_url || '';

      const motto = p.motto || '';
      const stadt = p.stadt || '';
      const anime = p.anime || '';
      const musik = p.musik || '';

      let html = `
          <div style="position:relative; margin-top:10px; border:1px solid var(--tm-border); border-radius:8px; overflow:hidden; background:var(--tm-surface);">
              <!-- Header -->
              <div style="height:90px; background-color:#202225; background-image:url('${escapeHtml(headerUrl)}'); background-size:cover; background-position:center; position:relative; cursor:pointer;" onclick="window.open('${escapeHtml(headerUrl)}', '_blank')" title="Klicken für volle Header-Auflösung">
                  ${!headerUrl ? '<span style="display:flex;align-items:center;justify-content:center;height:100%;font-size:11px;color:#aaa;">Kein Banner gesetzt</span>' : ''}
              </div>

              <!-- Avatar & Core Stats -->
              <div style="padding:10px; position:relative;">
                  <img src="${escapeHtml(avatarUrl)}" style="width:64px; height:64px; border-radius:8px; border:3px solid var(--tm-bg); position:absolute; top:-32px; left:10px; background:#222; cursor:pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.5);" onclick="window.open('${escapeHtml(avatarUrl)}', '_blank')" title="Avatar speichern">

                  <div style="margin-left:80px; margin-top:-5px;">
                      <div style="font-weight:bold; font-size:15px; color:white; display:flex; align-items:center; gap:6px;">
                          ${escapeHtml(u.nickname || u.username || 'Unbekannt')}
                          <span style="font-size:10px; color:#aaa; font-weight:normal;">(ID: ${u.id})</span>
                      </div>
                      <div style="font-size:11px; color:#3ba55c; font-weight:bold; margin-top:2px;">
                          ${u.is_vip ? '💎 VIP &nbsp; ' : ''}🌟 ${Number(u.activitypoints || 0).toLocaleString('de-DE')} Aktivitätspunkte
                      </div>
                      <div style="font-size:10px; color:var(--tm-text-muted); margin-top:2px;">
                          Level: ${userLevel}${userClass}
                      </div>
                  </div>

                  <!-- Text Details -->
                  <div style="margin-top:20px; font-size:11px; color:var(--tm-text); display:flex; flex-direction:column; gap:6px; background:rgba(0,0,0,0.2); padding:8px; border-radius:6px;">
                      ${motto ? `<div><strong style="color:var(--tm-primary);">Motto:</strong> ${escapeHtml(motto)}</div>` : ''}
                      ${stadt ? `<div><strong style="color:var(--tm-primary);">Stadt:</strong> ${escapeHtml(stadt)}</div>` : ''}
                      ${anime ? `<div><strong style="color:var(--tm-primary);">Anime:</strong> ${escapeHtml(anime)}</div>` : ''}
                      ${musik ? `<div><strong style="color:var(--tm-primary);">Musik:</strong> ${escapeHtml(musik)}</div>` : ''}
                      ${(!motto && !stadt && !anime && !musik) ? `<div style="opacity:0.5; text-align:center;">Profil ist komplett leer</div>` : ''}
                  </div>
              </div>
          </div>

          <!-- Raw JSON Expander -->
          <details style="margin-top:10px; background:var(--tm-surface); border:1px solid var(--tm-border); border-radius:8px; padding:6px 10px;">
              <summary style="cursor:pointer; font-size:11px; font-weight:500; color:var(--tm-primary); outline:none;">🗄️ Geheime JSON-Daten (Roh)</summary>
              <textarea class="tm-input" style="width:100%; height:150px; font-size:10px; font-family:monospace; margin-top:8px; background:#1e1e1e; border:none;" readonly>${escapeHtml(JSON.stringify({Basic: basic, Profil: profile}, null, 2))}</textarea>
          </details>
      `;
      resDiv.innerHTML = html;
      resDiv.style.display = 'flex';
  }

  async function fetchOwnAvatars() {
      let token = getToken();
      if (!token) return;
      const btn = document.getElementById('tm-fetch-wardrobe');
      if (btn) btn.textContent = 'Lade...';
      try {
          let res = await GM_xmlhttpRequestPromise({
              method: 'GET',
              url: 'https://tandro.de/api/avatars/list',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          let data = JSON.parse(res.responseText);
          if (data.avatars) {
              state.ownAvatars = data.avatars;
              data.avatars.forEach(av => { if (av.url) markAvatarAsOwned(av.url); });
              renderOwnAvatars();
              showToast('Kleiderschrank synchronisiert!', 'success');
          }
      } catch(e) { showToast('Fehler beim Laden der Avatare', 'error'); }
      if (btn) btn.textContent = '👗 Kleiderschrank laden';
  }

  async function fetchCurrency() {
      let token = getToken();
      if (!token) return;
      try {
          let res = await GM_xmlhttpRequestPromise({
              method: 'GET',
              url: 'https://tandro.de/api/users/currency',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          let data = JSON.parse(res.responseText);
          const apDisplay = document.getElementById('tm-ap-display');
          if (apDisplay && data.ap) {
              apDisplay.textContent = `${parseFloat(data.ap).toLocaleString('de-DE')} AP`;
          }
      } catch(e) {}
  }

  async function scanOnlineUsers() {
      let token = getToken();
      if(!token) return showToast('Fehler: Auth-Token fehlt!', 'error');

      const btn = document.getElementById('tm-scan-online');
      if(btn) btn.textContent = 'Scanne Server...';

      try {
          let res = await GM_xmlhttpRequestPromise({
              method: 'GET',
              url: 'https://tandro.de/api/users/online',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          let data = JSON.parse(res.responseText);
          let found = 0;
          if(data.users) {
              data.users.forEach(u => {
                  // Merken der IDs nebenbei
                  const id = String(u.id);
                  const name = u.nickname || u.username;
                  if (id && name && state.knownUsers[id] !== name) {
                      state.knownUsers[id] = name;
                  }

                  if(u.avatarUrl && !seenAvatars.has(u.avatarUrl) && !uploadedAvatars.has(u.avatarUrl)) {
                      addAvatarToUI(u.avatarUrl);
                      found++;
                  }
              });
          }
          showToast(found > 0 ? `${found} neue Avatare von Online-Usern extrahiert!` : 'Alle Online-Avatare sind bereits im Vault/Menü.', found > 0 ? 'success' : 'info');
      } catch(e) {
          showToast('API-Fehler beim Scannen der Online-User.', 'error');
      }
      if(btn) btn.textContent = '🌍 Online-User Scannen';
  }

  async function processAndUploadAvatar(url, manualClick = false) {
      if (uploadedAvatars.has(url)) {
          if(manualClick) showToast('Diesen Avatar hast du bereits (oder geklaut)!', 'info');
          return;
      }

      let token = getToken();
      let myId = getMyUserIdFromToken() || state.myUserId;
      if (!token || !myId) return showToast('Fehler: Auth-Daten (Token/ID) nicht gefunden!', 'error');

      uploadedAvatars.add(url);
      if(manualClick) showToast('Lade Avatar in deinen Vault...', 'info');

      try {
          const res = await GM_xmlhttpRequestPromise({ method: 'GET', url: url, responseType: 'blob' });
          const blob = res.response;
          const imageBitmap = await createImageBitmap(blob);
          const canvas = document.createElement('canvas');
          canvas.width = imageBitmap.width; canvas.height = imageBitmap.height;
          canvas.getContext('2d').drawImage(imageBitmap, 0, 0);

          let base64 = canvas.toDataURL('image/png');

          let payload = {
              image: base64,
              userId: myId
          };

          const upRes = await GM_xmlhttpRequestPromise({
              method: 'POST',
              url: 'https://tandro.de/api/avatars/upload',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              data: JSON.stringify(payload)
          });

          if (upRes.status >= 200 && upRes.status < 300) {
              showToast('🥷 Avatar erfolgreich gestohlen und gespeichert!', 'success');
              markAvatarAsOwned(url);
              if(state.activeTab === 'market') fetchOwnAvatars();
          } else {
              showToast(`Upload API abgelehnt: HTTP ${upRes.status}`, 'error');
              uploadedAvatars.delete(url);
          }
      } catch (e) {
          showToast('Systemfehler beim Auto-Upload.', 'error');
          uploadedAvatars.delete(url);
      }
  }

  async function sellAvatar(avatarObj, silent = false) {
      let token = getToken();
      if (!token) {
          if (!silent) showToast('Auth-Token nicht gefunden!', 'error');
          return false;
      }

      const priceInput = document.getElementById('tm-sell-price');
      const price = priceInput ? parseInt(priceInput.value) : 10;

      let payload = {
          useravatar_id: avatarObj.id,
          price: isNaN(price) ? 10 : price,
          categoryId: 20
      };

      if (!silent) showToast('Stelle in den Markt...', 'info');

      try {
          const upRes = await GM_xmlhttpRequestPromise({
              method: 'POST',
              url: 'https://tandro.de/api/marketplace/sell',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
              },
              data: JSON.stringify(payload)
          });

          if (upRes.status >= 200 && upRes.status < 300) {
              if (!silent) showToast('💰 Avatar erfolgreich auf dem Marktplatz!', 'success');
              state.ownAvatars = state.ownAvatars.filter(a => a.id !== avatarObj.id);
              renderOwnAvatars();
              return true;
          } else {
              if (!silent) showToast(`Verkauf fehlgeschlagen: HTTP ${upRes.status}`, 'error');
              return false;
          }
      } catch (e) {
          if (!silent) showToast('API-Fehler beim Auto-Sell.', 'error');
          return false;
      }
  }

  async function fetchMyListings(silent = false) {
      let token = getToken();
      let myId = getMyUserIdFromToken() || state.myUserId;
      if (!token || !myId) return;

      let allItems = [];
      const btn = document.getElementById('tm-load-market');
      if(btn && !silent) { btn.textContent = 'Scanne Markt...'; btn.disabled = true; }

      try {
          let maxPages = 30;
          for(let p = 1; p <= maxPages; p++) {
              if(btn && !silent) btn.textContent = `Scanne Seite ${p}...`;
              let res = await GM_xmlhttpRequestPromise({
                  method: 'GET',
                  url: `https://tandro.de/api/marketplace/list?page=${p}&limit=50&sortBy=newest`,
                  headers: { 'Authorization': `Bearer ${token}` }
              });

              let data = JSON.parse(res.responseText);
              if (data.totalPages && p === 1) maxPages = Math.min(data.totalPages, 50);

              let items = data.avatars || data.items || data.data || [];
              if (!items || items.length === 0) {
                  if (Array.isArray(data)) items = data;
                  else {
                      for (let key in data) {
                          if (Array.isArray(data[key]) && key !== 'categories') { items = data[key]; break; }
                      }
                  }
              }

              allItems = allItems.concat(items);
              if (!items || items.length < 10) break;
          }

          state.myListings = allItems.filter(i => {
              let uId = String(i.authorid || i.userId || i.user_id || i.sellerId || i.seller_id || (i.user && i.user.id) || (i.seller && i.seller.id) || "");
              return uId === String(myId);
          });

          if(!silent) renderMyListings();
          if(btn && !silent) { btn.textContent = '🔄 Angebote laden'; btn.disabled = false; }

          if (!silent) {
              if (state.myListings.length > 0) {
                  showToast(`${state.myListings.length} eigene Angebote gefunden!`, 'success');
              } else {
                  showToast(`Keine gefunden. Markt durchsucht (${allItems.length} Items).`, 'info');
              }
          }
      } catch(e) {
          if(!silent) {
              showToast('Fehler beim Laden des Marktes', 'error');
              if(btn) { btn.textContent = '🔄 Angebote laden'; btn.disabled = false; }
          }
      }
  }

  async function deleteListing(id) {
      let token = getToken();
      if (!token) return;
      try {
          await GM_xmlhttpRequestPromise({
              method: 'DELETE',
              url: `https://tandro.de/api/marketplace/${id}`,
              headers: { 'Authorization': `Bearer ${token}` }
          });
          state.myListings = state.myListings.filter(i => i.id !== id);
          renderMyListings();
          showToast('Angebot erfolgreich gelöscht!', 'success');
      } catch(e) { showToast('Fehler beim Löschen des Angebots.', 'error'); }
  }

  async function extendAllListings(silent = false) {
      if (!state.myListings || state.myListings.length === 0) {
          if(!silent) showToast('Keine Angebote geladen! Bitte zuerst scannen.', 'error');
          return;
      }
      let token = getToken();
      if (!token) return;

      const btn = document.getElementById('tm-extend-market');
      if (btn && !silent) { btn.disabled = true; btn.textContent = 'Pushe...'; btn.style.opacity = '0.7'; }

      const sortedListings = [...state.myListings].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      let successCount = 0;
      for (const item of sortedListings) {
          try {
              const res = await GM_xmlhttpRequestPromise({
                  method: 'POST',
                  url: `https://tandro.de/api/marketplace/extend/${item.id}`,
                  headers: { 'Authorization': `Bearer ${token}` }
              });
              if (res.status >= 200 && res.status < 300) { successCount++; }
          } catch(e) {}
          await new Promise(r => setTimeout(r, 350));
      }

      if (btn && !silent) { btn.disabled = false; btn.textContent = '🚀 Alle Pushen'; btn.style.opacity = '1'; }

      if (successCount > 0) {
          showToast(silent ? `🤖 Auto-Market: ${successCount} Angebote erfolgreich gepusht!` : `${successCount} Angebote gepusht!`, 'success');
          if (!silent) setTimeout(() => fetchMyListings(true), 1000);
      } else if (!silent) {
          showToast('Fehler beim Pushen der Angebote.', 'error');
      }
  }

  function injectWebSocketInterceptor() {
    const script = document.createElement('script');
    script.textContent = `(${function() {
      let blockedUsers = [];
      let blockedWords = [];

      window.addEventListener('TndrHXSyncBlocks', (e) => {
        blockedUsers = e.detail.users.map(String);
        blockedWords = e.detail.words;
      });

      window.addEventListener('TndrHXSendWS', (e) => {
        if (window.__tndrhxWS && window.__tndrhxWS.readyState === 1) {
            window.__tndrhxWS.send(e.detail);
        }
      });

      const origFetch = window.fetch;
      window.fetch = async function(...args) {
          const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
          const opts = args[1] || {};

          const response = await origFetch.apply(this, args);
          if (url.includes('/api/avatars') && (!opts.method || opts.method.toUpperCase() === 'GET')) {
              try {
                  const clone = response.clone();
                  clone.json().then(data => {
                      if (data && data.avatars) window.dispatchEvent(new CustomEvent('TndrHXOwnAvatars', { detail: JSON.stringify(data.avatars) }));
                  }).catch(e => {});
              } catch(e) {}
          }
          return response;
      };

      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url) { this._url = url; this._method = method; return origOpen.apply(this, arguments); };
      XMLHttpRequest.prototype.send = function(body) {
          this.addEventListener('load', function() {
              if (this._url && this._url.includes('/api/avatars') && this._method && this._method.toUpperCase() === 'GET') {
                  try {
                      const data = JSON.parse(this.responseText);
                      if (data && data.avatars) window.dispatchEvent(new CustomEvent('TndrHXOwnAvatars', { detail: JSON.stringify(data.avatars) }));
                  } catch(e) {}
              }
          });
          return origSend.apply(this, arguments);
      };

      const hasBlockedWord = (txt) => {
        if (!txt || typeof txt !== 'string') return false;
        return blockedWords.some(w => txt.toLowerCase().includes(w.toLowerCase()));
      };

      const scrubData = (obj) => {
        if (!obj || typeof obj !== 'object') return false;
        let modified = false;

        if (Array.isArray(obj)) {
          for (let i = 0; i < obj.length; i++) { if (scrubData(obj[i])) modified = true; }
          return modified;
        }

        const sId = String(obj.userId || obj.id || obj.senderId || '');
        const isBlocked = sId && blockedUsers.includes(sId);

        if (isBlocked) {
          if (obj.speechBubbleText !== undefined) { obj.speechBubbleText = ''; modified = true; }
          if (obj.message !== undefined) { obj.message = ''; modified = true; }
          if (obj.text !== undefined) { obj.text = ''; modified = true; }
        } else {
          if (obj.speechBubbleText !== undefined && hasBlockedWord(obj.speechBubbleText)) { obj.speechBubbleText = ''; modified = true; }
          if (obj.message !== undefined && hasBlockedWord(obj.message)) { obj.message = ''; modified = true; }
          if (obj.text !== undefined && hasBlockedWord(obj.text)) { obj.text = ''; modified = true; }
        }

        for (const key in obj) {
          if (typeof obj[key] === 'object') { if (scrubData(obj[key])) modified = true; }
        }
        return modified;
      };

      function processAndCheckDrop(eventDataString) {
        try {
          if (!eventDataString.startsWith('42')) return false;
          const parsed = JSON.parse(eventDataString.substring(2));
          if (!Array.isArray(parsed) || parsed.length < 2) return false;

          const eventName = parsed[0];
          const eventData = parsed[1];

          if (["updateChatLines", "existingUsers", "userListUpdate", "userJoinedUserList", "userChangedRoom", "newMessage", "joinRoom"].includes(eventName)) {
            window.dispatchEvent(new CustomEvent('TndrHXWSIntercept', { detail: JSON.stringify({ direction: 'in', event: eventName, data: eventData }) }));
          }

          if (scrubData(parsed[1])) return '42' + JSON.stringify(parsed);
        } catch (e) {}
        return false;
      }

      const OrigWebSocket = window.WebSocket;
      window.WebSocket = function(...args) {
        const ws = new OrigWebSocket(...args);
        window.__tndrhxWS = ws;
        ws.addEventListener('open', () => window.dispatchEvent(new CustomEvent('TndrHXWSState', {detail: 'open'})));
        ws.addEventListener('close', () => window.dispatchEvent(new CustomEvent('TndrHXWSState', {detail: 'close'})));

        const listenerMap = new WeakMap();
        const origAdd = ws.addEventListener;
        const origRemove = ws.removeEventListener;
        const origSend = ws.send;

        ws.send = function(data) {
          if (typeof data === 'string' && data.startsWith('42')) {
            try {
              const parsed = JSON.parse(data.substring(2));
              if (["sendChatLine", "newMessage", "joinRoom"].includes(parsed[0])) {
                window.dispatchEvent(new CustomEvent('TndrHXWSIntercept', { detail: JSON.stringify({ direction: 'out', event: parsed[0], data: parsed[1] }) }));
              }
            } catch(e) {}
          }
          return origSend.apply(this, arguments);
        };

        ws.addEventListener = function(type, listener, options) {
          if (type === 'message') {
            const wrapped = function(event) {
              if (typeof event.data === 'string' && event.data.startsWith('42')) {
                const result = processAndCheckDrop(event.data);
                if (result === true) return;
                if (typeof result === 'string') Object.defineProperty(event, 'data', { value: result, writable: false });
              }
              return listener.call(this, event);
            };
            listenerMap.set(listener, wrapped);
            return origAdd.call(this, type, wrapped, options);
          }
          return origAdd.call(this, type, listener, options);
        };

        ws.removeEventListener = function(type, listener, options) {
          if (type === 'message') listener = listenerMap.get(listener) || listener;
          return origRemove.call(this, type, listener, options);
        };

        let customOnMessage = null;
        let onMessageListener = null;

        Object.defineProperty(ws, 'onmessage', {
          set: function(func) {
            customOnMessage = func;
            if (!onMessageListener) {
              onMessageListener = function(event) {
                if (typeof event.data === 'string' && event.data.startsWith('42')) {
                  const result = processAndCheckDrop(event.data);
                  if (result === true) return;
                  if (typeof result === 'string') Object.defineProperty(event, 'data', { value: result, writable: false });
                }
                if (customOnMessage) customOnMessage.call(this, event);
              };
              origAdd.call(this, 'message', onMessageListener);
            }
          },
          get: function() { return customOnMessage; }
        });
        return ws;
      };
    }})();`;
    if (document.head || document.documentElement) {
      (document.head || document.documentElement).appendChild(script); script.remove();
    }
  }

  function injectInspectorButton(rootNode) {
      if (!rootNode || !rootNode.querySelectorAll) return;
      try {
          const nameEls = rootNode.querySelectorAll('.username, .name, .sender, span.font-medium');
          nameEls.forEach(el => {
              if (el.dataset.tmInspected) return;
              el.dataset.tmInspected = 'true';

              // Sauberes Extrahieren des Textes ohne Child-Elemente
              const userName = Array.from(el.childNodes)
                  .filter(node => node.nodeType === Node.TEXT_NODE)
                  .map(node => node.textContent)
                  .join('').trim();

              if (!userName) return;

              const btn = document.createElement('span');
              btn.innerHTML = '🕵️‍♀️';
              btn.style.cssText = 'cursor:pointer; font-size:12px; margin-left:4px; opacity:0; transition:opacity 0.2s; filter:grayscale(0.5);';
              btn.title = `Profil von ${escapeHtml(userName)} inspizieren`;

              const parentMsg = el.closest('[id^="message-"], .message, .chat-message, .log-item');
              if (parentMsg) {
                  parentMsg.addEventListener('mouseenter', () => btn.style.opacity = '1');
                  parentMsg.addEventListener('mouseleave', () => btn.style.opacity = '0');
              } else {
                  el.addEventListener('mouseenter', () => btn.style.opacity = '1');
                  el.addEventListener('mouseleave', () => btn.style.opacity = '0');
              }

              btn.onmouseenter = () => btn.style.filter = 'grayscale(0)';
              btn.onmouseleave = () => btn.style.filter = 'grayscale(0.5)';

              btn.onclick = (e) => {
                  e.preventDefault(); e.stopPropagation();
                  let targetId = null;

                  // Fehler-Tolerante Suche: Ignoriert Groß-/Kleinschreibung und Leerzeichen
                  const searchName = userName.toLowerCase().trim();
                  for (const [id, name] of Object.entries(state.knownUsers)) {
                      if (name.toLowerCase().trim() === searchName) {
                          targetId = id;
                          break;
                      }
                  }

                  if (targetId) {
                      const tab = document.querySelector('.tm-tab[data-tab="inspector"]');
                      if(tab) tab.click();
                      const sel = document.getElementById('tm-inspector-user-select');
                      if(sel) sel.value = targetId;
                      document.getElementById('tm-inspector-user-type').value = 'user_list';
                      document.getElementById('tm-inspector-user-select').style.display = 'block';
                      document.getElementById('tm-inspector-user-id').style.display = 'none';

                      inspectUser(targetId);

                      if(state.collapsed) document.getElementById('tm-collapsed-btn').click();
                  } else {
                      showToast(`User-ID für ${userName} noch nicht geladen!`, 'error');
                  }
              };

              el.parentNode.insertBefore(btn, el.nextSibling);
          });
      } catch(e) {}
  }

  function handleSeenEmojiInDOM(img) {
    const url = img.src;
    const msgEl = img.closest('[id^="message-"], [data-user-id], .message, .chat-message, .chat-line, .speech-bubble, .message-content, .msg, .log-item, .chat-log, .chat');
    if (!msgEl) return;

    if (img.parentNode && !img.parentNode.classList.contains('tm-emoji-wrapper')) {
        if (!state.localEmojis.some(em => em.dataUrl === url)) {
            const wrapper = document.createElement('span');
            wrapper.className = 'tm-emoji-wrapper';
            wrapper.style.cssText = 'position:relative; display:inline-block; margin: 0 2px;';

            const btn = document.createElement('button');
            btn.className = 'tm-steal-btn-inline';
            btn.textContent = '+';
            btn.title = 'Emoji klauen';
            btn.style.cssText = 'position:absolute; top:-6px; right:-8px; background:var(--tm-primary); color:white; border:none; border-radius:50%; width:18px; height:18px; font-size:14px; line-height:18px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity 0.2s; z-index:10; box-shadow: 0 2px 5px rgba(0,0,0,0.5); padding:0;';

            wrapper.onmouseenter = () => btn.style.opacity = '1';
            wrapper.onmouseleave = () => btn.style.opacity = '0';

            btn.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                addLocalEmoji(url, "geklaut_" + Math.floor(Math.random()*10000));
                btn.style.background = '#3ba55c'; btn.textContent = '✓';
                showToast('Gestohlen! 🥷', 'success');
                setTimeout(() => { if(btn) btn.remove(); }, 2000);
                state.seenEmojis = state.seenEmojis.filter(e => e.url !== url);
                renderEmojiDieb();
            };

            img.parentNode.insertBefore(wrapper, img);
            wrapper.appendChild(img);
            wrapper.appendChild(btn);
        }
    }

    if (!state.seenEmojis.some(em => em.url === url) && !state.localEmojis.some(em => em.dataUrl === url)) {
        let sender = 'Unbekannt';
        if (msgEl) {
            const nameEl = msgEl.querySelector('.username, .name, .sender, span.font-medium');
            if (nameEl) {
                sender = Array.from(nameEl.childNodes)
                    .filter(node => node.nodeType === Node.TEXT_NODE)
                    .map(node => node.textContent)
                    .join('').trim();
            }
        }
        state.seenEmojis.unshift({ url: url, sender: sender });
        if (state.seenEmojis.length > 50) state.seenEmojis.pop();
        if (state.activeTab === 'emojis') renderEmojiDieb();
    }
  }

  function addAvatarToUI(url) {
    if (uploadedAvatars.has(url)) return;
    if (seenAvatars.has(url)) return;

    seenAvatars.add(url);
    if (seenAvatars.size > 500) { const it = seenAvatars.values(); seenAvatars.delete(it.next().value); }

    const avatarList = document.getElementById('tm-avatar-list');
    if (!avatarList) return;

    const img = document.createElement('img');
    img.src = url;
    Object.assign(img.style, { width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--tm-border)', cursor: 'pointer', transition: 'transform 0.1s' });
    img.title = "Klicken zum manuellen Speichern in deinem Vault (EXIF-Clean)";
    img.onmouseenter = () => img.style.transform = 'scale(1.05)';
    img.onmouseleave = () => img.style.transform = 'scale(1)';

    img.addEventListener('click', () => { processAndUploadAvatar(url, true); });
    avatarList.appendChild(img);
  }

  function embedImageLinks(rootNode) {
      if (!rootNode || !rootNode.querySelectorAll) return;
      try {
          const links = rootNode.querySelectorAll('a');
          links.forEach(a => {
              if (a.dataset.tmEmbedded) return;
              const url = a.href;
              if (!url) return;

              const isImage = /\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i.test(url);
              if (isImage) {
                  a.dataset.tmEmbedded = 'true';
                  const img = document.createElement('img');
                  img.src = url;
                  img.style.cssText = 'display:block; max-width:250px; max-height:250px; border-radius:8px; margin-top:5px; border:1px solid rgba(255,255,255,0.1); cursor:pointer; box-shadow:0 4px 6px rgba(0,0,0,0.3);';
                  img.onclick = (e) => { e.preventDefault(); window.open(url, '_blank'); };
                  img.onerror = () => { img.style.display = 'none'; };
                  if (a.parentNode) {
                      a.parentNode.insertBefore(img, a.nextSibling);
                  }
              }
          });
      } catch (err) {}
  }

  function watchForAvatarsAndChat() {
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.id === 'tm-emoji-panel' || node.closest('#tm-emoji-panel')) continue;

          if (node.tagName === 'IMG') {
              if (node.src.startsWith(avatarHost)) addAvatarToUI(node.src);
              if (node.src.startsWith(emojiHost)) handleSeenEmojiInDOM(node);
          }
          else if (node.querySelectorAll) {
            node.querySelectorAll('img').forEach(img => {
                if (img.src.startsWith(avatarHost)) addAvatarToUI(img.src);
                if (img.src.startsWith(emojiHost)) handleSeenEmojiInDOM(img);
            });
            embedImageLinks(node);
            injectInspectorButton(node);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.querySelectorAll('img').forEach(img => {
        if (img.src.startsWith(avatarHost)) addAvatarToUI(img.src);
        if (img.src.startsWith(emojiHost)) handleSeenEmojiInDOM(img);
    });
    embedImageLinks(document.body);
    injectInspectorButton(document.body);
  }

  window.addEventListener('TndrHXWSState', (e) => { state.wsConnected = (e.detail === 'open'); updateStatus(); });

  window.addEventListener('TndrHXWSIntercept', (e) => {
    let payload;
    try { payload = JSON.parse(e.detail); } catch(err) { return; }

    if (payload.direction === 'in') {
        if (payload.event === 'existingUsers' && payload.data?.myself) {
            state.myUserId = String(payload.data.myself.id || payload.data.myself.userId);
            state.currentRoomId = payload.data.myself.currentRoomId;
            if (payload.data.myself.avatarUrl) markAvatarAsOwned(payload.data.myself.avatarUrl);
            updateStatus();
        }
        if (payload.event === 'userJoinedUserList' && payload.data) {
            if (String(payload.data.id) === state.myUserId) { state.currentRoomId = payload.data.currentRoomId; updateStatus(); }
        }
    }
    if (payload.direction === 'out') {
        if (payload.event === 'joinRoom' && payload.data?.room) { state.currentRoomId = payload.data.room; updateStatus(); }
        if (['newMessage', 'sendChatLine'].includes(payload.event) && payload.data) {
            if (payload.data.userId) state.myUserId = String(payload.data.userId);
            if (payload.data.room) state.currentRoomId = payload.data.room;
            updateStatus();
        }
    }

    if (payload.direction === 'in' && ["updateChatLines", "existingUsers", "userListUpdate", "userJoinedUserList", "userChangedRoom", "joinRoom"].includes(payload.event)) {
        let changed = false;
        const extract = (u) => {
          if (!u || typeof u !== 'object') return;
          const id = String(u.userId || u.id);
          // FIX: Nickname Priorität, da dieser mit Sonderzeichen gerendert wird
          const name = u.nickname || u.senderName || u.username || u.name;
          if (id && id !== 'undefined' && name && state.knownUsers[id] !== name) {
            state.knownUsers[id] = name; changed = true;
          }
        };
        if (Array.isArray(payload.data)) payload.data.forEach(extract);
        else if (typeof payload.data === 'object') {
          if (Array.isArray(payload.data.users)) payload.data.users.forEach(extract);
          else if (Array.isArray(payload.data.userList)) payload.data.userList.forEach(extract);
          else extract(payload.data);
        }
        if (changed && (state.activeTab === 'blocks' || state.activeTab === 'inspector')) renderUserDropdown();
    }

    apiCall('/ws', 'POST', { direction: payload.direction, event: payload.event, data: payload.data, myId: state.myUserId })
    .catch(() => {});
  });

  function playAlertSound() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.type = 'sine'; osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      osc.start(); gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.3);
      osc.stop(audioCtx.currentTime + 0.3);
    } catch(e) {}
  }

  function processFile(file, maxSize = 128) {
    return new Promise((resolve, reject) => {
      if (file.size > 5 * 1024 * 1024) return reject(new Error("Datei zu groß (Max 5MB)"));
      if (file.type === 'image/gif') {
        const reader = new FileReader(); reader.onload = e => resolve(e.target.result); reader.onerror = reject; reader.readAsDataURL(file); return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width, height = img.height;
          if (width > height) { if (width > maxSize) { height *= maxSize / width; width = maxSize; } }
          else { if (height > maxSize) { width *= maxSize / height; height = maxSize; } }
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/webp', 0.8));
        };
        img.onerror = reject; img.src = e.target.result;
      };
      reader.onerror = reject; reader.readAsDataURL(file);
    });
  }

  function addLocalEmoji(dataUrl, name) {
    if(!state.backendConnected) return showToast("Backend Offline!", "error");
    const id = String(state.nextLocalId++);
    const cleanName = name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || `emoji_${id}`;
    const payload = { id, name: cleanName, dataUrl };
    state.localEmojis.push(payload); renderGallery();
    apiCall('/action', 'POST', { action: 'add_emoji', payload });
  }

  function removeLocalEmoji(id) {
    state.localEmojis = state.localEmojis.filter(e => String(e.id) !== String(id)); renderGallery();
    apiCall('/action', 'POST', { action: 'remove_emoji', payload: id });
  }

  function sendEmoji(emojiId) {
    const id = String(emojiId).trim();
    if (!id || !state.wsConnected || !state.myUserId || !state.currentRoomId) return showToast('Fehler: Nicht verbunden!', 'error');
    const emoji = state.localEmojis.find(e => String(e.id) === id);
    if (!emoji) return false;

    const isAnimatedGif = emoji.dataUrl.includes('image/gif') || emoji.dataUrl.toLowerCase().includes('.gif');

    const payload = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`, room: parseInt(state.currentRoomId), userId: parseInt(state.myUserId),
      message: `:${id}: `, speechBubbleText: '', mentions: [], replyTo: null, isEmoji: true, isGif: isAnimatedGif, emojiUrl: emoji.dataUrl
    };
    emitWS('42' + JSON.stringify(['newMessage', payload]));
    showToast(`Gesendet :${id}:`, 'success');
  }

  function sendText(text) {
    if (!text || !state.wsConnected || !state.myUserId || !state.currentRoomId) return false;
    const payload = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`, room: parseInt(state.currentRoomId), userId: parseInt(state.myUserId),
      message: text, speechBubbleText: '', mentions: [], replyTo: null, isEmoji: false, isGif: false
    };
    emitWS('42' + JSON.stringify(['newMessage', payload]));
  }

  function showToast(message, type = 'info') {
    if (!ui.toastContainer) {
      ui.toastContainer = document.createElement('div'); ui.toastContainer.className = 'tm-toast-container'; document.body.appendChild(ui.toastContainer);
    }
    const toast = document.createElement('div'); toast.className = `tm-toast tm-toast-${type}`; toast.textContent = message;
    ui.toastContainer.appendChild(toast);
    void toast.offsetWidth;
    toast.style.opacity = '1'; toast.style.transform = 'translateY(0)';
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(10px)'; setTimeout(() => toast.remove(), 300); }, 2500);
  }

  function updateStatus() {
    if (!ui.status) return;
    const room = state.currentRoomId ? `📍 ${state.currentRoomId}` : '';
    ui.status.textContent = state.wsConnected ? `🟢 ${room}` : '🔴 Tandro Offline';
    ui.backendStatus.textContent = state.backendConnected ? '🐍 Backend OK' : '🐍 Backend Offline';
    ui.backendStatus.style.color = state.backendConnected ? '#3ba55c' : '#ed4245';

    const warningBanner = document.getElementById('tm-backend-warning');
    if (warningBanner) {
      warningBanner.style.display = state.backendConnected ? 'none' : 'block';
    }
  }

  function startHeartbeat() {
    setInterval(() => {
      apiCall('/ping', 'GET')
        .then(async () => {
          if (!state.backendConnected) { state.backendConnected = true; updateStatus(); showToast("Verbindung zum Backend hergestellt!", "success"); }
          try {
              const data = await apiCall('/state', 'GET');

              if (data.actions && data.actions.length > 0) {
                  data.actions.forEach(act => {
                      if (act.type === 'play_alert') playAlertSound();
                      if (act.type === 'send_message') setTimeout(() => sendText(act.text), 1500);
                      if (act.type === 'auto_extend_market') {
                          showToast('🤖 Auto-Market: Aktualisiere Angebote...', 'info');
                          fetchMyListings(true).then(() => extendAllListings(true));
                      }
                  });
              }

              delete data.actions;
              Object.assign(state, data);
              renderGallery(); renderMacros(); renderBlocks();
              window.dispatchEvent(new CustomEvent('TndrHXSyncBlocks', { detail: { users: state.blockedUsers, words: state.blockedWords } }));
          } catch(e) {}
        })
        .catch(() => {
          if (state.backendConnected) { state.backendConnected = false; updateStatus(); showToast("Warnung: Verbindung zum Backend verloren!", "error"); }
        });
    }, 2500);
  }

  function renderEmojiDieb() {
    const container = document.getElementById('tm-diebesgut-container');
    const list = document.getElementById('tm-diebesgut');
    if (!container || !list) return;
    if (state.seenEmojis.length === 0) { container.style.display = 'none'; return; }
    container.style.display = 'flex';
    list.innerHTML = '';

    for (const em of state.seenEmojis) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'min-width:48px;height:48px;position:relative;background:rgba(0,0,0,0.3);border-radius:6px;cursor:pointer;flex-shrink:0;border:1px solid rgba(255,255,255,0.1);';
      wrap.title = "Emoji klauen (von: " + escapeHtml(em.sender) + ")";
      const img = document.createElement('img'); img.src = em.url; img.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:6px;'; wrap.appendChild(img);
      const badge = document.createElement('div'); badge.textContent = '+'; badge.style.cssText = 'position:absolute;bottom:-4px;right:-4px;background:var(--tm-primary);color:white;border-radius:50%;width:16px;height:16px;font-size:12px;display:flex;align-items:center;justify-content:center;font-weight:bold;'; wrap.appendChild(badge);
      wrap.onclick = () => { addLocalEmoji(em.url, "geklaut_" + Math.floor(Math.random()*1000)); state.seenEmojis = state.seenEmojis.filter(e => e.url !== em.url); renderEmojiDieb(); showToast('Gestohlen! 🥷', 'success'); };
      list.appendChild(wrap);
    }
  }

  function renderGallery() {
    if (!ui.gallery) return;
    const term = state.searchTerm.toLowerCase();
    const emojis = state.localEmojis.filter(e => String(e.id).includes(term) || (e.name && e.name.toLowerCase().includes(term)));
    ui.gallery.innerHTML = '';

    if (state.localEmojis.length === 0) {
      ui.gallery.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;opacity:0.5;">✨ Ziehe Bilder hierher</div>'; return;
    }

    for (const emoji of emojis) {
      const card = document.createElement('div'); card.className = 'tm-card'; card.title = `Name: ${escapeHtml(emoji.name)}\nID: ${escapeHtml(emoji.id)}`;
      card.innerHTML = `
        <div class="tm-card-img"><img src="${emoji.dataUrl}" loading="lazy"></div>
        <div style="font-size:11px;opacity:0.8;text-align:center;font-weight:500;overflow:hidden;text-overflow:ellipsis;">:${escapeHtml(emoji.id)}:</div>
        <div style="display:flex;gap:4px;">
          <button class="tm-btn tm-btn-primary tm-send-btn" style="flex:1;padding:4px;font-size:12px;">📤</button>
          <button class="tm-btn tm-btn-danger tm-del-btn" style="flex:1;padding:4px;font-size:12px;">🗑️</button>
        </div>`;
      card.addEventListener('click', () => sendEmoji(emoji.id));
      card.querySelector('.tm-send-btn').onclick = (e) => { e.stopPropagation(); sendEmoji(emoji.id); };
      const delBtn = card.querySelector('.tm-del-btn');
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (delBtn.dataset.c === '1') removeLocalEmoji(emoji.id);
        else { delBtn.dataset.c = '1'; delBtn.textContent = '?'; setTimeout(() => { if (card.contains(delBtn)) { delBtn.dataset.c = '0'; delBtn.textContent = '🗑️'; } }, 2000); }
      };
      ui.gallery.appendChild(card);
    }
  }

  function renderOwnAvatars() {
      const list = document.getElementById('tm-own-avatar-list');
      if (!list) return;
      list.innerHTML = '';
      if (!state.ownAvatars || state.ownAvatars.length === 0) {
          list.innerHTML = '<div style="opacity:0.5;font-size:11px;padding:4px;">Klicke auf \'Kleiderschrank laden\', um deine Avatare zu sehen.</div>';
          return;
      }

      state.ownAvatars.forEach(av => {
          if(!av.url) return;
          const img = document.createElement('img');
          img.src = av.url;
          Object.assign(img.style, { width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--tm-border)', cursor: 'pointer', transition: 'transform 0.1s' });
          img.title = "Klicken zum Verkauf auf dem Marktplatz";
          img.onmouseenter = () => img.style.transform = 'scale(1.05)';
          img.onmouseleave = () => img.style.transform = 'scale(1)';
          img.addEventListener('click', () => { sellAvatar(av); });
          list.appendChild(img);
      });
  }

  function renderMyListings() {
      const list = document.getElementById('tm-market-listings');
      if (!list) return;
      list.innerHTML = '';
      if (!state.myListings || state.myListings.length === 0) {
          list.innerHTML = '<div style="opacity:0.5;font-size:11px;padding:4px;">Keine aktiven Angebote gefunden oder noch nicht geladen.</div>';
          return;
      }

      const displayListings = [...state.myListings].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      displayListings.forEach(item => {
          const id = item.id;
          const price = item.price || item.costs || item.amount || "?";
          const imgUrl = item.watermarkedurl || item.url || (item.avatar && item.avatar.url) || (item.useravatar && item.useravatar.url) || item.image || "";

          let timeStr = "";
          if (item.timestamp) {
              const expirationTime = item.timestamp + (7 * 24 * 60 * 60 * 1000);
              const diff = expirationTime - Date.now();

              if (diff > 0) {
                  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                  const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
                  const m = Math.floor((diff / 1000 / 60) % 60);
                  const s = Math.floor((diff / 1000) % 60);

                  if (d > 0) timeStr = `${d}T ${h}h ${m}m ${s}s`;
                  else if (h > 0) timeStr = `${h}h ${m}m ${s}s`;
                  else if (m > 0) timeStr = `${m}m ${s}s`;
                  else timeStr = `${s}s`;
              } else {
                  timeStr = "Abgelaufen";
              }
          }

          const div = document.createElement('div');
          div.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.2);padding:4px 8px;border-radius:6px;margin-bottom:4px;border:1px solid rgba(255,255,255,0.05);';

          const imgHtml = imgUrl ? '<img src="' + escapeHtml(imgUrl) + '" style="width:32px;height:32px;border-radius:4px;object-fit:cover;">' : '<div style="width:32px;height:32px;background:#333;border-radius:4px;"></div>';

          div.innerHTML = `
              <div style="display:flex;align-items:center;gap:8px;">
                  ${imgHtml}
                  <div style="display:flex;flex-direction:column;">
                      <span style="font-size:12px;font-weight:bold;color:#3ba55c;">${escapeHtml(price)} AP</span>
                      ${timeStr ? `<span style="font-size:9px;color:#aaa;margin-top:-2px;">⏳ ${timeStr}</span>` : ''}
                  </div>
              </div>
              <button class="tm-btn tm-btn-danger" style="padding:4px 8px;font-size:11px;">Entfernen</button>
          `;
          div.querySelector('button').onclick = () => deleteListing(id);
          list.appendChild(div);
      });
  }

  function injectStyles() {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      :root { --tm-bg: rgba(30, 30, 35, 0.95); --tm-blur: blur(12px); --tm-primary: #5865f2; --tm-primary-hover: #4752c4; --tm-danger: #ed4245; --tm-danger-hover: #c9383b; --tm-border: rgba(88, 101, 242, 0.2); --tm-text: #e1e1e1; --tm-text-muted: #b0b0b0; --tm-surface: rgba(255, 255, 255, 0.04); --tm-surface-hover: rgba(88, 101, 242, 0.08); }
      #tm-emoji-panel { position: fixed; background: var(--tm-bg); backdrop-filter: var(--tm-blur); color: var(--tm-text); font-family: 'Inter', system-ui, sans-serif; font-size: 13px; border-radius: 14px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); border: 1px solid var(--tm-border); display: flex; flex-direction: column; z-index: 2147483646; overflow: hidden; resize: both; }
      #tm-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: grab; user-select: none; background: rgba(255,255,255,0.02); }
      .tm-tabs { display: flex; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); overflow-x: auto; scrollbar-width: none;}
      .tm-tab { padding: 10px 12px; cursor: pointer; color: var(--tm-text-muted); border-bottom: 2px solid transparent; font-weight: 500; font-size: 12px; transition: all 0.2s; white-space: nowrap; flex: 1; text-align: center; }
      .tm-tab:hover { color: white; background: var(--tm-surface); }
      .tm-tab.active { color: var(--tm-primary); border-bottom-color: var(--tm-primary); }
      .tm-tab-content { display: none; flex-direction: column; flex: 1; min-height: 0; padding: 14px; overflow-y: auto; }
      .tm-tab-content.active { display: flex; }
      .tm-tab-content::-webkit-scrollbar { width: 6px; } .tm-tab-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
      .tm-btn { padding: 8px; border-radius: 8px; border: none; font-weight: 500; cursor: pointer; transition: all 0.15s; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
      .tm-btn-primary { background: var(--tm-primary); color: white; } .tm-btn-primary:hover { background: var(--tm-primary-hover); }
      .tm-btn-danger { background: var(--tm-danger); color: white; } .tm-btn-danger:hover { background: var(--tm-danger-hover); }
      .tm-btn-outline { background: var(--tm-surface); color: var(--tm-text); border: 1px solid rgba(255,255,255,0.1); } .tm-btn-outline:hover { background: rgba(255,255,255,0.1); }
      .tm-input { width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: white; font-size: 13px; outline: none; box-sizing: border-box; }
      .tm-input:focus { border-color: var(--tm-primary); }
      #tm-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px; align-content: start; }
      .tm-card { background: var(--tm-surface); border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 6px; cursor: pointer; border: 1px solid var(--tm-border); position: relative; }
      .tm-card:hover { transform: translateY(-2px); background: var(--tm-surface-hover); }
      .tm-card-img { width: 100%; aspect-ratio: 1/1; border-radius: 8px; overflow: hidden; background: rgba(0,0,0,0.25); display: flex; align-items: center; justify-content: center; position: relative; }
      .tm-card-img img { width: 100%; height: 100%; object-fit: contain; }
      .tm-toast-container { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 10px; z-index: 2147483647; pointer-events: none; }
      .tm-toast { padding: 8px 16px; border-radius: 20px; color: white; font-weight: 500; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: all 0.3s; opacity: 0; transform: translateY(10px); }
      .tm-toast-success { background: #3ba55c; } .tm-toast-error { background: #ed4245; } .tm-toast-info { background: var(--tm-primary); }
      #tm-dropzone { position: absolute; inset: 0; background: rgba(88, 101, 242, 0.9); backdrop-filter: blur(4px); display: none; align-items: center; justify-content: center; flex-direction: column; font-size: 18px; font-weight: bold; color: white; z-index: 10; border-radius: 12px; border: 2px dashed white; margin: 10px; }
      #tm-emoji-panel.tm-dragover #tm-dropzone { display: flex; }
    `;
    document.head.appendChild(styleSheet);
  }

  function renderMacros() {
    const list = document.getElementById('tm-macro-list'); if (!list) return;
    list.innerHTML = '';
    if (state.macros.length === 0) { list.innerHTML = '<div style="opacity:0.5;text-align:center;padding:20px;">Keine Makros gespeichert.</div>'; return; }
    for (const m of state.macros) {
      const card = document.createElement('div'); card.style.cssText = 'background:var(--tm-surface);border:1px solid var(--tm-border);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px;';
      card.innerHTML = `<div style="font-weight:bold;color:var(--tm-primary);">${escapeHtml(m.title)}</div><div style="font-size:11px;opacity:0.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:rgba(0,0,0,0.2);padding:4px;border-radius:4px;">${escapeHtml(m.text)}</div>`;
      const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:4px;margin-top:4px;';
      const sendBtn = document.createElement('button'); sendBtn.className = 'tm-btn tm-btn-primary'; sendBtn.style.flex = '1'; sendBtn.textContent = '📤 In Chat senden';
      sendBtn.onclick = () => sendText(m.text);
      const delBtn = document.createElement('button'); delBtn.className = 'tm-btn tm-btn-danger'; delBtn.style.padding = '0 10px'; delBtn.textContent = '🗑️️';
      delBtn.onclick = () => { state.macros = state.macros.filter(x => String(x.id) !== String(m.id)); renderMacros(); apiCall('/action', 'POST', {action: 'remove_macro', payload: m.id}); };
      row.appendChild(sendBtn); row.appendChild(delBtn); card.appendChild(row); list.appendChild(card);
    }
  }

  function renderBlocks() {
    const list = document.getElementById('tm-block-list');
    if (!list) return;
    list.innerHTML = '';
    if (state.blockedUsers.length === 0 && state.blockedWords.length === 0) {
      list.innerHTML = '<div style="opacity:0.5;text-align:center;padding:20px;">Die Blockliste ist leer.</div>';
      return;
    }
    const createItem = (type, value) => {
      const div = document.createElement('div');
      div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:var(--tm-surface);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);margin-bottom:4px;';
      let disp = escapeHtml(value);
      if (type === 'User' && state.knownUsers[value]) disp = `${escapeHtml(state.knownUsers[value])} (${escapeHtml(value)})`;
      div.innerHTML = `<div><span style="opacity:0.6;font-size:11px;margin-right:6px;background:rgba(0,0,0,0.3);padding:2px 4px;border-radius:4px;">${type}</span><span style="font-weight:500;">${disp}</span></div>`;
      const delBtn = document.createElement('button');
      delBtn.className = 'tm-btn tm-btn-danger';
      delBtn.style.padding = '4px 8px';
      delBtn.textContent = 'Freigeben';
      delBtn.onclick = () => {
        if (type === 'User') { state.blockedUsers = state.blockedUsers.filter(u => String(u) !== String(value)); updateSetting('blockedUsers', state.blockedUsers); }
        if (type === 'Wort') { state.blockedWords = state.blockedWords.filter(w => w !== value); updateSetting('blockedWords', state.blockedWords); }
        renderBlocks();
        window.dispatchEvent(new CustomEvent('TndrHXSyncBlocks', { detail: { users: state.blockedUsers, words: state.blockedWords } }));
      };
      div.appendChild(delBtn);
      list.appendChild(div);
    };
    state.blockedUsers.forEach(u => createItem('User', u));
    state.blockedWords.forEach(w => createItem('Wort', w));
  }

  function renderUserDropdown() {
    const selects = [document.getElementById('tm-block-user-select'), document.getElementById('tm-inspector-user-select')];
    selects.forEach(select => {
        if (!select) return;
        const currentVal = select.value; select.innerHTML = '';
        const users = Object.entries(state.knownUsers);
        if (users.length === 0) { select.innerHTML = '<option value="">(Bisher keine User erkannt)</option>'; return; }
        for (const [id, name] of users) {
            const opt = document.createElement('option');
            opt.value = escapeHtml(id);
            opt.textContent = `${escapeHtml(name)} (ID: ${escapeHtml(id)})`;
            select.appendChild(opt);
        }
        if (currentVal && state.knownUsers[currentVal]) select.value = currentVal;
    });
  }

  function createUI() {
    injectStyles();

    function setCollapsed(c) {
      state.collapsed = c; gmSet('collapsed', c);
      ui.panel.style.display = c ? 'none' : 'flex';
    }

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'tm-collapsed-btn';
    Object.assign(toggleBtn.style, { position: 'fixed', top: '1px', left: '1px', zIndex: '2147483647', width: '60px', height: '60px', padding: '0', border: 'none', borderRadius: '6px', cursor: 'pointer', backgroundColor: 'transparent', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' });
    toggleBtn.innerHTML = '<img src="https://i.ibb.co/BKwQLg9P/logo-small-4.png" style="width:100%;height:100%;border-radius:6px;">';
    toggleBtn.title = 'Tndr-HX Panel umschalten';
    toggleBtn.onclick = () => setCollapsed(ui.panel.style.display !== 'none');
    toggleBtn.onmouseenter = () => toggleBtn.style.filter = 'brightness(0.8)';
    toggleBtn.onmouseleave = () => toggleBtn.style.filter = 'none';
    document.body.appendChild(toggleBtn);

    const panel = document.createElement('div');
    panel.id = 'tm-emoji-panel';
    let { left, top } = state.panelPos;
    if (typeof left === 'number' && typeof top === 'number') { panel.style.left = Math.max(0, Math.min(left, window.innerWidth - 100)) + 'px'; panel.style.top = Math.max(0, Math.min(top, window.innerHeight - 100)) + 'px'; }
    else { panel.style.right = '20px'; panel.style.bottom = '20px'; }
    panel.style.width = Math.max(280, state.panelSize.width) + 'px'; panel.style.height = Math.max(450, state.panelSize.height) + 'px';

    panel.innerHTML = `
      <div id="tm-dropzone"><span style="font-size:32px;margin-bottom:10px;">📥</span>Bilder hier ablegen</div>
      <div id="tm-update-banner" style="display:none; background: #3ba55c; color:white; padding:8px; font-size:12px; text-align:center; font-weight:bold; cursor:pointer; border-bottom:1px solid rgba(0,0,0,0.2);">
        🚀 Tndr-HX Update auf v<span id="tm-update-version"></span> verfügbar! (Hier klicken)
      </div>
      <div id="tm-header">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-weight:600;color:#fff;">Tndr-HX</span>
          <span id="tm-status" style="font-size:11px;opacity:0.7;"></span>
          <span id="tm-backend-status" style="font-size:11px;font-weight:bold;margin-left:5px;"></span>
        </div>
        <div style="display:flex;gap:4px;">
          <button id="tm-check-update" class="tm-btn tm-btn-outline" style="padding:4px;" title="Nach Updates suchen">🔄</button>
          <button id="tm-minimize" class="tm-btn tm-btn-outline" style="padding:4px 8px;">−</button>
        </div>
      </div>
      <div id="tm-backend-warning" style="display:none; background:var(--tm-danger); color:white; padding:6px; font-size:11px; text-align:center;">
        ⚠️ Python-Backend fehlt! <a href="https://github.com/Asriel-AC/Tndr-HX/blob/main/Tndr-HX_backend.py" target="_blank" style="color:white; text-decoration:underline; font-weight:bold;">Hier herunterladen</a>
      </div>
      <div class="tm-tabs">
        <div class="tm-tab active" data-tab="emojis">🖼️ Emojis</div>
        <div class="tm-tab" data-tab="avatars">🥷 Klauen</div>
        <div class="tm-tab" data-tab="market">💰 Markt</div>
        <div class="tm-tab" data-tab="inspector">🕵️ Profil</div>
        <div class="tm-tab" data-tab="macros">📝 Makros</div>
        <div class="tm-tab" data-tab="blocks">🚷 Block+</div>
      </div>

      <div id="tab-emojis" class="tm-tab-content active">
        <div id="tm-diebesgut-wrapper">
            <div id="tm-diebesgut-container" style="display:none; flex-direction:column; gap:6px; margin-bottom:12px; background:rgba(88,101,242,0.1); border:1px solid var(--tm-border); padding:8px; border-radius:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="font-weight:600;color:var(--tm-primary);font-size:11px;">🥷 Emoji-Dieb (Zuletzt entdeckt)</div>
                <button id="tm-steal-all" class="tm-btn tm-btn-primary" style="padding:2px 6px;font-size:10px;">Alle klauen</button>
              </div>
              <div id="tm-diebesgut" style="display:flex; gap:8px; overflow-x:auto; padding-bottom:4px;"></div>
            </div>
        </div>
        <details style="border:1px solid var(--tm-border);border-radius:10px;padding:10px;background:var(--tm-surface);margin-bottom:14px;">
          <summary style="cursor:pointer;font-weight:500;color:var(--tm-primary);outline:none;">⚙️ Lokaler Upload</summary>
          <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">
            <input type="file" id="tm-local-file" accept="image/*,image/gif" multiple style="display:none;">
            <button id="tm-select-local" class="tm-btn tm-btn-primary">📁 Bilder hochladen (oder Drag & Drop)</button>
            <button id="tm-delete-all-btn" class="tm-btn tm-btn-danger" style="margin-top:4px;" data-step="0">🗑️ Alle Emojis löschen</button>
          </div>
        </details>
        <div style="display:flex;flex-direction:column;flex:1;min-height:0;gap:8px;">
          <input type="text" id="tm-search" class="tm-input" placeholder="🔍 Emojis durchsuchen...">
          <div id="tm-gallery" style="overflow-y:auto;flex:1;padding:4px;"></div>
        </div>
      </div>

      <div id="tab-avatars" class="tm-tab-content">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
            <div>
                <div style="font-weight:600;color:var(--tm-primary);margin-bottom:4px;">🥷 Geklaute Avatare (In Vault speichern)</div>
                <div style="font-size:11px;color:var(--tm-text-muted);">Die API ist voll integriert. Klicke einfach hier auf gefundene Avatare im Chat, um sie zu speichern.</div>
            </div>
            <button id="tm-scan-online" class="tm-btn tm-btn-outline" style="padding:4px 8px;font-size:11px;white-space:nowrap;margin-left:8px;">🌍 Online-User Scannen</button>
        </div>
        <div id="tm-avatar-list" style="display:flex;flex-wrap:wrap;gap:8px;flex:1;min-height:0;overflow-y:auto;align-content:start;margin-bottom:4px;background:rgba(0,0,0,0.2);padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.05);"></div>
      </div>

      <div id="tab-market" class="tm-tab-content">
        <div style="background:rgba(0,0,0,0.2);padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.05);margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div style="font-weight:600;color:#3ba55c;">💰 Schnellverkauf</div>
              <div style="font-weight:bold;color:var(--tm-primary);font-size:12px;" id="tm-ap-display">Lade AP...</div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:11px;">Preis:</span>
                <input type="number" id="tm-sell-price" class="tm-input" value="10" style="width:60px;padding:4px;height:24px;text-align:center;">
              </div>
              <button id="tm-fetch-wardrobe" class="tm-btn tm-btn-outline" style="padding:2px 8px;font-size:11px;">👗 Kleiderschrank laden</button>
            </div>
            <button id="tm-sell-all" class="tm-btn tm-btn-primary" style="width:100%;margin-bottom:8px;">🛍️ Alle eigenen Avatare verkaufen</button>
            <div id="tm-own-avatar-list" style="display:flex;flex-wrap:wrap;gap:8px;overflow-y:auto;max-height:120px;align-content:start;">
               <div style="opacity:0.5;font-size:11px;padding:4px;">Klicke auf 'Kleiderschrank laden', um deine Avatare anzuzeigen.</div>
            </div>
        </div>

        <div style="display:flex;flex-direction:column;flex:1;min-height:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div style="font-weight:600;color:var(--tm-primary);">📈 Meine aktiven Angebote</div>
                <div style="display:flex;gap:4px;">
                  <button id="tm-extend-market" class="tm-btn tm-btn-primary" style="padding:2px 8px;font-size:11px;">🚀 Alle Pushen</button>
                  <button id="tm-load-market" class="tm-btn tm-btn-outline" style="padding:2px 8px;font-size:11px;">🔄 Laden</button>
                </div>
            </div>
            <div id="tm-market-listings" style="flex:1;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:8px;padding:8px;border:1px solid rgba(255,255,255,0.05);">
                <div style="opacity:0.5;font-size:11px;padding:4px;text-align:center;">Klicke auf 'Laden', um den Markt zu scannen.</div>
            </div>
        </div>
      </div>

      <!-- Profil-Inspektor Tab -->
      <div id="tab-inspector" class="tm-tab-content">
        <div style="background:var(--tm-surface);border:1px solid var(--tm-border);padding:10px;border-radius:10px;margin-bottom:14px;">
          <select id="tm-inspector-user-type" class="tm-input" style="margin-bottom:8px; padding:8px;">
            <option value="user_list">👤 Aus Raumliste wählen</option>
            <option value="user_manual">✍️ Manuelle ID eingeben</option>
          </select>
          <div style="display:flex; gap:8px; margin-bottom:8px;">
            <select id="tm-inspector-user-select" class="tm-input" style="flex:1;"><option value="">(Bisher keine User geredet)</option></select>
            <input type="text" id="tm-inspector-user-id" class="tm-input" placeholder="ID eingeben..." style="flex:1; display:none;">
          </div>
          <button id="tm-inspect-btn" class="tm-btn tm-btn-primary" style="width:100%;">🕵️ Profil inspizieren</button>
        </div>
        <div id="tm-inspector-result" style="display:none; flex-direction:column; flex:1; overflow-y:auto; padding-bottom:10px;"></div>
      </div>

      <div id="tab-macros" class="tm-tab-content">
        <div style="background:var(--tm-surface);border:1px solid var(--tm-border);padding:10px;border-radius:10px;margin-bottom:14px;">
          <input type="text" id="tm-macro-title" class="tm-input" placeholder="Titel (z.B. RP Begrüßung)" style="margin-bottom:8px;">
          <textarea id="tm-macro-text" class="tm-input" placeholder="Text oder ASCII-Art..." style="height:60px;resize:none;margin-bottom:8px;"></textarea>
          <button id="tm-add-macro" class="tm-btn tm-btn-primary" style="width:100%;">📝 Makro speichern</button>
        </div>
        <div id="tm-macro-list" style="display:flex;flex-direction:column;gap:8px;overflow-y:auto;flex:1;"></div>
      </div>

      <div id="tab-blocks" class="tm-tab-content">
        <div style="background:var(--tm-surface);border:1px solid var(--tm-border);padding:10px;border-radius:10px;margin-bottom:14px;">
          <select id="tm-block-type" class="tm-input" style="margin-bottom:8px; padding:8px;">
            <option value="user_list">👤 User (Aus Raumliste wählen)</option>
            <option value="user_manual">✍️ User (Manuelle ID eingeben)</option>
            <option value="word">🔤 Wort / Satz blockieren</option>
          </select>
          <div style="display:flex; gap:8px; margin-bottom:8px;">
            <select id="tm-block-user-select" class="tm-input" style="flex:1;"><option value="">(Bisher keine User geredet)</option></select>
            <input type="text" id="tm-block-input" class="tm-input" placeholder="ID eingeben..." style="flex:1; display:none;">
          </div>
          <button id="tm-add-block" class="tm-btn tm-btn-danger" style="width:100%;">🚷 Blockieren</button>
        </div>
        <div id="tm-block-list" style="display:flex;flex-direction:column;gap:8px;overflow-y:auto;flex:1;"></div>
      </div>
      <div id="tm-resize-handle" style="position: absolute; bottom: 0; right: 0; width: 16px; height: 16px; cursor: nwse-resize; z-index:20;"></div>
    `;

    document.body.appendChild(panel);
    ui.panel = panel; ui.status = panel.querySelector('#tm-status'); ui.backendStatus = panel.querySelector('#tm-backend-status'); ui.gallery = panel.querySelector('#tm-gallery'); ui.header = panel.querySelector('#tm-header');

    panel.querySelector('#tm-check-update').addEventListener('click', () => checkForUpdates(true));

    const tabs = panel.querySelectorAll('.tm-tab');
    const contents = panel.querySelectorAll('.tm-tab-content');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active')); contents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active'); document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active'); state.activeTab = tab.dataset.tab;

        if (state.activeTab === 'emojis') { renderEmojiDieb(); renderGallery(); }
        if (state.activeTab === 'macros') renderMacros();
        if (state.activeTab === 'blocks' || state.activeTab === 'inspector') renderUserDropdown();
        if (state.activeTab === 'blocks') renderBlocks();
        if (state.activeTab === 'market') {
            renderOwnAvatars();
            renderMyListings();
            fetchCurrency();
            if(state.ownAvatars.length === 0) fetchOwnAvatars();
        }
      });
    });

    panel.querySelector('#tm-scan-online').addEventListener('click', scanOnlineUsers);
    panel.querySelector('#tm-fetch-wardrobe').addEventListener('click', () => {
        fetchOwnAvatars();
        fetchCurrency();
    });

    panel.querySelector('#tm-load-market').addEventListener('click', () => fetchMyListings(false));
    panel.querySelector('#tm-extend-market').addEventListener('click', () => extendAllListings(false));

    panel.querySelector('#tm-sell-all').addEventListener('click', async (e) => {
        if (!state.ownAvatars || state.ownAvatars.length === 0) return showToast('Kleiderschrank leer! Bitte zuerst laden.', 'error');

        const btn = e.target;
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = 'Verkaufe... (Bitte warten)';
        btn.style.opacity = '0.7';

        const avatarsToSell = [...state.ownAvatars];
        let soldCount = 0;

        for (const av of avatarsToSell) {
            const success = await sellAvatar(av, true);
            if (success) soldCount++;
            await new Promise(res => setTimeout(res, 350));
        }

        btn.disabled = false;
        btn.textContent = originalText;
        btn.style.opacity = '1';

        if (soldCount > 0) {
            showToast(`Erfolgreich ${soldCount} Avatare auf den Markt gestellt! 💰`, 'success');
            setTimeout(() => fetchMyListings(false), 1000);
        } else {
            showToast('Keine Avatare verkauft.', 'error');
        }
    });

    // Inspector Events
    const inspectType = panel.querySelector('#tm-inspector-user-type');
    const inspectUserSelect = panel.querySelector('#tm-inspector-user-select');
    const inspectTextInput = panel.querySelector('#tm-inspector-user-id');

    inspectType.addEventListener('change', () => {
      if (inspectType.value === 'user_list') { inspectUserSelect.style.display = 'block'; inspectTextInput.style.display = 'none'; }
      else { inspectUserSelect.style.display = 'none'; inspectTextInput.style.display = 'block'; }
    });

    panel.querySelector('#tm-inspect-btn').addEventListener('click', () => {
      const val = inspectType.value === 'user_list' ? inspectUserSelect.value : inspectTextInput.value.trim();
      inspectUser(val);
    });

    panel.querySelector('#tm-add-macro').addEventListener('click', () => {
      const title = panel.querySelector('#tm-macro-title').value.trim(); const text = panel.querySelector('#tm-macro-text').value.trim();
      if (!title || !text) return showToast('Bitte ausfüllen!', 'error');
      const macro = { id: Date.now().toString(), title, text }; state.macros.push(macro); renderMacros(); apiCall('/action', 'POST', {action: 'save_macro', payload: macro});
      panel.querySelector('#tm-macro-title').value = ''; panel.querySelector('#tm-macro-text').value = ''; showToast('Gespeichert', 'success');
    });

    const blockType = panel.querySelector('#tm-block-type'); const userSelect = panel.querySelector('#tm-block-user-select'); const textInput = panel.querySelector('#tm-block-input');
    blockType.addEventListener('change', () => {
      if (blockType.value === 'user_list') { userSelect.style.display = 'block'; textInput.style.display = 'none'; }
      else { userSelect.style.display = 'none'; textInput.style.display = 'block'; textInput.placeholder = blockType.value === 'user_manual' ? 'ID eingeben...' : 'Wort eingeben...'; }
    });
    panel.querySelector('#tm-add-block').addEventListener('click', () => {
      const val = blockType.value === 'user_list' ? userSelect.value : textInput.value.trim(); if (!val) return showToast('Eingabe leer!', 'error');
      if (blockType.value.startsWith('user')) { if (!state.blockedUsers.includes(val)) { state.blockedUsers.push(val); updateSetting('blockedUsers', state.blockedUsers); } }
      else { if (!state.blockedWords.includes(val)) { state.blockedWords.push(val); updateSetting('blockedWords', state.blockedWords); } }
      textInput.value = ''; renderBlocks(); window.dispatchEvent(new CustomEvent('TndrHXSyncBlocks', { detail: { users: state.blockedUsers, words: state.blockedWords } })); showToast('Blockiert!', 'success');
    });

    panel.querySelector('#tm-steal-all').addEventListener('click', () => {
      if(state.seenEmojis.length === 0) return showToast("Keine Emojis zum Klauen gefunden!", "error");
      state.seenEmojis.forEach(em => addLocalEmoji(em.url, "geklaut_" + Math.floor(Math.random()*1000)));
      state.seenEmojis = []; renderEmojiDieb(); showToast('Alle gestohlen!', 'success');
    });

    let deleteTimeout;
    const delBtn = panel.querySelector('#tm-delete-all-btn');
    delBtn.addEventListener('click', () => {
      const step = parseInt(delBtn.dataset.step || '0'); clearTimeout(deleteTimeout);
      if (step === 0) { delBtn.dataset.step = '1'; delBtn.textContent = 'Sicher?'; deleteTimeout = setTimeout(() => { delBtn.dataset.step = '0'; delBtn.textContent = '🗑️ Alle löschen'; }, 3000); }
      else if (step === 1) { delBtn.dataset.step = '2'; delBtn.textContent = 'Nochmal klicken!'; delBtn.style.background = '#8a0000'; deleteTimeout = setTimeout(() => { delBtn.dataset.step = '0'; delBtn.textContent = '🗑️ Alle löschen'; delBtn.style.background = ''; }, 3000); }
      else { state.localEmojis = []; apiCall('/action', 'POST', {action: 'clear_emojis'}); renderGallery(); delBtn.dataset.step = '0'; delBtn.textContent = '🗑️ Alle löschen'; delBtn.style.background = ''; showToast('Gelöscht!', 'error'); }
    });

    panel.querySelector('#tm-minimize').addEventListener('click', () => setCollapsed(true));
    panel.querySelector('#tm-search').addEventListener('input', (e) => { state.searchTerm = e.target.value; renderGallery(); });

    let isDragging = false, dragOffsetX, dragOffsetY;
    ui.header.addEventListener('mousedown', (e) => { if (e.target.tagName === 'BUTTON') return; isDragging = true; const rect = panel.getBoundingClientRect(); dragOffsetX = e.clientX - rect.left; dragOffsetY = e.clientY - rect.top; e.preventDefault(); });
    window.addEventListener('mousemove', (e) => { if (!isDragging) return; panel.style.left = Math.max(0, Math.min(e.clientX - dragOffsetX, window.innerWidth - panel.offsetWidth)) + 'px'; panel.style.top = Math.max(0, Math.min(e.clientY - dragOffsetY, window.innerHeight - panel.offsetHeight)) + 'px'; panel.style.right = 'auto'; panel.style.bottom = 'auto'; state.panelPos = { left: parseInt(panel.style.left), top: parseInt(panel.style.top) }; });
    window.addEventListener('mouseup', () => { if (isDragging) { isDragging = false; gmSet('panel_pos', state.panelPos); } });

    const resizeHandle = panel.querySelector('#tm-resize-handle'); let isResizing = false, startWidth, startHeight, startX, startY;
    resizeHandle.addEventListener('mousedown', (e) => { isResizing = true; startWidth = panel.offsetWidth; startHeight = panel.offsetHeight; startX = e.clientX; startY = e.clientY; e.preventDefault(); e.stopPropagation(); });
    window.addEventListener('mousemove', (e) => { if (!isResizing) return; panel.style.width = Math.max(280, startWidth + (e.clientX - startX)) + 'px'; panel.style.height = Math.max(300, startHeight + (e.clientY - startY)) + 'px'; });
    window.addEventListener('mouseup', () => { if (isResizing) { isResizing = false; state.panelSize = { width: panel.offsetWidth, height: panel.offsetHeight }; gmSet('panel_size', state.panelSize); } });

    const handleFiles = async (files) => {
      if (!files || files.length === 0) return;
      let added = 0; ui.panel.style.pointerEvents = 'none'; ui.panel.style.opacity = '0.7';
      try {
        for (const file of files) {
          if (!file.type.startsWith('image/')) continue;
          addLocalEmoji(await processFile(file), file.name.replace(/\.[^/.]+$/, '')); added++;
        }
      } catch (err) { showToast(err.message || "Upload Fehler", "error"); }
      ui.panel.style.pointerEvents = 'all'; ui.panel.style.opacity = '1';
      if (added > 0) showToast(`${added} hinzugefügt!`, 'success');
    };
    const localFile = panel.querySelector('#tm-local-file'); panel.querySelector('#tm-select-local').addEventListener('click', () => localFile.click()); localFile.addEventListener('change', () => { handleFiles(localFile.files); localFile.value = ''; });
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => panel.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }));
    let dragCounter = 0; panel.addEventListener('dragenter', () => { dragCounter++; panel.classList.add('tm-dragover'); }); panel.addEventListener('dragleave', () => { dragCounter--; if (dragCounter === 0) panel.classList.remove('tm-dragover'); });
    panel.addEventListener('drop', (e) => { dragCounter = 0; panel.classList.remove('tm-dragover'); handleFiles(e.dataTransfer.files); });

    setCollapsed(state.collapsed);
  }

  async function boot() {
    createUI();
    watchForAvatarsAndChat();
    updateStatus();
    startHeartbeat();
    checkForUpdates();
    silentUpdateKnownUsers();
  }

  injectWebSocketInterceptor();
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot); }
  else { boot(); }

})();
