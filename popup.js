// popup.js — shows either Time Until Open OR Browsing Time Left for active tab
(async function(){
  const content = document.getElementById('content');

  function renderStructure(r) {
    const visitLimit = r.visitLimitPerDay ?? 5;
    content.innerHTML = `
      <div style="text-align:center;margin-bottom:6px;" id="peep-popup-title">Loading...</div>
      <div class="peep-timer">
        <div class="peep-box" id="peep-popup-mins-box">
            <div class="peep-num" id="peep-popup-mins">00</div>
            <div class="peep-label">Minutes</div>
        </div>
        <div class="peep-box" id="peep-popup-secs-box">
            <div class="peep-num" id="peep-popup-secs">00</div>
            <div class="peep-label">Seconds</div>
        </div>
      </div>
      <div class="peep-rules">
        <span>${r.pattern}</span>
        <span class="peep-dot"></span>
        <span><b>Delay</b> <span class="peep-num">${fmtTime(currentDelaySec(r))}</span></span>
        <span class="peep-dot"></span>
        <span><b>Visits</b> <span class="peep-num">${(r.usedVisitsToday||0)}/${visitLimit}</span></span>
        <span class="peep-dot"></span>
        <span><b>Limit</b> <span class="peep-num">${fmtTime(r.sessionLimitSec||60)}</span></span>
      </div>`;
  }

  const rules = await loadRules();
  chrome.tabs.query({active:true, currentWindow:true}, (tabs) => {
    const tab = tabs[0];
    if (!tab) { content.textContent = 'No active tab.'; return; }
    
    const r = matchRuleForUrl(tab.url, rules);
    if (!r) {
      content.innerHTML = `<div class="peep-rules" style="justify-content:center;">This tab is not managed by PEEP.</div>
      <div class="peep-sub" style="text-align:center;">Click a blocked site tab to see its timer.</div>`;
      return;
    }
  
    // Render the static parts of the popup once
    renderStructure(r);
  
    // Get references to the elements that will be updated
    const titleEl = document.getElementById('peep-popup-title');
    const minsEl = document.getElementById('peep-popup-mins');
    const secsEl = document.getElementById('peep-popup-secs');
    const minsBoxEl = document.getElementById('peep-popup-mins-box');
    const secsBoxEl = document.getElementById('peep-popup-secs-box');
  
    const tick = async () => {
      const rs = await loadRules();
      const idx = findRuleIndexById(rs, r.id);
      const cur = rs[idx];
      if (!cur) { content.innerHTML = 'Rule not found.'; return; }
  
      const now = Math.floor(Date.now()/1000);
      let title = 'Browsing Time Left';
      let left = Math.max(0,(cur.allowedUntil||0)-now);
      
      if (left <= 0 && (cur.pendingOpenUntil||0) > now) {
        title = 'Time until open';
        left = Math.max(0,(cur.pendingOpenUntil||0)-now);
      }
  
      const mins = Math.floor(left/60);
      const secs = left % 60;
      const color = left <= 30 ? 'peep-red' : 'peep-green';
  
      // Only update the dynamic parts
      titleEl.textContent = title;
      minsEl.textContent = String(mins).padStart(2,'0');
      secsEl.textContent = String(secs).padStart(2,'0');
      minsBoxEl.className = `peep-box ${color}`;
      secsBoxEl.className = `peep-box ${color}`;
      
      requestAnimationFrame(tick);
    };
    tick();
  });
})();