/* IT-JS-800 — New session flow: shuffle choice → intro 77s → 5 exercises with 4-part interval → outro 77s.
   Logs: one entry per exercise (weight, reps, notes). View Log: last session snapshot (one per exercise).
*/
(() => {
  const $ = (q) => document.querySelector(q);

  /* ===== State ===== */
  const state = {
    order: [],                // ['calfpress','hex','pullups','btnp','pushups'] (shuffled or fixed)
    idx: 0,                   // pointer into order
    runningRAF: null,         // timer loop handle
    cancelFlag: false,        // for interval chains
    lastScreenBeforeLog: 'intro',
    current: null,            // section id currently active
  };

  const EX_LABEL = {
    calfpress: 'CALFPRESS',
    hex: 'HEX DEADLIFT',
    btnp: 'BTNP',
    pullups: 'PULLUPS',
    pushups: 'PUSHUPS',
  };
  const EX_LIST = ['calfpress','hex','pullups','btnp','pushups']; // regular order per your spec

  /* ===== Helpers ===== */
  function showScreen(id){
    ['intro','calfpress','hex','pullups','btnp','pushups','outro','log'].forEach(s=>{
      const el = $('#'+s);
      if(el) el.classList.toggle('hidden', s!==id);
    });
    state.current = id;
  }
  function shuffle(a){
    const arr=a.slice();
    for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
    return arr;
  }
  function banner(msg){
    let b = $('.error-banner');
    if(!b){ b=document.createElement('div'); b.className='error-banner'; document.body.appendChild(b); }
    b.textContent = msg;
    setTimeout(()=>{ try{ b.remove(); }catch{} }, 3500);
    console.error(msg);
  }

  /* ===== Audio beeps (>= 1 kHz, sharp & audible) ===== */
  function beepBurst(freq=2000, dur=0.25){
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1.0, t+0.01);
    g.gain.setValueAtTime(1.0, t+dur-0.05);
    g.gain.linearRampToValueAtTime(0.0001, t+dur);
    o.start(t); o.stop(t+dur+0.05);
    setTimeout(()=>ctx.close().catch(()=>{}), (dur+0.1)*1000);
  }
  function tripleSharp(){
    [1200, 1800, 2400].forEach((f,i)=> setTimeout(()=>beepBurst(f,0.25), i*400));
  }
  function longSharp(){
    beepBurst(2000, 0.6);
  }

  /* ===== Timer (counts in seconds) ===== */
  function startSecondsTimer(el, seconds, onDone){
    cancelTimer(); state.cancelFlag=false;
    const start = Date.now(), totalMs = seconds*1000;
    function fmt(ms){ const s=Math.max(0, Math.ceil(ms/1000)); return String(s); }
    function tick(){
      if(state.cancelFlag) return;
      const left = totalMs - (Date.now()-start);
      if(left <= 0){
        el.textContent = '0';
        cancelTimer(); onDone && onDone();
        return;
      }
      el.textContent = fmt(left);
      state.runningRAF = requestAnimationFrame(tick);
    }
    el.textContent = String(seconds);
    state.runningRAF = requestAnimationFrame(tick);
  }
  function cancelTimer(){
    if(state.runningRAF){ cancelAnimationFrame(state.runningRAF); state.runningRAF=null; }
    state.cancelFlag = true;
  }

  /* ===== API ===== */
  async function apiLog(payload){
    try{
      await fetch('log.php', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
    }catch(e){ banner('IT-JS-840 log.php unreachable'); }
  }
  async function apiLast(limit=400){
    try{
      const r = await fetch('last.php?limit='+limit);
      if(!r.ok) throw new Error('HTTP '+r.status);
      return await r.json();
    }catch(e){ banner('IT-JS-850 last.php unreachable'); return {ok:false, entries:[]}; }
  }

  /* ===== Intro: Resting Squat (unlogged) ===== */
  const introStart = $('#introStart');
  const introNext  = $('#introNext');
  const introTimer = $('#introTimer');
  const shuffleToggle = $('#shuffleToggle');

  introStart.addEventListener('click', ()=>{
    // 77s + 3 sharp beeps; NEXT visible when done, or can be pressed anytime
    introNext.classList.add('hidden');
    startSecondsTimer(introTimer, 77, ()=>{ tripleSharp(); introNext.classList.remove('hidden'); });
  });
  introNext.addEventListener('click', ()=>{
    // Build order based on toggle; REGULAR = intro → 1..5 in regular order → outro
    state.order = (shuffleToggle && shuffleToggle.checked) ? shuffle(EX_LIST) : EX_LIST.slice();
    state.idx = 0;
    showScreen(state.order[state.idx]);
  });

  /* ===== Outro: Deadhang (unlogged) ===== */
  const outroStart = $('#outroStart');
  const outroNext  = $('#outroNext');
  const outroTimer = $('#outroTimer');

  outroStart.addEventListener('click', ()=>{
    outroNext.classList.add('hidden');
    startSecondsTimer(outroTimer, 77, ()=>{ tripleSharp(); outroNext.classList.remove('hidden'); });
  });
  outroNext.addEventListener('click', ()=> showScreen('intro'));

  /* ===== Generic exercise wiring =====
     Each exercise has:
      - weight input
      - START INTERVAL → runs: 77(3 beeps), 39(1 long), 77(3 beeps), 77(1 long)
      - NEXT (can skip anytime)
      - FINISHED MASTERSET → shows reps + notes
      - When NEXT pressed → LOG single entry: {ex, kg, reps, notes, t}
  */
  function wireExercise(idPrefix){
    const secId = idPrefix;                 // 'calfpress' etc.
    const label = EX_LABEL[secId];

    const weightField = $('#'+idPrefix+'_weightField');
    const tDisp       = $('#'+idPrefix+'_timer');
    const startBtn    = $('#'+idPrefix+'_start');
    const nextBtn     = $('#'+idPrefix+'_next');

    const finishBox   = $('#'+idPrefix+'_finishBox');
    const finishBtn   = $('#'+idPrefix+'_finish');
    const repsField   = $('#'+idPrefix+'_repsField');
    const notesField  = $('#'+idPrefix+'_notesField');

    // Interval sequence
    let running = false;
    startBtn.addEventListener('click', async ()=>{
      if(running) return;   // simple guard; no cancel mid-chain for now
      running = true; startBtn.setAttribute('disabled','disabled');

      // 1) 77s → 3 sharp
      await new Promise(res=> startSecondsTimer(tDisp,77, ()=>{ tripleSharp(); res(); }));

      // 2) 39s → 1 long
      await new Promise(res=> startSecondsTimer(tDisp,39, ()=>{ longSharp(); res(); }));

      // 3) 77s → 3 sharp
      await new Promise(res=> startSecondsTimer(tDisp,77, ()=>{ tripleSharp(); res(); }));

      // 4) 77s → 1 long
      await new Promise(res=> startSecondsTimer(tDisp,77, ()=>{ longSharp(); res(); }));

      // Show FINISHED MASTERSET box
      finishBox.classList.remove('hidden');
      running = false; startBtn.removeAttribute('disabled');
    });

    // Pressing FINISHED MASTERSET only reveals inputs (already done above)
    finishBtn.addEventListener('click', ()=>{
      finishBox.classList.remove('hidden');
    });

    // NEXT can be pressed anytime: log snapshot + advance
    nextBtn.addEventListener('click', ()=>{
      const entry = {
        t: Date.now(),
        ev: 'exercise_done',
        ex: label,                     // CALFPRESS / HEX DEADLIFT / ...
        kg: toNumberOrNull(weightField.value),
        reps: toNumberOrNull(repsField.value),
        notes: (notesField.value || '').trim(),
      };
      apiLog(entry).catch(()=>{});
      // Reset local inputs for next session view
      repsField.value = ''; notesField.value='';
      // Advance to next or outro
      state.idx++;
      if(state.idx < state.order.length){
        showScreen(state.order[state.idx]);
      }else{
        showScreen('outro');
      }
    });
  }
  function toNumberOrNull(v){
    const n = Number(v);
    return (isFinite(n) && n>0) ? n : null;
  }

  // Wire all five
  ['calfpress','hex','pullups','btnp','pushups'].forEach(wireExercise);

  /* ===== View Log: show LAST SESSION (one latest per exercise, canonical order) ===== */
  const showLogBtn = $('#showLog');
  const logBack    = $('#logBack');
  const logContent = $('#logContent');

  showLogBtn.addEventListener('click', async ()=>{
    state.lastScreenBeforeLog = state.current || 'intro';
    showScreen('log');
    logContent.innerHTML = '<div class="glass">Loading…</div>';

    const data = await apiLast(400);
    const wanted = ['CALFPRESS','HEX DEADLIFT','PULLUPS','BTNP','PUSHUPS'];
    const latest = Object.create(null);

    // Walk newest → oldest; keep first hit per exercise
    (data?.entries || []).forEach(e=>{
      const ex = (e.ex||'').toUpperCase();
      if(!wanted.includes(ex)) return;
      if(!latest[ex]) latest[ex] = e;
    });

    logContent.innerHTML = '';
    let any=false;
    wanted.forEach(ex=>{
      const e = latest[ex]; if(!e) return;
      any=true;
      const item = document.createElement('div');
      item.className = 'log-item';
      const d = new Date(e.t || e.createdAt || Date.now());
      let html = `<strong>${ex}</strong><br>`;
      html += `${d.toLocaleTimeString()}<br>`;
      if(e.kg)   html += `WEIGHT: ${e.kg} kg<br>`;
      if(e.reps) html += `REPS (MASTERSET): ${e.reps}<br>`;
      if(e.notes && String(e.notes).trim()!=='') html += `NOTES: ${e.notes}<br>`;
      item.innerHTML = html;
      logContent.appendChild(item);
    });
    if(!any) logContent.innerHTML = '<div class="glass">No recent entries.</div>';
  });

  logBack.addEventListener('click', ()=> showScreen(state.lastScreenBeforeLog || 'intro'));

})();
