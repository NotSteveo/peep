// utils.js - pattern matching and helpers (callback-safe for storage)
const STORAGE_KEY = 'peep_rules';
const META_KEY = 'peep_meta';

function extAlive() {
  try { return !!(chrome && chrome.runtime && chrome.runtime.id); } catch(e) { return false; }
}
function pGet(keys) {
  return new Promise((resolve) => {
    if (!extAlive()) return resolve({});
    try { chrome.storage.local.get(keys, (res)=>resolve(res)); }
    catch(e){ resolve({}); }
  });
}
function pSet(obj) {
  return new Promise((resolve) => {
    if (!extAlive()) return resolve();
    try { chrome.storage.local.set(obj, ()=>resolve()); }
    catch(e){ resolve(); }
  });
}

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

function fmtTime(sec) {
  if (sec >= 60 && sec % 60 === 0) return (sec/60) + 'm';
  if (sec >= 60) return Math.floor(sec/60)+'m '+(sec%60)+'s';
  return sec + 's';
}

async function loadRules() {
  const obj = await pGet([STORAGE_KEY]);
  return obj[STORAGE_KEY] || [];
}

async function saveRules(rules) {
  await pSet({ [STORAGE_KEY]: rules });
}

function findRuleIndexById(rules, id) {
  return rules.findIndex(r=>r.id===id);
}

function nowSec() { return Math.floor(Date.now()/1000); }

function currentDelaySec(rule) {
  const mult = Math.pow(2, rule.sessionsStartedToday || 0);
  return Math.floor((rule.baseDelaySec || 20) * mult);
}

async function resetIfNeeded() {
  const today = new Date().toLocaleDateString('en-CA');
  const meta = (await pGet([META_KEY]))[META_KEY] || {};
  if (meta.lastResetDate !== today) {
    const rules = await loadRules();
    for (const r of rules) {
      r.usedVisitsToday = 0;
      r.sessionsStartedToday = 0;
      r.allowedUntil = 0;
      r.pendingOpenUntil = 0;
      r.lastEdited = null; // Reset the edit lock
    }
    await pSet({ [STORAGE_KEY]: rules, [META_KEY]: { lastResetDate: today } });
  }
}