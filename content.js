// content.js — full-page takeover for blocked tabs + session control
(async function () {
  if (typeof extAlive === 'function' && !extAlive()) { return; }
  try {
    await resetIfNeeded();
    const rules = await loadRules();
    const matched = matchRuleForUrl(location.href, rules);

    let root = document.getElementById('peep-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'peep-root';
      document.documentElement.appendChild(root);
    }
    
    if (!matched) {
      root.style.pointerEvents = 'none';
      root.style.zIndex = '-1';
      return;
    } else {
      root.style.pointerEvents = 'auto';
      root.style.zIndex = '2147483647';
    }

    function render(html) { root.innerHTML = html; }
    function lockScroll() { document.documentElement.style.overflow = 'hidden'; }
    function unlockScroll() { document.documentElement.style.overflow = ''; }

    const H = {
      base: (content) => (
        `<div class="peep-overlay">
           <div class="peep-card">
             <div class="peep-logo">PEEP</div>
             ${content}
           </div>
         </div>`),
      title: (t) => `<div class="peep-title">${t}</div>`,
      sub: (s) => `<div class="peep-sub">${s}</div>`,
      boxes: (mins, secs, color) => (
        `<div class="peep-timer">
           <div class="peep-box ${color}" id="peep-mins-box">
             <div class="peep-num" id="peep-mins">${String(mins).padStart(2,'0')}</div>
             <div class="peep-label">Minutes</div>
           </div>
           <div class="peep-box ${color}" id="peep-secs-box">
             <div class="peep-num" id="peep-secs">${String(secs).padStart(2,'0')}</div>
             <div class="peep-label">Seconds</div>
           </div>
         </div>`),
      rules: (r) => {
        if (!r) return ''; // Add a guard for safety
        const visitLimit = r.visitLimitPerDay ?? 5;
        return `<div class="peep-rules">
           <span>${r.pattern}</span>
           <span class="peep-dot"></span>
           <span><b>Delay</b> <span class="peep-num">${fmtTime(currentDelaySec(r))}</span></span>
           <span class="peep-dot"></span>
           <span><b>Visits</b> <span class="peep-num">${(r.usedVisitsToday||0)}/${visitLimit}</span></span>
           <span class="peep-dot"></span>
           <span><b>Limit</b> <span class="peep-num">${fmtTime(r.sessionLimitSec||60)}</span></span>
         </div>`
      }
    };

    async function getRuleFresh() {
      const rs = await loadRules();
      const idx = findRuleIndexById(rs, matched.id);
      return { rs, idx, r: rs[idx] };
    }

    async function showBlocked() {
      lockScroll();
      root.style.pointerEvents = 'auto';
      
      const g1 = await getRuleFresh();
      if (!g1 || !g1.r) { await showAllOut(); return; }
      const visitLimit1 = g1.r.visitLimitPerDay ?? 5;
      if ((g1.r.usedVisitsToday || 0) >= visitLimit1) { await showAllOut(); return; }

      const now = Math.floor(Date.now() / 1000);
      let end = (g1.r.pendingOpenUntil || 0) > now ? g1.r.pendingOpenUntil : 0;
      if (!end) {
        end = now + currentDelaySec(g1.r);
        const g2 = await getRuleFresh();
        if (g2.r) {
            g2.rs[g2.idx].pendingOpenUntil = end;
            await saveRules(g2.rs);
        }
      }

      render(H.base(`
        ${H.title('Oh no!')}
        ${H.sub('Time until open')}
        ${H.boxes(0, 0, 'peep-red')}
        ${H.rules(g1.r)}
        <button id="peep-open" class="peep-btn" disabled>Let me in</button>
      `));

      const minsEl = document.getElementById('peep-mins');
      const secsEl = document.getElementById('peep-secs');
      const minsBoxEl = document.getElementById('peep-mins-box');
      const secsBoxEl = document.getElementById('peep-secs-box');
      const openBtn = document.getElementById('peep-open');

      if (openBtn) {
        openBtn.onclick = async () => {
          const now2 = Math.floor(Date.now() / 1000);
          const g4 = await getRuleFresh();
          if (!g4.r) { unlockScroll(); render(''); return; }
          const rr = g4.r;
          const visitLimit4 = rr.visitLimitPerDay ?? 5;
          if ((rr.usedVisitsToday || 0) >= visitLimit4) { await showAllOut(); return; }
          g4.rs[g4.idx].allowedUntil = now2 + (rr.sessionLimitSec || 60);
          g4.rs[g4.idx].usedVisitsToday = (rr.usedVisitsToday || 0) + 1;
          g4.rs[g4.idx].sessionsStartedToday = (rr.sessionsStartedToday || 0) + 1;
          g4.rs[g4.idx].pendingOpenUntil = 0;
          await saveRules(g4.rs);
          startSession();
        };
      }

      const tick = async () => {
        const fresh = await getRuleFresh();
        if (!fresh.r) { unlockScroll(); render(''); return; }
        const currentEnd = fresh.r.pendingOpenUntil || 0;
        const left = Math.max(0, currentEnd - Math.floor(Date.now() / 1000));
        const mins = Math.floor(left / 60);
        const secs = left % 60;
        
        minsEl.textContent = String(mins).padStart(2, '0');
        secsEl.textContent = String(secs).padStart(2, '0');

        const color = left <= 30 ? 'peep-red' : 'peep-green';
        minsBoxEl.className = `peep-box ${color}`;
        secsBoxEl.className = `peep-box ${color}`;
        if (openBtn) openBtn.disabled = left > 0;

        if (left > 0) {
          requestAnimationFrame(tick);
        }
      };
      tick();
    }

    function startSession() {
      unlockScroll();
      root.innerHTML = '';
      root.style.pointerEvents = 'none';
      const loop = async () => {
        const g = await getRuleFresh();
        if (!g.r) { unlockScroll(); render(''); return; }
        const left = Math.max(0, (g.r.allowedUntil || 0) - Math.floor(Date.now() / 1000));
        if (left <= 0) {
          g.rs[g.idx].allowedUntil = 0;
          await saveRules(g.rs);
          await showTimeIsUp();
        } else {
          requestAnimationFrame(loop);
        }
      };
      loop();
    }

    async function showTimeIsUp() {
      lockScroll();
      root.style.pointerEvents = 'auto';
      const { r: freshRule } = await getRuleFresh();
      if (!freshRule) { unlockScroll(); render(''); return; }

      render(H.base(`
        ${H.title('Time is up.')}
        ${H.sub('You can start the open timer again - but it will be doubled before you can open.')}
        ${H.boxes(0, 0, 'peep-red')}
        ${H.rules(freshRule)}
        <button id="peep-start" class="peep-btn">Start it</button>
      `));
      const startBtn = document.getElementById('peep-start');
      if (startBtn) {
        startBtn.onclick = async () => {
          const g = await getRuleFresh();
          if (!g.r) { unlockScroll(); render(''); return; }
          g.rs[g.idx].allowedUntil = 0;
          g.rs[g.idx].pendingOpenUntil = 0;
          await saveRules(g.rs);
          showBlocked();
        };
      }
    }

    async function showAllOut() {
      lockScroll();
      root.style.pointerEvents = 'auto';
      root.classList.remove('show-fully-blocked');
      const { r: freshRule } = await getRuleFresh();
      if (!freshRule) { unlockScroll(); render(''); return; }

      const visitLimit = freshRule.visitLimitPerDay ?? 5;
      const isFullyBlocked = visitLimit === 0;

      if (isFullyBlocked) {
        root.classList.add('show-fully-blocked');
        render(H.base(`
          ${H.title('Think son.')}
          ${H.sub('You probably fully blocked this site for a reason.')}
          <div class="peep-fully-blocked-pattern">${freshRule.pattern}</div>
          <button class="peep-btn" disabled>You did this to yourself</button>
        `));
      } else {
        render(H.base(`
          ${H.title('All out, bud.')}
          ${H.sub('You have exhausted your visits.')}
          ${H.boxes(0, 0, 'peep-red')}
          ${H.rules(freshRule)}
          <button class="peep-btn" disabled>Let me in</button>
        `));
      }
    }

    const init = await getRuleFresh();
    if (!init || !init.r) return;
    const nowInit = Math.floor(Date.now() / 1000);
    const visitLimitInit = init.r.visitLimitPerDay ?? 5;
    if ((init.r.usedVisitsToday || 0) >= visitLimitInit) { await showAllOut(); return; }
    if ((init.r.allowedUntil || 0) > nowInit) { startSession(); return; }
    await showBlocked();
  } catch (e) {
    console.error('PEEP content error', e);
  }
})();