
// background.js - dynamic popup/options behavior + midnight reset
const STORAGE_KEY = 'peep_rules';
const META_KEY = 'peep_meta';

function pGet(keys){ return new Promise((resolve)=>chrome.storage.local.get(keys,(r)=>resolve(r))); }
function pSet(obj){ return new Promise((resolve)=>chrome.storage.local.set(obj,()=>resolve())); }

function todayKey() { const d = new Date(); return d.toLocaleDateString('en-CA'); }

async function ensureDailyReset() {
  const meta = await pGet([META_KEY]);
  const last = meta[META_KEY]?.lastResetDate;
  const today = todayKey();
  if (last !== today) {
    const data = await pGet([STORAGE_KEY]);
    const rules = data[STORAGE_KEY] || [];
    for (const r of rules) {
      r.usedVisitsToday = 0;
      r.sessionsStartedToday = 0;
      r.allowedUntil = 0;
      r.pendingOpenUntil = 0;
    }
    await pSet({ [STORAGE_KEY]: rules, [META_KEY]: { lastResetDate: today }});
  }
}

function scheduleMidnightAlarm() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24,0,0,0);
  const when = midnight.getTime()/1000;
  chrome.alarms.create('peep_midnight_reset', { when: when });
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDailyReset();
  scheduleMidnightAlarm();
  refreshActiveTabPopup();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDailyReset();
  scheduleMidnightAlarm();
  refreshActiveTabPopup();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'peep_midnight_reset') {
    await ensureDailyReset();
    scheduleMidnightAlarm();
  }
});

// ----- Rule matching utils (duplicate of utils.js, minimal) -----
function hostMatchesPattern(host, pattern) {
  const [pHost, ...pPathParts] = pattern.split('/');
  const pPath = pPathParts.length ? '/'+pPathParts.join('/') : '';
  const barePattern = pHost.replace(/^\*\./,''); 
  const isWildcard = pHost.startsWith('*.');

  let hostOk = false;
  if (isWildcard) {
    hostOk = host === barePattern || host.endsWith('.'+barePattern);
  } else {
    hostOk = host === pHost || host.endsWith('.'+pHost);
  }
  return { hostOk, pPath };
}
function pathMatches(urlPath, pPath) {
  if (!pPath) return true;
  try { return urlPath.startsWith(pPath); } catch(e) { return false; }
}
function matchRuleForUrl(url, rules) {
  let u;
  try { u = new URL(url); } catch(e) { return null; }
  for (const r of rules) {
    const {hostOk, pPath} = hostMatchesPattern(u.hostname, r.pattern);
    if (!hostOk) continue;
    if (pathMatches(u.pathname, pPath)) return r;
  }
  return null;
}

// ----- Dynamic popup routing -----
async function setPopupForTab(tabId, url) {
  const rules = (await pGet([STORAGE_KEY]))[STORAGE_KEY] || [];
  const rule = url ? matchRuleForUrl(url, rules) : null;
  if (rule) {
    // Managed tab → show popup with timer
    chrome.action.setPopup({ tabId, popup: 'popup.html' });
  } else {
    // Non-managed tab → no popup; onClicked will open options page
    chrome.action.setPopup({ tabId, popup: '' });
  }
}

function refreshActiveTabPopup() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs)=>{
    if (tabs && tabs[0]) setPopupForTab(tabs[0].id, tabs[0].url || '');
  });
}

chrome.tabs.onActivated.addListener(refreshActiveTabPopup);
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'loading' || info.url) setPopupForTab(tabId, (info.url||tab.url||''));
});

// If no popup is set (non-managed tab), clicking opens Options page.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
