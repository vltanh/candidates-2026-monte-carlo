// ═══════════════════════════════════════════════
// DATA (injected by generate_html.py)
// ═══════════════════════════════════════════════
/*__INJECT_DATA__*/

// ═══════════════════════════════════════════════
// GLOBALS
// ═══════════════════════════════════════════════
let currentIdx = DATA.rounds.length - 1;
let winPctChart, timelineChart, expScoreChart, paretoChart, titleRaceChart;
let hiddenPlayers = new Set();
let sortedPlayers = [];   // dataset order used by timeline + expScore charts
let pastVisible = false;
let futureVisible = false;

let standingsSort = {col:'score', dir:-1};
let heatmapSort   = {col:'cascade', dir:-1};
let playersSort   = {col:'rating', dir:-1};
let paretoSort    = {col:'brier', dir:1};

// quick lookup
const P_MAP = Object.fromEntries(DATA.players.map(p => [p.key, p]));

// Integer → Roman numeral (for masthead volume)
function toRoman(num){
  if (!num || num < 1) return '—';
  const map = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],
               [50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let r = '';
  for (const [v,s] of map){ while (num >= v){ r += s; num -= v; } }
  return r;
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function pct(v, d=1){ return (v*100).toFixed(d)+'%'; }
function winpctTier(v){
  if (v >= .55) return 'winpct tier-vhigh';
  if (v >= .30) return 'winpct tier-high';
  if (v >= .12) return 'winpct tier-med';
  return 'winpct tier-low';
}
function fmt(v){
  if (typeof v !== 'number') return v;
  if (!isFinite(v)) return String(v);
  if (Number.isInteger(v)) return v.toLocaleString('en-US');
  const abs = Math.abs(v);
  // Very small non-zero values → scientific
  if (abs > 0 && abs < 1e-3) return v.toExponential(2);
  // Otherwise up to 6 significant digits, trim trailing zeros
  let s = v.toPrecision(6);
  if (s.indexOf('.') !== -1 && s.indexOf('e') === -1){
    s = s.replace(/0+$/, '').replace(/\.$/, '');
  }
  return s;
}

function hexAlpha(hex, a){ return hex+Math.round(a*255).toString(16).padStart(2,'0'); }

function toggleSort(state, col){
  if (state.col === col) state.dir *= -1;
  else { state.col = col; state.dir = -1; }
}

function markSortHeaders(table, state){
  table.querySelectorAll('th[data-sort]').forEach(th => {
    th.classList.remove('asc','desc');
    if (String(th.dataset.sort) === String(state.col)){
      th.classList.add(state.dir > 0 ? 'asc' : 'desc');
    }
  });
}

function heatBg(v, playerKey){
  const hex = (P_MAP[playerKey]?.color ?? '#88a').replace('#','');
  const r=parseInt(hex.slice(0,2),16), g=parseInt(hex.slice(2,4),16), b=parseInt(hex.slice(4,6),16);
  const alpha = Math.min(.5, v*2.2+0.03);
  return `rgba(${r},${g},${b},${alpha})`;
}

function trialColor(n, maxN){
  const t = n / maxN;
  // deep cobalt → soft azure gradient for the trial cloud
  return `rgba(${Math.round(46+t*60)},${Math.round(82+t*100)},${Math.round(176+t*55)},0.32)`;
}

function paretoColor(idx, total){
  const t = total<=1 ? 0 : idx/(total-1);
  return `rgb(${Math.round(67+t*178)},${Math.round(97+t*129)},${Math.round(238+t*(122-238))})`;
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
Chart.defaults.color = '#c0cceb';
Chart.defaults.borderColor = '#263764';
Chart.defaults.font.family = "'JetBrains Mono', ui-monospace, monospace";
Chart.defaults.font.size = 13;

function numberAppendices(){
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let i = 0;
  document.querySelectorAll('.appendix-section').forEach(sec => {
    if (sec.style.display === 'none') return;
    sec.querySelector('.appendix-num').textContent = letters[i++];
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Header / masthead — name on top, year · section below (big)
  const sec = DATA.meta.section || '';
  const fullTitle = DATA.meta.name
    + (DATA.meta.year ? ' ' + DATA.meta.year : '')
    + (sec ? ' \u00b7 ' + sec : '');
  document.getElementById('pageTitle').textContent = fullTitle + ' \u00b7 Monte Carlo';

  const titleEl = document.getElementById('hdr-title');
  let line2 = '';
  if (DATA.meta.year) line2 += `<em>${DATA.meta.year}</em>`;
  if (sec){
    if (line2) line2 += ' <span class="hdr-sec">\u00b7</span> ';
    line2 += `<span class="hdr-sec">${sec}</span>`;
  }
  titleEl.innerHTML = DATA.meta.name + (line2 ? '<br>' + line2 : '');

  // Volume line: roman numeral year
  const volEl = document.getElementById('hdr-vol');
  if (volEl) volEl.textContent = `VOL. ${toRoman(DATA.meta.year)}`;

  const badges = document.getElementById('hdr-badges');
  const latest = DATA.rounds[DATA.rounds.length-1];
  const latestNum = latest.round_num;
  const totalR = DATA.meta.total_rounds;
  const allPlayed = latest.upcoming_games?.every(g => g.result !== null) ?? false;
  const isFinished = latestNum > totalR || (latestNum === totalR && allPlayed);
  const statusBadge = isFinished
    ? `<span class="badge">Final</span>`
    : `<span class="badge live">Round ${latestNum} · Live</span>`;
  badges.innerHTML = `
    ${statusBadge}
    <span class="badge">${DATA.players.length} Players · ${totalR} Rounds · ${DATA.meta.gpr} Games/Round</span>
    <span class="badge">Tiebreak · ${DATA.meta.tiebreak}</span>`;
  document.getElementById('totalRounds').textContent = totalR;

  buildTabs();
  initTimeline();
  initExpScore();
  initWinPct();
  initTitleRace();
  buildPlayerToggles();
  buildTournamentPlayers();

  // Wire up sortable headers — standings
  document.querySelectorAll('#tStandings thead th[data-sort]').forEach(th => {
    th.onclick = () => { toggleSort(standingsSort, th.dataset.sort); updateStandings(DATA.rounds[currentIdx]); };
  });
  // Wire up sortable headers — tournament players
  document.querySelectorAll('#tPlayers thead th[data-sort]').forEach(th => {
    th.onclick = () => { toggleSort(playersSort, th.dataset.sort); renderTournamentPlayers(); };
  });

  if (DATA.pareto) buildPareto();
  if (DATA.hparams) buildHparams();
  numberAppendices();

  setRound(currentIdx, false);

  // Floating back-to-top visibility
  const btt = document.getElementById('backToTop');
  window.addEventListener('scroll', function(){
    btt.classList.toggle('visible', window.scrollY > 400);
  }, {passive:true});
});

// ═══════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════
function chooseCols(n){
  // Pick 3 or 4 columns — whichever leaves the last row most filled (highest fill fraction).
  // Tie-break: prefer 4 (wider grid looks better).
  let best = 4, bestFill = -1;
  for (const cols of [3, 4]){
    const rem = n % cols;
    const lastRow = rem === 0 ? cols : rem;   // if perfectly divisible, last row is full
    const fill = lastRow / cols;
    if (fill > bestFill){ bestFill = fill; best = cols; }
  }
  return best;
}

function buildTabs(){
  const wrap = document.getElementById('tabs');
  const available = DATA.rounds.length;
  const total = DATA.meta.total_rounds;
  for (let i = 0; i <= total; i++){
    const btn = document.createElement('button');
    if (i < available){
      btn.className = 'tab';
      btn.textContent = DATA.rounds[i].label;
      btn.onclick = (idx => () => setRound(idx))(i);
    } else {
      const label = i === 0 ? 'Before R1' : `After R${i}`;
      btn.className = 'tab';
      btn.textContent = label;
      btn.disabled = true;
      btn.title = 'Round not yet played';
    }
    wrap.appendChild(btn);
  }
}

// ═══════════════════════════════════════════════
// PLAYER TOGGLES
// ═══════════════════════════════════════════════
function buildPlayerToggles(){
  const wrap = document.getElementById('playerToggles');
  DATA.players.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'ptoggle';
    btn.dataset.key = p.key;
    btn.style.borderColor = p.color;
    btn.style.color = p.color;
    btn.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${p.color};flex-shrink:0"></span>${p.short}`;
    btn.onclick = () => togglePlayer(p.key);
    wrap.appendChild(btn);
  });
}

function togglePlayer(key){
  if (hiddenPlayers.has(key)) hiddenPlayers.delete(key);
  else hiddenPlayers.add(key);

  // update chip appearance
  document.querySelectorAll('.ptoggle').forEach(btn => {
    btn.classList.toggle('off', hiddenPlayers.has(btn.dataset.key));
  });

  updateChartVisibility();
  updateStandings(DATA.rounds[currentIdx]);
  updateHeatmap(DATA.rounds[currentIdx]);
}

function updateChartVisibility(){
  [timelineChart, expScoreChart].forEach(chart => {
    if (!chart) return;
    sortedPlayers.forEach((p, i) => {
      const vis = !hiddenPlayers.has(p.key);
      chart.setDatasetVisibility(i, vis);
    });
    chart.update();
  });
}

// ═══════════════════════════════════════════════
// SET ROUND
// ═══════════════════════════════════════════════
function setRound(idx, animate=true){
  currentIdx = idx;
  // update tabs
  document.querySelectorAll('.tab').forEach((el,i) => el.classList.toggle('active', i===idx));

  const round = DATA.rounds[idx];

  // update annotation on timeline charts
  [timelineChart, expScoreChart].forEach(c => {
    if (!c) return;
    c.options.plugins.annotation.annotations.vline.xMin = idx;
    c.options.plugins.annotation.annotations.vline.xMax = idx;
    c.update(animate ? undefined : 'none');
  });

  updateStandings(round);
  updateTitleRace(round);
  updateGames(round);
  updateHeatmap(round);
  updatePastFutureBtnLabels();

  document.getElementById('roundTitle').innerHTML =
    `<span class="num">2</span> Standings <em class="sec-sub">After Round ${round.round_num - 1}</em>`;
  document.getElementById('gamesTitle').innerHTML =
    `<span class="num">3</span> Game Predictions <em class="sec-sub">Round ${round.round_num}</em>`;
  document.getElementById('rankTitle').innerHTML =
    `<span class="num">4</span> Rank Distribution <em class="sec-sub">After Round ${round.round_num - 1}</em>`;

  if (currentView === 'se') initScenarioExplorer();
}

// ═══════════════════════════════════════════════
// VIEW (top-level: Monte Carlo | Scenario Explorer)
// ═══════════════════════════════════════════════
let currentView = 'mc';
function setView(v){
  if (v === currentView) return;
  currentView = v;
  document.querySelectorAll('.view-tab').forEach(el => {
    const on = el.dataset.view === v;
    el.classList.toggle('active', on);
    el.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.getElementById('view-mc').style.display = v === 'mc' ? '' : 'none';
  document.getElementById('view-se').style.display = v === 'se' ? '' : 'none';
  document.getElementById('view-mc-appendix').style.display = v === 'mc' ? '' : 'none';
  if (v === 'se') initScenarioExplorer();
  window.scrollTo({top:0, behavior:'smooth'});
}

// ═══════════════════════════════════════════════
// STANDINGS
// ═══════════════════════════════════════════════
function updateStandings(round){
  // Compute true standings rank (score desc, tiebreak by winpct)
  const byRank = [...DATA.players].sort((a,b) => {
    const sa = round.actual_scores[a.key]??0, sb = round.actual_scores[b.key]??0;
    if (sb!==sa) return sb-sa;
    return (round.winner_probs[b.key]??0)-(round.winner_probs[a.key]??0);
  });
  const rankMap = {};
  byRank.forEach((p,i) => rankMap[p.key] = i+1);

  // Sort for display based on user-chosen column
  const valFn = (p) => {
    switch(standingsSort.col){
      case 'rank':   return rankMap[p.key];
      case 'player': return p.short.toLowerCase();
      case 'elo':    return p.rating ?? 0;
      case 'score':  return round.actual_scores[p.key] ?? 0;
      case 'winpct': return round.winner_probs[p.key] ?? 0;
      default:       return rankMap[p.key];
    }
  };
  const sorted = [...DATA.players].sort((a,b) => {
    const va = valFn(a), vb = valFn(b);
    if (typeof va === 'string') return standingsSort.dir * va.localeCompare(vb);
    const d = standingsSort.dir * (va - vb);
    if (d !== 0) return d;
    // tiebreak by win probability descending
    return (round.winner_probs[b.key]??0) - (round.winner_probs[a.key]??0);
  });

  const tbl = document.getElementById('tStandings');
  markSortHeaders(tbl, standingsSort);

  const tb = document.getElementById('tbStandings');
  tb.innerHTML = '';
  sorted.forEach(p => {
    const rank  = rankMap[p.key];
    const score = round.actual_scores[p.key]??0;
    const wp    = round.winner_probs[p.key]??0;
    const hidden = hiddenPlayers.has(p.key);
    const tr = document.createElement('tr');
    if (hidden) tr.classList.add('hidden-player');
    tr.innerHTML = `
      <td class="rank-num ${rank===1?'gold':''}">${rank}</td>
      <td><div class="pcell"><span class="dot" style="background:${p.color}" aria-label="${p.short} color"></span>${p.short}</div></td>
      <td class="hide-mobile" style="color:var(--paper-3);font-size:.83rem">${p.rating??'—'}</td>
      <td class="score">${score}</td>
      <td>
        <div style="display:flex;align-items:center;gap:.6rem">
          <div class="bar-inline"><div class="bar-fill" style="width:${Math.min(100,wp*100)}%;background:${p.color}"></div></div>
          <span class="winpct ${winpctTier(wp)}" title="${pct(wp,2)}">${pct(wp)}</span>
        </div>
      </td>`;
    tb.appendChild(tr);
  });

  // bar chart — only visible players
  const visibleSorted = sorted.filter(p => !hiddenPlayers.has(p.key));
  winPctChart.data.labels = visibleSorted.map(p => p.short);
  winPctChart.data.datasets[0].data = visibleSorted.map(p => +(((round.winner_probs[p.key]??0)*100).toFixed(2)));
  winPctChart.data.datasets[0].backgroundColor = visibleSorted.map(p => hexAlpha(p.color, 0.7));
  winPctChart.data.datasets[0].borderColor      = visibleSorted.map(p => p.color);
  winPctChart.update();
}

// ═══════════════════════════════════════════════
// GAME CARD BUILDER (shared)
// ═══════════════════════════════════════════════
function makeGameCard(g, roundNum, phase){
  const [ww,dd,bw] = g.probs;
  const wp = Math.round(ww*100), dp = Math.round(dd*100), bp = Math.round(bw*100);
  const wc = P_MAP[g.white]?.color ?? '#888';
  const bc = P_MAP[g.black]?.color ?? '#888';
  const wn = P_MAP[g.white]?.short ?? g.white;
  const bn = P_MAP[g.black]?.short ?? g.black;

  // Gold inset shadow on the bar matching the actual result
  const wShadow = g.result==='1-0'   ? 'box-shadow:inset 0 0 0 3px #ffee58;' : '';
  const dShadow = g.result==='1/2-1/2'? 'box-shadow:inset 0 0 0 3px #ffee58;' : '';
  const bShadow = g.result==='0-1'   ? 'box-shadow:inset 0 0 0 3px #ffee58;' : '';

  let resultBadge = '';
  if (g.result==='1-0')
    resultBadge = `<div style="text-align:left"><span class="result-badge white-win">✓ ${wn} won</span></div>`;
  else if (g.result==='0-1')
    resultBadge = `<div style="text-align:right"><span class="result-badge black-win">✓ ${bn} won</span></div>`;
  else if (g.result==='1/2-1/2')
    resultBadge = `<div style="text-align:center"><span class="result-badge draw">½–½ Draw</span></div>`;

  const card = document.createElement('div');
  const hasResult = g.result != null;
  const phaseClass = phase ? ` gcard--${phase}` : (hasResult ? ' gcard--past' : '');
  card.className = 'gcard' + phaseClass;
  const phaseLabel = phase === 'past' || (phase == null && hasResult)
    ? '<span class="gcard-phase">Completed</span>'
    : (phase === 'future' ? '<span class="gcard-phase gcard-phase--future">Forecast</span>' : '');
  card.innerHTML = `
    <div class="round-label">Round ${roundNum}${phaseLabel}</div>
    <div class="players">
      <span class="dot" style="background:${wc}"></span>${wn}
      <span class="sep">vs</span>
      <span class="dot" style="background:${bc}"></span>${bn}
    </div>
    <div class="prob-bars">
      <div class="pb white-win" style="flex:${ww};background:${hexAlpha(wc,0.8)};${wShadow}" title="${(ww*100).toFixed(2)}%">${wp}%</div>
      <div class="pb draw" style="flex:${dd};${dShadow}" title="${(dd*100).toFixed(2)}%">${dp}%</div>
      <div class="pb black-win" style="flex:${bw};background:${hexAlpha(bc,0.65)};${bShadow}" title="${(bw*100).toFixed(2)}%">${bp}%</div>
    </div>
    <div class="prob-foot">
      <span>${wn} <span style="color:#6a7ca3">(W)</span></span>
      <span>Draw</span>
      <span>${bn} <span style="color:#6a7ca3">(B)</span></span>
    </div>
    ${resultBadge}`;
  return card;
}

// ═══════════════════════════════════════════════
// GAMES
// ═══════════════════════════════════════════════
function updateGames(round){
  const grid = document.getElementById('gamesGrid');
  grid.innerHTML = '';
  if (!round.upcoming_games?.length){
    grid.innerHTML = '<p style="color:#6a7ca3;font-size:.88rem">No game data for this round.</p>';
    return;
  }
  const ngc = round.upcoming_games.length;
  grid.style.gridTemplateColumns = `repeat(${chooseCols(ngc)}, 1fr)`;
  grid.style.maxWidth = ngc <= 2 ? '560px' : '';
  grid.style.margin = ngc <= 2 ? '0 auto' : '';
  round.upcoming_games.forEach(g => grid.appendChild(makeGameCard(g, round.round_num, 'current')));
  if (pastVisible)   buildPanel('past');
  if (futureVisible) buildPanel('future');
}

// ═══════════════════════════════════════════════
// SHOW PAST / FUTURE ROUNDS
// ═══════════════════════════════════════════════
function countRounds(which){
  const curRound = DATA.rounds[currentIdx].round_num;
  return DATA.all_games.filter(ag => which==='past' ? ag.round_num < curRound : ag.round_num > curRound).length;
}
function toggleSection(which){
  const isPast = which === 'past';
  if (isPast) pastVisible = !pastVisible; else futureVisible = !futureVisible;
  const visible = isPast ? pastVisible : futureVisible;
  const panelId = isPast ? 'pastGamesPanel' : 'futureGamesPanel';
  const btnId   = isPast ? 'showPastBtn'    : 'showFutureBtn';
  const panel   = document.getElementById(panelId);
  const btn     = document.getElementById(btnId);
  const n = countRounds(which);
  if (visible){
    buildPanel(which);
    panel.style.display = '';
    btn.textContent = isPast ? `▾ Hide past (${n})` : `▴ Hide future (${n})`;
  } else {
    panel.style.display = 'none';
    btn.textContent = isPast ? `▴ Past rounds (${n})` : `▾ Future rounds (${n})`;
  }
}
function updatePastFutureBtnLabels(){
  const pn = countRounds('past'), fn = countRounds('future');
  const pb = document.getElementById('showPastBtn');
  const fb = document.getElementById('showFutureBtn');
  if (pb){
    pb.textContent = pastVisible ? `▾ Hide past (${pn})` : `▴ Past rounds (${pn})`;
    pb.style.visibility = pn === 0 ? 'hidden' : '';
  }
  if (fb){
    fb.textContent = futureVisible ? `▴ Hide future (${fn})` : `▾ Future rounds (${fn})`;
    fb.style.visibility = fn === 0 ? 'hidden' : '';
  }
}

function buildPanel(which){
  const isPast  = which === 'past';
  const panel   = document.getElementById(isPast ? 'pastGamesPanel' : 'futureGamesPanel');
  panel.innerHTML = '';
  const curRound = DATA.rounds[currentIdx].round_num;
  const rounds = isPast
    ? DATA.all_games.filter(ag => ag.round_num < curRound)
    : DATA.all_games.filter(ag => ag.round_num > curRound);

  rounds.forEach(ag => {
    const completed = ag.games.every(g => g.result !== null);
    const grp  = document.createElement('div');
    grp.className = 'round-group';
    const glbl = document.createElement('div');
    glbl.className = 'round-group-lbl';
    glbl.textContent = `Round ${ag.round_num} — ${completed ? 'Completed' : 'Upcoming'}`;
    grp.appendChild(glbl);
    const grid = document.createElement('div');
    grid.className = 'games-grid';
    grid.style.gridTemplateColumns = `repeat(${chooseCols(ag.games.length)}, 1fr)`;
    ag.games.forEach(g => grid.appendChild(makeGameCard(g, ag.round_num, isPast ? 'past' : 'future')));
    grp.appendChild(grid);
    panel.appendChild(grp);
  });
}

// ═══════════════════════════════════════════════
// RANK HEATMAP
// ═══════════════════════════════════════════════
function updateHeatmap(round){
  const tbl = document.getElementById('hmTable');
  tbl.innerHTML = '';
  const n = DATA.players.length;

  const thead = document.createElement('thead');
  const hrow = document.createElement('tr');
  const thP = document.createElement('th');
  thP.textContent = 'Player';
  hrow.appendChild(thP);
  for (let i=0;i<n;i++){
    const th = document.createElement('th');
    th.textContent = `${i+1}${['st','nd','rd'][i]??'th'}`;
    th.dataset.sort = String(i);
    th.onclick = ((idx) => () => { toggleSort(heatmapSort,idx); updateHeatmap(DATA.rounds[currentIdx]); })(i);
    hrow.appendChild(th);
  }
  thead.appendChild(hrow);
  tbl.appendChild(thead);
  markSortHeaders(tbl, heatmapSort);

  const sorted = [...DATA.players]
    .filter(p => !hiddenPlayers.has(p.key))
    .sort((a,b) => {
      if (heatmapSort.col === 'player'){
        return heatmapSort.dir * a.short.toLowerCase().localeCompare(b.short.toLowerCase());
      }
      if (heatmapSort.col === 'cascade'){
        const rmA = round.rank_matrix[a.key] ?? [];
        const rmB = round.rank_matrix[b.key] ?? [];
        for (let i=0;i<n;i++){
          const d = (rmA[i]??0) - (rmB[i]??0);
          if (d !== 0) return heatmapSort.dir * d;
        }
        return 0;
      }
      const rmA = round.rank_matrix[a.key] ?? [];
      const rmB = round.rank_matrix[b.key] ?? [];
      const start = Number(heatmapSort.col);
      for (let i=start;i<n;i++){
        const d = (rmA[i]??0) - (rmB[i]??0);
        if (d !== 0) return heatmapSort.dir * d;
      }
      return 0;
    });

  const tbody = document.createElement('tbody');
  sorted.forEach(p => {
    const rm = round.rank_matrix[p.key] ?? Array(n).fill(0);
    const tr = document.createElement('tr');
    const cells = rm.map((v,ri) => {
      const bg = heatBg(v, p.key);
      return `<td><span class="hm-cell" style="background:${bg}" title="${pct(v,2)}">${pct(v,0)}</span></td>`;
    }).join('');
    tr.innerHTML = `<td><div class="pcell"><span class="dot" style="background:${p.color}"></span>${p.short}</div></td>${cells}`;
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
}

// ═══════════════════════════════════════════════
// TIMELINE CHART
// ═══════════════════════════════════════════════
function initTimeline(){
  const labels = DATA.rounds.map(r => r.label);
  sortedPlayers = [...DATA.players].sort((a,b) =>
    (DATA.rounds[DATA.rounds.length-1].winner_probs[b.key]??0) -
    (DATA.rounds[DATA.rounds.length-1].winner_probs[a.key]??0));
  const sortedP = sortedPlayers;

  timelineChart = new Chart(document.getElementById('cTimeline').getContext('2d'), {
    type:'line',
    data:{
      labels,
      datasets: sortedP.map(p => ({
        label: p.short,
        data: DATA.rounds.map(r => +((r.winner_probs[p.key]??0)*100).toFixed(2)),
        borderColor: p.color,
        backgroundColor: p.color+'14',
        tension:.35, fill:false,
        // future points fade out
        pointRadius:       ctx => ctx.dataIndex > currentIdx ? 2.5 : 4,
        pointHoverRadius:  6,
        pointBackgroundColor: ctx => ctx.dataIndex > currentIdx ? hexAlpha(p.color, 0.18) : p.color,
        pointBorderColor:     ctx => ctx.dataIndex > currentIdx ? hexAlpha(p.color, 0.18) : p.color,
        // future line segments become dashed + transparent
        segment:{
          borderColor: ctx => ctx.p1DataIndex > currentIdx ? hexAlpha(p.color, 0.18) : p.color,
          borderDash:  ctx => ctx.p1DataIndex > currentIdx ? [6,4] : undefined,
          borderWidth: ctx => ctx.p1DataIndex > currentIdx ? 1.5 : 2.5,
        },
      }))
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      scales:{
        x:{grid:{color:'rgba(120,180,255,.1)'},ticks:{font:{size:11}}},
        y:{grid:{color:'rgba(120,180,255,.1)'},ticks:{callback:v=>v+'%',font:{size:11}},
           title:{display:true,text:'Win Probability (%)',color:'#6a7ca3'}}
      },
      plugins:{
        legend:{position:'bottom',labels:{boxWidth:12,padding:13,font:{size:12}}},
        tooltip:{itemSort:(a,b)=>b.parsed.y-a.parsed.y,callbacks:{label:ctx=>` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`}},
        annotation:{annotations:{vline:{type:'line',xMin:currentIdx,xMax:currentIdx,
          borderColor:'#ffee58cc',borderWidth:1.5,borderDash:[5,4]}}}
      }
    }
  });
}

// ═══════════════════════════════════════════════
// EXP SCORE CHART
// ═══════════════════════════════════════════════
function initExpScore(){
  const labels = DATA.rounds.map(r => r.label);
  const sortedP = [...DATA.players].sort((a,b) =>
    (DATA.rounds[DATA.rounds.length-1].winner_probs[b.key]??0) -
    (DATA.rounds[DATA.rounds.length-1].winner_probs[a.key]??0));

  expScoreChart = new Chart(document.getElementById('cExpScore').getContext('2d'), {
    type:'line',
    data:{
      labels,
      datasets: sortedP.map(p => ({
        label: p.short,
        data: DATA.rounds.map(r => +((r.expected_points[p.key]??0).toFixed(2))),
        borderColor: p.color,
        backgroundColor: p.color+'14',
        tension:.35, fill:false,
        pointRadius:       ctx => ctx.dataIndex > currentIdx ? 2.5 : 4,
        pointHoverRadius:  6,
        pointBackgroundColor: ctx => ctx.dataIndex > currentIdx ? hexAlpha(p.color, 0.18) : p.color,
        pointBorderColor:     ctx => ctx.dataIndex > currentIdx ? hexAlpha(p.color, 0.18) : p.color,
        segment:{
          borderColor: ctx => ctx.p1DataIndex > currentIdx ? hexAlpha(p.color, 0.18) : p.color,
          borderDash:  ctx => ctx.p1DataIndex > currentIdx ? [6,4] : undefined,
          borderWidth: ctx => ctx.p1DataIndex > currentIdx ? 1.5 : 2.5,
        },
      }))
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      scales:{
        x:{grid:{color:'rgba(120,180,255,.1)'},ticks:{font:{size:11}}},
        y:{grid:{color:'rgba(120,180,255,.1)'},
           ticks:{stepSize:1,font:{size:11}},
           title:{display:true,text:`Expected Final Score (out of ${DATA.meta.total_rounds})`,color:'#6a7ca3'}}
      },
      plugins:{
        legend:{position:'bottom',labels:{boxWidth:12,padding:13,font:{size:12}}},
        tooltip:{itemSort:(a,b)=>b.parsed.y-a.parsed.y,callbacks:{label:ctx=>` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} pts`}},
        annotation:{annotations:{vline:{type:'line',xMin:currentIdx,xMax:currentIdx,
          borderColor:'#ffee58cc',borderWidth:1.5,borderDash:[5,4]}}}
      }
    }
  });
}

// ═══════════════════════════════════════════════
// WIN % BAR CHART
// ═══════════════════════════════════════════════
function initWinPct(){
  winPctChart = new Chart(document.getElementById('cWinPct').getContext('2d'), {
    type:'bar',
    data:{labels:[],datasets:[{label:'Win Probability',data:[],
      backgroundColor:[],borderColor:[],borderWidth:1,borderRadius:4}]},
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{label:ctx=>` ${ctx.parsed.x.toFixed(1)}%`}}},
      scales:{
        x:{grid:{color:'rgba(120,180,255,.1)'},ticks:{callback:v=>v+'%',font:{size:11}},max:100},
        y:{grid:{display:false},ticks:{font:{size:12}}}
      }
    }
  });
}

// ═══════════════════════════════════════════════
// TITLE RACE
// ═══════════════════════════════════════════════
let titleRaceData = [];

function initTitleRace(){
  titleRaceChart = new Chart(document.getElementById('cTitleRace').getContext('2d'), {
    type:'bar',
    data:{labels:[], datasets:[
      {label:'Current', data:[], backgroundColor:[], borderColor:[], borderWidth:1},
      {label:'Remaining', data:[], backgroundColor:[], borderColor:[], borderWidth:1}
    ]},
    options:{
      indexAxis:'y',
      responsive:true, maintainAspectRatio:false,
      scales:{
        x:{stacked:true, grid:{color:'rgba(120,180,255,.1)'},
           ticks:{font:{size:11}, stepSize:1},
           title:{display:true, text:'Points', color:'#6a7ca3'}, min:0},
        y:{stacked:true, grid:{display:false}, ticks:{font:{size:12}}}
      },
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{
          label: ctx => {
            const d = titleRaceData[ctx.dataIndex];
            if (!d) return '';
            if (ctx.datasetIndex===0) return ` Current: ${d.score} pts \u00b7 Win: ${pct(d.wp)}`;
            return ` Max: ${d.score+d.maxAdd} pts (+${d.maxAdd} remaining)`;
          }
        }},
        annotation:{annotations:{}}
      }
    }
  });
}

function updateTitleRace(round){
  const totalR = DATA.meta.total_rounds;
  const lastPlayed = round.round_num - 1;
  const remaining = totalR - lastPlayed;
  const card = document.getElementById('titleRaceCard');
  card.style.display = '';

  const elim = round.eliminated || {};

  const sorted = [...DATA.players].sort((a,b) => {
    const sa = round.actual_scores[a.key]??0, sb = round.actual_scores[b.key]??0;
    if (sb !== sa) return sb - sa;
    return (round.winner_probs[b.key]??0) - (round.winner_probs[a.key]??0);
  });

  const leaderScore = round.actual_scores[sorted[0].key] ?? 0;

  titleRaceData = sorted.map(p => {
    const score = round.actual_scores[p.key] ?? 0;
    const wp = round.winner_probs[p.key] ?? 0;
    return {
      key:p.key, short:p.short, color:p.color,
      score, maxAdd:remaining, wp,
      eliminated: elim[p.key]
    };
  });

  const ds0 = titleRaceChart.data.datasets[0];
  const ds1 = titleRaceChart.data.datasets[1];
  titleRaceChart.data.labels = titleRaceData.map(d => d.short);
  ds0.data = titleRaceData.map(d => d.score);
  ds0.backgroundColor = titleRaceData.map(d => d.eliminated ? hexAlpha(d.color,0.2) : hexAlpha(d.color,0.8));
  ds0.borderColor     = titleRaceData.map(d => d.eliminated ? hexAlpha(d.color,0.25) : d.color);
  ds1.data = titleRaceData.map(d => d.maxAdd);
  ds1.backgroundColor = titleRaceData.map(d => d.eliminated ? 'rgba(255,255,255,0.02)' : hexAlpha(d.color,0.15));
  ds1.borderColor     = titleRaceData.map(d => d.eliminated ? 'rgba(255,255,255,0.04)' : hexAlpha(d.color,0.25));

  titleRaceChart.options.plugins.annotation.annotations = {
    leaderLine:{
      type:'line', xMin:leaderScore, xMax:leaderScore,
      borderColor:'#ffee58cc', borderWidth:2, borderDash:[6,4],
      label:{
        display:true,
        content:`Leader: ${leaderScore} pts`,
        position:'start', color:'#ffee58',
        font:{size:10, family:"'JetBrains Mono', monospace"},
        backgroundColor:'rgba(11,17,32,0.75)', padding:4
      }
    }
  };
  titleRaceChart.options.scales.x.max = totalR + 0.5;
  titleRaceChart.update();

  // Contender detail: remaining games for alive players
  const detail = document.getElementById('titleRaceDetail');
  const contenders = titleRaceData.filter(d => !d.eliminated);
  const elimCount = titleRaceData.length - contenders.length;

  if (contenders.length > 0 && contenders.length < titleRaceData.length && remaining > 0){
    const lines = contenders.map(d => {
      const games = [];
      DATA.all_games.forEach(ag => {
        if (ag.round_num <= lastPlayed) return;
        ag.games.forEach(g => {
          let opp = null, clr = '';
          if (g.white === d.key){ opp = g.black; clr = 'W'; }
          else if (g.black === d.key){ opp = g.white; clr = 'B'; }
          if (opp){
            const os = P_MAP[opp]?.short ?? opp;
            const isRival = contenders.some(c => c.key === opp);
            const tag = isRival
              ? `<strong style="color:${P_MAP[opp]?.color??'var(--paper)'}">${os}</strong>`
              : os;
            games.push(`R${ag.round_num} vs ${tag} (${clr})`);
          }
        });
      });
      return `<div style="margin-bottom:.4rem">`+
        `<span style="color:${d.color};font-weight:600">${d.short}</span>`+
        `<span style="color:var(--paper-3);margin:0 .4rem">\u00b7</span>`+
        `<span style="font-family:'JetBrains Mono',monospace;font-size:.82rem">${d.score} pts</span>`+
        `<span style="color:var(--paper-3);margin:0 .4rem">\u00b7</span>`+
        `<span class="${winpctTier(d.wp)}">${pct(d.wp)}</span>`+
        `<span style="color:var(--paper-3);margin:0 .4rem">\u2192</span>`+
        `<span style="color:var(--paper-2);font-size:.82rem">${games.join(' \u00b7 ')}</span>`+
        `</div>`;
    });
    detail.innerHTML =
      `<div style="font-family:'JetBrains Mono',monospace;font-size:.62rem;color:var(--paper-3);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.55rem">Contenders\u2019 Remaining Games</div>`+
      lines.join('');
  } else {
    detail.innerHTML = '';
  }

  document.getElementById('titleRaceNote').textContent =
    `${remaining} round${remaining!==1?'s':''} remaining. `+
    `${contenders.length} player${contenders.length!==1?'s':''} mathematically alive`+
    (elimCount > 0 ? `, ${elimCount} eliminated` : '')+
    `. Dashed line = leader\u2019s current score \u2014 eliminated players cannot finish first in any remaining-game scenario.`;

  document.getElementById('titleRaceLabel').textContent =
    `Title Race \u2014 ${remaining} Round${remaining!==1?'s':''} Remaining`;
}

// ═══════════════════════════════════════════════
// SCENARIO TREE (interactive, navigable SVG tree)
// ═══════════════════════════════════════════════
let _seTree = null;
let _sePath = [];
let _seGames = [];
let _seContenders = [];     // dropdown-visible contenders (state-dependent)
let _seBaseContenders = []; // current-round contenders (used when no lock OR no edit-in-locked)
let _seAllPlayers = [];     // every player (used for tree pruning and edit-in-locked contender set)
let _seRandomTarget = null;  // null = any, or player key
let _seSoleWin = false;      // true = only accept sole first place (no ties)
let _seWinPaths = {};      // precomputed winning paths: {playerKey: {gameKey: outcome_idx}}
let _seSoleWinPaths = {};  // {playerKey: true/false} — whether the stored path is a sole win
let _seOrphaned = [];  // steps lost after breadcrumb edit: [{round,ws,bs,k,actual}]
let _seLockedDepth = -1;  // inclusive depth up to which breadcrumb is locked (-1 = none)
const SE_NS = 'http://www.w3.org/2000/svg';

function _seResultToOutcome(r){
  // Map result string to outcome index: 0=W, 1=D, 2=L (from white's perspective)
  if (r === '1-0') return 0;
  if (r === '1/2-1/2') return 1;
  if (r === '0-1') return 2;
  return null;
}

function _seLeafCardHTML(scores, winner, tied, players, animName, bannerLabel){
  const sorted = [...players].sort((a,b) => scores[b.key] - scores[a.key]);
  const anim = animName ? 'animation:'+animName+' .3s ease-out both' : '';
  let html = '<div style="'+anim+'"><div>';
  if (winner){
    html += '<div style="text-align:center;padding:1.5rem;background:rgba(0,230,118,.06);border:1px solid rgba(0,230,118,.25);border-radius:8px">' +
      '<div style="font-size:.65rem;color:var(--paper-3);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.4rem">'+bannerLabel+'</div>' +
      '<div style="font-size:1.3rem;font-weight:700;color:'+winner.color+'">\u2605 '+winner.short+'</div>' +
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:.85rem;color:var(--paper-2);margin-top:.3rem">'+scores[winner.key]+' points</div></div>';
  } else if (tied && tied.length){
    html += '<div style="text-align:center;padding:1.5rem;background:rgba(236,239,241,.05);border:1px solid rgba(236,239,241,.25);border-radius:8px">' +
      '<div style="font-size:.65rem;color:#eceff1;text-transform:uppercase;letter-spacing:.14em;margin-bottom:.4rem">Tiebreak Required</div>' +
      '<div style="font-size:1.1rem;font-weight:700">'+tied.map(function(p){return '<span style="color:'+p.color+'">'+p.short+'</span>';}).join(' \u00b7 ')+'</div>' +
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:.85rem;color:var(--paper-2);margin-top:.3rem">Tied at '+scores[tied[0].key]+' points</div></div>';
  }
  const maxScore = Math.max(...sorted.map(function(p){return scores[p.key];}));
  html += '<div style="margin-top:.8rem;display:flex;flex-direction:column;gap:.4rem;font-family:\'JetBrains Mono\',monospace;font-size:.8rem">' + sorted.map(function(p){
    var sc = scores[p.key];
    var barW = maxScore > 0 ? (sc / maxScore * 100) : 0;
    return '<div style="display:flex;align-items:center;gap:.5rem">' +
      '<span style="color:'+p.color+';font-weight:600;width:8em;text-align:right;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+p.short+'</span>' +
      '<div style="flex:1;height:8px;background:var(--rule);border-radius:2px;overflow:hidden">' +
        '<div style="width:'+barW+'%;height:100%;background:'+p.color+';border-radius:2px"></div></div>' +
      '<span style="color:var(--paper-2);width:4.5em;text-align:right;flex-shrink:0">'+sc+' pts</span></div>';
  }).join('') + '</div></div></div>';
  return html;
}

function _seDecidedLeafCard(scores, bannerLabel){
  const players = DATA.players.slice();
  const sorted = players.slice().sort((a,b) => scores[b.key] - scores[a.key]);
  const topScore = scores[sorted[0].key];
  const tied = sorted.filter(p => scores[p.key] === topScore);
  const winner = tied.length === 1 ? tied[0] : null;
  return _seLeafCardHTML(scores, winner, tied, players, null, bannerLabel);
}

function initScenarioExplorer(){
  _seSuppressScroll = true;
  try { _initScenarioExplorer(); } finally { _seSuppressScroll = false; }
}
function _initScenarioExplorer(){
  const container = document.getElementById('scenarioContainer');
  const round = DATA.rounds[currentIdx];
  const totalR = DATA.meta.total_rounds;
  const lastPlayed = round.round_num - 1;
  const remaining = totalR - lastPlayed;

  if (remaining <= 0){
    const finalScores = {};
    DATA.players.forEach(p => { finalScores[p.key] = round.actual_scores[p.key] ?? 0; });
    container.innerHTML = _seDecidedLeafCard(finalScores, 'Tournament complete');
    return;
  }

  // Reset Random button state when switching rounds
  _seRandomTarget = null;
  _seSoleWin = false;
  _seLockedDepth = -1;

  // Determine contenders via DFS: players who can still finish first
  const elim = round.eliminated || {};
  _seWinPaths = round.win_paths || {};
  _seSoleWinPaths = round.sole_win_paths || {};
  const scores = {};
  DATA.players.forEach(p => { scores[p.key] = round.actual_scores[p.key] ?? 0; });

  _seAllPlayers = DATA.players.slice().sort((a,b) => scores[b.key] - scores[a.key]);
  _seBaseContenders = DATA.players
    .filter(p => !elim[p.key])
    .sort((a,b) => scores[b.key] - scores[a.key]);
  _seContenders = _seBaseContenders.slice();

  if (_seBaseContenders.length <= 1){
    const winner = _seBaseContenders[0] || null;
    container.innerHTML = _seLeafCardHTML(scores, winner, winner ? null : [], DATA.players.slice(), null, 'Tournament already decided');
    return;
  }

  _seGames = [];
  DATA.all_games.forEach(ag => {
    if (ag.round_num <= lastPlayed) return;
    ag.games.forEach(g => {
      _seGames.push({
        round: ag.round_num,
        white: g.white, black: g.black,
        ws: P_MAP[g.white]?.short ?? g.white,
        bs: P_MAP[g.black]?.short ?? g.black,
        wc: P_MAP[g.white]?.color ?? '#8494be',
        bc: P_MAP[g.black]?.color ?? '#8494be',
        probs: g.probs,
        actual: _seResultToOutcome(g.result)
      });
    });
  });
  _seGames.sort((a,b) => a.round - b.round);

  const initScores = {};
  DATA.players.forEach(p => { initScores[p.key] = round.actual_scores[p.key] ?? 0; });

  _seTree = _seMakeNode(initScores, _seGames.map((_,i) => i));
  _sePath = [];

  container.innerHTML =
    '<div style="margin-bottom:1.5rem;padding:.9rem 1.1rem;background:rgba(120,180,255,.04);border-left:2px solid rgba(120,180,255,.35);border-radius:2px;font-size:.72rem;line-height:1.7;color:var(--paper-3);font-family:\'JetBrains Mono\',monospace">' +
      '<div onclick="_seToggleHowTo()" id="seHowToHeader" style="cursor:pointer;display:flex;align-items:center;gap:6px;font-size:.6rem;letter-spacing:.14em;font-weight:700;color:#78b4ff;text-transform:uppercase;user-select:none">' +
        '<span id="seHowToCaret" style="font-size:.55rem;transition:transform .15s;transform:rotate(-90deg)">\u25be</span>' +
        '<span>How to explore</span>' +
      '</div>' +
      '<ul id="seHowToList" style="display:none;margin:.4rem 0 0;padding-left:1.1rem;list-style:square">' +
        '<li>Click a <span style="color:var(--paper-2)">game pill</span> in the breadcrumb to swap its outcome.</li>' +
        '<li>Click a <span style="color:#4dd0e1">round label (R#)</span> to lock that prefix; Random draws then only resample the remainder.</li>' +
        '<li>Editing a pill <em>inside</em> the locked prefix turns the prefix hypothetical.</li>' +
        '<li>Use the <span style="color:var(--paper-2)">Random \u25be</span> dropdown to pick a target player, and toggle <span style="color:#ffee58">Sole 1st only</span> to require an outright winner.</li>' +
        '<li><span style="color:var(--paper-2)">\u2713 Follow Truth</span> extends the breadcrumb using the actual played results from the current point onward.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="position:relative;height:36px;margin-bottom:1.5rem">' +
      '<button class="show-more-btn" onclick="_seNav(-1)" style="font-size:.75rem;white-space:nowrap;position:absolute;left:0;top:0">\u21ba Reset</button>' +
      '<button id="seFollowTruthBtn" class="show-more-btn" onclick="_seFollowTruth()" style="font-size:.75rem;white-space:nowrap;position:absolute;left:50%;top:0;transform:translateX(-50%)">\u2713 Follow Truth</button>' +
      '<div style="position:absolute;right:0;top:0;display:inline-flex">' +
        '<button id="seRandomBtn" class="show-more-btn" onclick="_seRandom()" style="font-size:.75rem;border-radius:4px 0 0 4px;border-right:1px solid rgba(120,180,255,.15);white-space:nowrap">\u27f3 Random: Any</button>' +
        '<button class="show-more-btn" onclick="_seToggleRandomMenu()" style="font-size:.75rem;border-radius:0 4px 4px 0;padding:0 6px">\u25be</button>' +
        '<div id="seRandomMenu" style="display:none;position:absolute;top:100%;right:0;margin-top:4px;background:rgba(15,22,40,0.97);border:1px solid rgba(120,180,255,.2);border-radius:4px;z-index:10;min-width:140px;padding:4px 0">' +
          '<div onclick="_seSetRandomTarget(null)" style="padding:5px 12px;cursor:pointer;font-family:\'JetBrains Mono\',monospace;font-size:.72rem;color:#78b4ff;white-space:nowrap" '+
            'onmouseenter="this.style.background=\'rgba(120,180,255,.1)\'" onmouseleave="this.style.background=\'none\'">' +
            'Any</div>' +
          _seContenders.map(function(p){
            return '<div onclick="_seSetRandomTarget(\''+p.key+'\')" style="padding:5px 12px;cursor:pointer;font-family:\'JetBrains Mono\',monospace;font-size:.72rem;color:'+p.color+';white-space:nowrap" '+
              'onmouseenter="this.style.background=\'rgba(120,180,255,.1)\'" onmouseleave="this.style.background=\'none\'">' +
              p.short+'</div>';
          }).join('') +
          '<div style="border-top:1px solid rgba(120,180,255,.15);margin:4px 0"></div>' +
          '<div id="seSoleWinBtn" onclick="_seToggleSoleWin()" style="padding:5px 12px;cursor:pointer;font-family:\'JetBrains Mono\',monospace;font-size:.82rem;white-space:nowrap;color:var(--paper-4);text-decoration:line-through;transition:color .2s,background .2s;border-radius:3px" '+
            'onmouseenter="if(!window._seSoleWin)this.style.background=\'rgba(255,255,255,.06)\'" onmouseleave="if(!window._seSoleWin)this.style.background=\'none\'">' +
            'Sole 1st only</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div id="seSamplerStatus" style="margin-bottom:1rem;display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:.66rem;font-family:\'JetBrains Mono\',monospace;border-radius:4px;line-height:1.4;letter-spacing:.03em"></div>' +
    '<div id="seError" style="display:none;margin-bottom:1rem;align-items:center;gap:6px;padding:8px 12px;font-size:.7rem;font-family:\'JetBrains Mono\',monospace;color:#ff6b6b;background:rgba(255,82,82,.08);border:1px solid rgba(255,107,107,.35);border-radius:4px;line-height:1.5">' +
      '<span style="font-size:.75rem">\u26a0</span>' +
      '<span id="seErrorText" style="flex:1"></span>' +
    '</div>' +
    '<div id="seTargetNote" style="display:none;margin-bottom:1rem;align-items:center;gap:6px;padding:8px 12px;font-size:.7rem;font-family:\'JetBrains Mono\',monospace;color:#ffb74d;background:rgba(255,183,77,.06);border:1px solid rgba(255,183,77,.25);border-radius:4px;line-height:1.5">' +
      '<span style="font-size:.75rem">\u26a0</span>' +
      '<span id="seTargetNoteText" style="flex:1"></span>' +
    '</div>' +
    '<div id="seCrumb" style="margin-bottom:1.25rem"></div>' +
    '<div id="seSvgWrap" style="overflow-x:hidden;margin-bottom:1rem"></div>' +
    '<div id="seFootnote" style="display:none;margin-top:1rem;padding:8px 12px;font-size:.7rem;font-family:\'JetBrains Mono\',monospace;color:#ffb74d;background:rgba(255,183,77,.08);border:1px solid rgba(255,183,77,.2);border-radius:4px;line-height:1.5"></div>';

  _seRenderAll();
}

/* ── node factory with elimination pruning ── */
function _seMakeNode(scores, pendingGIs){
  const node = {scores: {...scores}};
  const sorted = [..._seAllPlayers].sort((a,b) => scores[b.key] - scores[a.key]);
  const leaderScore = scores[sorted[0].key];
  const alive = [];
  sorted.forEach(p => {
    const gl = pendingGIs.filter(gi => {
      const g = _seGames[gi]; return g.white === p.key || g.black === p.key;
    }).length;
    if (scores[p.key] + gl >= leaderScore) alive.push(p.key);
  });
  node.alive = new Set(alive);
  // Remove games not involving any alive contender
  node.pending = pendingGIs.filter(gi => {
    const g = _seGames[gi]; return node.alive.has(g.white) || node.alive.has(g.black);
  });
  // Leaf: no pending games OR only 1 player alive (clinched)
  if (node.pending.length === 0 || alive.length <= 1){
    node.leaf = true;
    if (alive.length === 1){
      // Clinched: one player can't be caught
      node.tied = [sorted.find(p => p.key === alive[0])];
      node.winner = node.tied[0];
    } else {
      const top = scores[sorted[0].key];
      node.tied = sorted.filter(p => scores[p.key] === top);
      node.winner = node.tied.length === 1 ? node.tied[0] : null;
    }
  }
  return node;
}

/* ── lazy child generation: branches for current round only ── */
function _seGenChildren(node){
  if (node.leaf || node.ch) return;
  const curRound = Math.min(...node.pending.map(gi => _seGames[gi].round));
  const curGIs = node.pending.filter(gi => _seGames[gi].round === curRound);
  node.ch = [];
  curGIs.forEach(gi => {
    const g = _seGames[gi];
    [{k:'W',wp:1,bp:0,p:g.probs[0]},{k:'D',wp:.5,bp:.5,p:g.probs[1]},{k:'L',wp:0,bp:1,p:g.probs[2]}]
      .forEach(({k,wp,bp,p}) => {
        const ns = {...node.scores}; ns[g.white] += wp; ns[g.black] += bp;
        node.ch.push({k, p, gi, child: _seMakeNode(ns, node.pending.filter(i => i !== gi))});
      });
  });
}

/* ── navigation ── */
let _seNavDir = 'fade';  // 'forward','backward','fade'
let _seDfsWarning = '';  // non-empty when DFS fallback was used
let _seSuppressScroll = false;  // true during (re)init, so round-tab changes don't yank the page
function _seGetFocused(){
  let n = _seTree;
  for (const i of _sePath){ _seGenChildren(n); if (n.ch && n.ch[i]) n = n.ch[i].child; else break; }
  return n;
}
function _seBuildPastChain(){
  const chain = [];
  let n = _seTree;
  for (let i = 0; i < _sePath.length; i++){
    _seGenChildren(n);
    const e = n.ch[_sePath[i]];
    chain.push({node:n, edge:e, game:_seGames[e.gi]});
    n = e.child;
  }
  return chain;
}
function _seNav(d){
  _seNavDir = 'backward'; _seDfsWarning = ''; _seOrphaned = [];
  _sePath = d < 0 ? [] : _sePath.slice(0,d);
  // If truncation cuts into the locked prefix, clear the lock (user can re-lock a round).
  if (_seLockedDepth >= _sePath.length) _seLockedDepth = -1;
  _seRenderAll();
}
function _seClick(ci){ _seNavDir = 'forward'; _seDfsWarning = ''; _seOrphaned = []; _sePath.push(ci); _seRenderAll(); }
function _seFollowTruth(){
  _seNavDir = 'forward';
  _seDfsWarning = '';
  _seOrphaned = [];
  let n = _seGetFocused();
  let added = 0;
  while (!n.leaf){
    _seGenChildren(n);
    if (!n.ch || !n.ch.length) break;
    const gi0 = n.ch[0].gi;
    const g = _seGames[gi0];
    if (g.actual === null) break;  // no actual result from here
    const targetK = ['W','D','L'][g.actual];
    let found = false;
    for (let i = 0; i < n.ch.length; i++){
      if (n.ch[i].gi === gi0 && n.ch[i].k === targetK){
        _sePath.push(i);
        n = n.ch[i].child;
        added++;
        found = true;
        break;
      }
    }
    if (!found) break;
  }
  if (added === 0){
    // No actual results to follow from here
    return;
  }
  _seRenderAll();
}
function _seSetRandomTarget(key){
  _seRandomTarget = key;
  const btn = document.getElementById('seRandomBtn');
  if (btn){
    if (key){
      const p = _seAllPlayers.find(function(c){return c.key===key;});
      if (p) btn.innerHTML = '\u27f3 Random: <span style="color:'+p.color+';font-weight:700">'+p.short+'</span>';
    } else {
      btn.textContent = '\u27f3 Random: Any';
    }
  }
  _seToggleRandomMenu();
  _seRandom();
}
function _seIsWinFor(nd, key){
  if (nd.winner && nd.winner.key === key) return true;
  if (!_seSoleWin && nd.tied && nd.tied.some(function(p){return p.key===key;})) return true;
  return false;
}
function _seToggleSoleWin(){
  _seSoleWin = !_seSoleWin;
  const el = document.getElementById('seSoleWinBtn');
  if (el){
    el.style.color = _seSoleWin ? '#ffee58' : 'var(--paper-4)';
    el.style.background = _seSoleWin ? 'rgba(255,238,88,.1)' : 'none';
    el.style.fontWeight = _seSoleWin ? '700' : '400';
    el.style.textDecoration = _seSoleWin ? 'none' : 'line-through';
  }
}
function _seRandom(){
  const targetKey = _seRandomTarget;
  _seNavDir = 'forward';
  _seDfsWarning = '';
  _seOrphaned = [];
  _seShowError('');
  // Preserve the locked prefix; sampling extends from the locked node forward.
  const lockedPrefix = (_seLockedDepth >= 0) ? _sePath.slice(0, _seLockedDepth + 1) : [];
  let lockedNode = _seTree;
  for (let i = 0; i < lockedPrefix.length; i++){
    _seGenChildren(lockedNode);
    if (!lockedNode.ch || !lockedNode.ch[lockedPrefix[i]]){ lockedNode = null; break; }
    lockedNode = lockedNode.ch[lockedPrefix[i]].child;
  }
  if (!lockedNode){ _seShowError('Could not resolve locked breadcrumb.'); return; }
  const MAX_TRIES = 1000;
  // If locked prefix already reaches a leaf, just display it.
  if (lockedNode.leaf){
    if (targetKey && !_seIsWinFor(lockedNode, targetKey)){
      const pn = _seAllPlayers.find(function(p){return p.key===targetKey;})?.short||targetKey;
      _seShowError('Locked prefix already determines the outcome and is not a '+(_seSoleWin?'sole first place':'winning')+' path for '+pn+'.');
      return;
    }
    if (!targetKey && _seSoleWin && !lockedNode.winner){
      _seShowError('Locked prefix already determines the outcome and is not a sole first place path.');
      return;
    }
    _sePath = lockedPrefix; _seRenderAll(); return;
  }
  const editInLocked = _seEditInLocked();
  const needsCheck = targetKey || _seSoleWin;
  const checkWin = targetKey
    ? function(nd){ return _seIsWinFor(nd, targetKey); }
    : function(nd){ return !!nd.winner; };  // only used when _seSoleWin

  // Short-circuit: the "top score reachable" check (lockedNode.alive) is a sufficient
  // elimination condition. If a target is outside alive, they're definitely eliminated —
  // no need to sample.
  if (targetKey && lockedNode.alive && !lockedNode.alive.has(targetKey)){
    const pn = _seAllPlayers.find(function(p){return p.key===targetKey;})?.short||targetKey;
    const ctx = editInLocked
      ? 'Even with the modified history, '+pn+' cannot mathematically catch the leader from the locked position \u2014 they are already eliminated.'
      : 'Given the locked prefix, '+pn+' cannot mathematically catch the leader \u2014 they are already eliminated.';
    _seShowError(ctx);
    return;
  }

  if (editInLocked){
    // Edit inside the locked prefix: the locked state is hypothetical, so precomputed
    // weighted paths/DFS don't apply. Restrict to 1000 uniform samples from the locked node.
    for (let t = 0; t < MAX_TRIES; t++){
      const ext = []; let nd = lockedNode;
      while (!nd.leaf){
        _seGenChildren(nd);
        if (!nd.ch || !nd.ch.length) break;
        const gi0 = nd.ch[0].gi;
        const outs = []; nd.ch.forEach(function(c,i){ if (c.gi === gi0) outs.push({c:c,i:i}); });
        const ch = outs[Math.floor(Math.random() * outs.length)];
        ext.push(ch.i); nd = ch.c.child;
      }
      if (!needsCheck || (nd.leaf && checkWin(nd))){
        _sePath = lockedPrefix.concat(ext); _seRenderAll(); return;
      }
    }
    const who = targetKey ? (_seAllPlayers.find(function(p){return p.key===targetKey;})?.short||targetKey) : 'any contender';
    const kind = _seSoleWin ? 'sole first place' : 'winning';
    const cannotVerb = _seSoleWin ? 'can no longer achieve sole first place' : 'can no longer finish first';
    const msg = targetKey
      ? 'No '+kind+' path found for '+who+' in '+MAX_TRIES.toLocaleString()+' uniform samples from the locked prefix. This could mean the run got unlucky \u2014 try again \u2014 or that '+who+' '+cannotVerb+' under the modified history (confirming that requires an exhaustive search).'
      : 'No '+kind+' path found in '+MAX_TRIES.toLocaleString()+' uniform samples from the locked prefix. Sampling is random \u2014 try again.';
    _seShowError(msg);
    return;
  }

  // Unlocked: full sampling ladder (weighted → uniform → DFS).
  if (targetKey){
    for (let t = 0; t < MAX_TRIES; t++){
      const ext = []; let nd = lockedNode;
      while (!nd.leaf){
        _seGenChildren(nd);
        if (!nd.ch || !nd.ch.length) break;
        const gi0 = nd.ch[0].gi;
        const outs = []; nd.ch.forEach((c,i) => { if (c.gi === gi0) outs.push({c,i}); });
        const r = Math.random(); let cum = 0, ch = outs[outs.length-1];
        for (const o of outs){ cum += o.c.p; if (r < cum){ ch = o; break; } }
        ext.push(ch.i); nd = ch.c.child;
      }
      if (_seIsWinFor(nd, targetKey)){ _sePath = lockedPrefix.concat(ext); _seRenderAll(); return; }
    }
    const pName = _seAllPlayers.find(function(p){return p.key===targetKey;})?.short||targetKey;
    for (let t = 0; t < MAX_TRIES; t++){
      const ext = []; let nd = lockedNode;
      while (!nd.leaf){
        _seGenChildren(nd);
        if (!nd.ch || !nd.ch.length) break;
        const gi0 = nd.ch[0].gi;
        const outs = []; nd.ch.forEach((c,i) => { if (c.gi === gi0) outs.push({c,i}); });
        const ch = outs[Math.floor(Math.random() * outs.length)];
        ext.push(ch.i); nd = ch.c.child;
      }
      if (_seIsWinFor(nd, targetKey)){
        _seDfsWarning = 'Win probability for '+pName+' is very low. No path found in '+MAX_TRIES.toLocaleString()+' weighted samples; found via uniform random sampling after '+(t+1).toLocaleString()+' tries.';
        _sePath = lockedPrefix.concat(ext); _seRenderAll(); return;
      }
    }
    function dfsFindWin(nd){
      if (nd.leaf){ return _seIsWinFor(nd, targetKey) ? [] : null; }
      _seGenChildren(nd);
      if (!nd.ch || !nd.ch.length) return null;
      const gi0 = nd.ch[0].gi;
      const outs = []; nd.ch.forEach(function(c,i){ if (c.gi === gi0) outs.push({c:c,i:i}); });
      for (let j = 0; j < outs.length; j++){
        const sub = dfsFindWin(outs[j].c.child);
        if (sub !== null) return [outs[j].i].concat(sub);
      }
      return null;
    }
    const dfsPath = dfsFindWin(lockedNode);
    if (dfsPath){
      _seDfsWarning = 'Win probability for '+pName+' is extremely low. No path found in '+MAX_TRIES.toLocaleString()+' weighted + '+MAX_TRIES.toLocaleString()+' uniform samples; resolved via deterministic search.';
      _sePath = lockedPrefix.concat(dfsPath); _seRenderAll(); return;
    }
    const conclusion = _seSoleWin
      ? pName+' cannot achieve sole first place from this position (they may still be able to tie for first)'
      : pName+' cannot finish first from this position \u2014 they are eliminated';
    _seShowError('Exhaustive search found no '+(_seSoleWin?'sole first place':'winning')+' path for '+pName+' after '+MAX_TRIES.toLocaleString()+' weighted and '+MAX_TRIES.toLocaleString()+' uniform samples. '+conclusion+'.');
    return;
  }
  if (_seSoleWin){
    for (let t = 0; t < MAX_TRIES; t++){
      const ext = []; let nd = lockedNode;
      while (!nd.leaf){
        _seGenChildren(nd);
        if (!nd.ch || !nd.ch.length) break;
        const gi0 = nd.ch[0].gi;
        const outs = []; nd.ch.forEach((c,i) => { if (c.gi === gi0) outs.push({c,i}); });
        const r = Math.random(); let cum = 0, ch = outs[outs.length-1];
        for (const o of outs){ cum += o.c.p; if (r < cum){ ch = o; break; } }
        ext.push(ch.i); nd = ch.c.child;
      }
      if (nd.winner){ _sePath = lockedPrefix.concat(ext); _seRenderAll(); return; }
    }
  }
  const ext = []; let n = lockedNode;
  while (!n.leaf){
    _seGenChildren(n);
    if (!n.ch || !n.ch.length) break;
    const gi0 = n.ch[0].gi;
    const outs = []; n.ch.forEach((c,i) => { if (c.gi === gi0) outs.push({c,i}); });
    const r = Math.random(); let cum = 0, ch = outs[outs.length-1];
    for (const o of outs){ cum += o.c.p; if (r < cum){ ch = o; break; } }
    ext.push(ch.i); n = ch.c.child;
  }
  _sePath = lockedPrefix.concat(ext);
  _seRenderAll();
}
/* ── state helpers: lock/edit detection and contender derivation ── */
function _seWalkToLocked(){
  if (_seLockedDepth < 0) return null;
  let n = _seTree;
  for (let i = 0; i <= _seLockedDepth; i++){
    _seGenChildren(n);
    if (!n.ch || !n.ch[_sePath[i]]) return null;
    n = n.ch[_sePath[i]].child;
  }
  return n;
}
function _seGetLockedRoundNum(){
  if (_seLockedDepth < 0) return null;
  let n = _seTree;
  let rn = null;
  for (let i = 0; i <= _seLockedDepth; i++){
    _seGenChildren(n);
    if (!n.ch || !n.ch[_sePath[i]]) return null;
    const e = n.ch[_sePath[i]];
    rn = _seGames[e.gi].round;
    n = e.child;
  }
  return rn;
}
function _seEditInLocked(){
  // True iff any step in the locked prefix disagrees with the actual result.
  if (_seLockedDepth < 0) return false;
  let n = _seTree;
  for (let i = 0; i <= _seLockedDepth; i++){
    _seGenChildren(n);
    if (!n.ch || !n.ch[_sePath[i]]) return false;
    const e = n.ch[_sePath[i]];
    const g = _seGames[e.gi];
    if (g.actual === null) return true;
    if (['W','D','L'][g.actual] !== e.k) return true;
    n = e.child;
  }
  return false;
}
function _seRecomputeContenders(){
  // No lock: contenders are the current-round base snapshot (authoritative).
  if (_seLockedDepth < 0){
    _seContenders = _seBaseContenders.slice();
    return;
  }
  // Lock: walk the locked prefix and find the latest round R such that every step in
  // rounds 1..R matches the actual result. That round's tail snapshot is the tightest
  // authoritative contender set — any edit invalidates only rounds from that point on.
  let n = _seTree;
  let safeRound = 0;
  let curRn = null;
  let curClean = true;
  let dirtySeen = false;  // once any round has an edit, no later round can be "safe"
  for (let i = 0; i <= _seLockedDepth; i++){
    _seGenChildren(n);
    const e = n.ch[_sePath[i]];
    const g = _seGames[e.gi];
    if (curRn === null || g.round !== curRn){
      if (curRn !== null){
        if (curClean && !dirtySeen) safeRound = curRn;
        else dirtySeen = true;
      }
      curRn = g.round;
      curClean = true;
    }
    const edited = (g.actual === null) || (['W','D','L'][g.actual] !== e.k);
    if (edited) curClean = false;
    n = e.child;
  }
  if (curRn !== null && curClean && !dirtySeen) safeRound = curRn;
  // Pick the base list: snapshot after the last fully-clean round, or _seBaseContenders
  // if edits start from the very first locked round.
  let base, sortScores;
  if (safeRound > 0){
    const snap = DATA.rounds.find(function(r){return r.round_num === safeRound + 1;});
    if (snap && snap.eliminated){
      base = _seAllPlayers.filter(function(p){return !snap.eliminated[p.key];});
      sortScores = snap.actual_scores;
    }
  }
  if (!base){
    base = _seBaseContenders.slice();
    sortScores = null;
  }
  // Further filter by the locked node's math-reachability check (top-score-reachable).
  // A player outside lockedNode.alive is definitely eliminated from the hypothetical state;
  // one inside might still be eliminated, but only a full DFS could prove it.
  const locked = _seWalkToLocked();
  if (locked && locked.alive){
    base = base.filter(function(p){return locked.alive.has(p.key);});
    if (!sortScores) sortScores = locked.scores;
  }
  if (sortScores){
    base.sort(function(a,b){return (sortScores[b.key]||0) - (sortScores[a.key]||0);});
  }
  _seContenders = base;
}
function _seRenderRandomMenu(){
  const menu = document.getElementById('seRandomMenu');
  if (!menu) return;
  let html = '<div onclick="_seSetRandomTarget(null)" style="padding:5px 12px;cursor:pointer;font-family:\'JetBrains Mono\',monospace;font-size:.72rem;color:#78b4ff;white-space:nowrap" '+
    'onmouseenter="this.style.background=\'rgba(120,180,255,.1)\'" onmouseleave="this.style.background=\'none\'">Any</div>';
  _seContenders.forEach(function(p){
    html += '<div onclick="_seSetRandomTarget(\''+p.key+'\')" style="padding:5px 12px;cursor:pointer;font-family:\'JetBrains Mono\',monospace;font-size:.72rem;color:'+p.color+';white-space:nowrap" '+
      'onmouseenter="this.style.background=\'rgba(120,180,255,.1)\'" onmouseleave="this.style.background=\'none\'">'+p.short+'</div>';
  });
  html += '<div style="border-top:1px solid rgba(120,180,255,.15);margin:4px 0"></div>';
  const soleClr = _seSoleWin ? '#ffee58' : 'var(--paper-4)';
  const soleBg  = _seSoleWin ? 'rgba(255,238,88,.1)' : 'none';
  const soleFw  = _seSoleWin ? '700' : '400';
  const soleTd  = _seSoleWin ? 'none' : 'line-through';
  html += '<div id="seSoleWinBtn" onclick="_seToggleSoleWin()" style="padding:5px 12px;cursor:pointer;font-family:\'JetBrains Mono\',monospace;font-size:.82rem;white-space:nowrap;color:'+soleClr+';background:'+soleBg+';font-weight:'+soleFw+';text-decoration:'+soleTd+';transition:color .2s,background .2s;border-radius:3px" '+
    'onmouseenter="if(!window._seSoleWin)this.style.background=\'rgba(255,255,255,.06)\'" onmouseleave="if(!window._seSoleWin)this.style.background=\'none\'">Sole 1st only</div>';
  menu.innerHTML = html;
  // Refresh the Random button label (name lookup against all players, since target may be outside contenders).
  const btn = document.getElementById('seRandomBtn');
  if (btn){
    if (_seRandomTarget){
      const p = _seAllPlayers.find(function(c){return c.key===_seRandomTarget;});
      if (p) btn.innerHTML = '\u27f3 Random: <span style="color:'+p.color+';font-weight:700">'+p.short+'</span>';
    } else {
      btn.textContent = '\u27f3 Random: Any';
    }
  }
}

function _seLockRound(roundNum){
  // Determine the current locked round (if any) by walking the breadcrumb.
  let curLockedRound = null;
  if (_seLockedDepth >= 0 && _seLockedDepth < _sePath.length){
    let n = _seTree;
    for (let i = 0; i <= _seLockedDepth; i++){
      _seGenChildren(n);
      const e = n.ch[_sePath[i]];
      if (i === _seLockedDepth) curLockedRound = _seGames[e.gi].round;
      n = e.child;
    }
  }
  // Toggle: if clicking the already-locked round, unlock it entirely.
  if (curLockedRound === roundNum){
    _seLockedDepth = -1;
  } else {
    // The lock must snap to a round boundary. Walk the breadcrumb and verify that
    // round `roundNum` is fully resolved at some depth (i.e., the child node after
    // the last round-`roundNum` step has no pending games left in that round).
    let newDepth = -1;
    let coversRound = false;
    let walk = _seTree;
    for (let i = 0; i < _sePath.length; i++){
      _seGenChildren(walk);
      const e = walk.ch[_sePath[i]];
      const childRound = _seGames[e.gi].round;
      if (childRound <= roundNum) newDepth = i;
      walk = e.child;
      if (childRound === roundNum){
        // Round is "covered" once the child node's next pending game is past roundNum
        // (or there are no more pending games at all).
        if (walk.leaf || !walk.pending || walk.pending.length === 0){
          coversRound = true;
        } else {
          const minPending = Math.min.apply(null, walk.pending.map(function(gi){return _seGames[gi].round;}));
          if (minPending > roundNum) coversRound = true;
        }
      }
    }
    if (!coversRound){
      _seShowError('Round '+roundNum+' is not fully played in the current breadcrumb \u2014 locking requires a complete round. Extend the breadcrumb (click forward or use Random/Follow Truth) to finish round '+roundNum+', then try again.');
      return;
    }
    _seLockedDepth = newDepth;
  }
  _seNavDir = 'fade';
  _seRenderAll();
}
function _seToggleHowTo(){
  const list = document.getElementById('seHowToList');
  const caret = document.getElementById('seHowToCaret');
  if (!list || !caret) return;
  const collapsed = list.style.display === 'none';
  list.style.display = collapsed ? '' : 'none';
  caret.style.transform = collapsed ? '' : 'rotate(-90deg)';
}
function _seToggleRandomMenu(){
  const menu = document.getElementById('seRandomMenu');
  if (menu) menu.style.display = menu.style.display === 'none' ? '' : 'none';
}

/* ── breadcrumb inline editing ── */
let _seCrumbPopover = null;  // active popover element
function _seDismissPopover(){
  if (_seCrumbPopover){ _seCrumbPopover.remove(); _seCrumbPopover = null; }
}
function _seEditCrumb(depth, evt){
  evt.stopPropagation();
  _seDismissPopover();
  // Walk to the parent node at this depth
  let n = _seTree;
  for (let i = 0; i < depth; i++){
    _seGenChildren(n);
    n = n.ch[_sePath[i]].child;
  }
  _seGenChildren(n);
  const curEdge = n.ch[_sePath[depth]];
  const gi = curEdge.gi;
  const g = _seGames[gi];
  // Collect all outcomes for this game
  const outcomes = [];
  for (let i = 0; i < n.ch.length; i++){
    if (n.ch[i].gi === gi) outcomes.push({ci:i, k:n.ch[i].k, p:n.ch[i].p});
  }
  const oClr = {W:'#00e676', D:'#8494be', L:'#ff5252'};
  const oLbl = {W:'1\u20130', D:'\u00bd\u2013\u00bd', L:'0\u20131'};
  // Build popover (two stages: "Back | Edit >" then expand to outcome buttons on Edit).
  const pop = document.createElement('div');
  pop.style.cssText = 'position:absolute;z-index:20;background:rgba(15,22,40,0.97);border:1px solid rgba(120,180,255,.25);border-radius:5px;padding:4px;display:flex;gap:2px;box-shadow:0 4px 16px rgba(0,0,0,.4);backdrop-filter:blur(8px);animation:se-fade .15s ease-out both';

  function applyEdit(targetK){
    _seDismissPopover();
    if (targetK === n.ch[_sePath[depth]].k) return;  // same outcome, no change
    // Capture identity + remaining steps BEFORE rebuild.
    var remaining = [];
    var rn = n.ch[_sePath[depth]].child;
    for (var ri = depth+1; ri < _sePath.length; ri++){
      _seGenChildren(rn);
      if (!rn.ch || !rn.ch[_sePath[ri]]) break;
      var re = rn.ch[_sePath[ri]];
      var rg = _seGames[re.gi];
      remaining.push({round:rg.round, white:rg.white, black:rg.black, k:re.k, ws:rg.ws, bs:rg.bs, actual:rg.actual});
      rn = re.child;
    }
    remaining = remaining.concat(_seOrphaned);
    var np = n;
    var newCi = -1;
    for (var ci = 0; ci < np.ch.length; ci++){
      if (np.ch[ci].gi === gi && np.ch[ci].k === targetK){ newCi = ci; break; }
    }
    if (newCi < 0) return;
    _sePath[depth] = newCi;
    _sePath = _sePath.slice(0, depth+1);
    _seOrphaned = [];
    var cur = np.ch[newCi].child;
    for (var ri2 = 0; ri2 < remaining.length; ri2++){
      if (cur.leaf) break;
      _seGenChildren(cur);
      if (!cur.ch || !cur.ch.length) break;
      var want = remaining[ri2];
      var foundCi = -1;
      for (var ci2 = 0; ci2 < cur.ch.length; ci2++){
        var gg2 = _seGames[cur.ch[ci2].gi];
        if (gg2.round === want.round && gg2.white === want.white && gg2.black === want.black && cur.ch[ci2].k === want.k){
          foundCi = ci2; break;
        }
      }
      if (foundCi < 0){
        _seOrphaned = remaining.slice(ri2).map(function(r){ return {round:r.round, white:r.white, black:r.black, ws:r.ws, bs:r.bs, k:r.k, actual:r.actual}; });
        break;
      }
      _sePath.push(foundCi);
      cur = cur.ch[foundCi].child;
    }
    _seNavDir = 'fade';
    _seDfsWarning = '';
    _seRenderAll();
  }

  // Stage 1 buttons: Back (truncate) + Edit > (expand to outcomes)
  const BACK_CLR = '#b39ddb';
  const backBtn = document.createElement('button');
  backBtn.style.cssText = 'border:1px solid '+BACK_CLR+'60;background:transparent;color:'+BACK_CLR+';font-family:"JetBrains Mono",monospace;font-size:.68rem;font-weight:600;padding:4px 8px;cursor:pointer;border-radius:3px;white-space:nowrap;transition:background .12s';
  backBtn.textContent = '\u21e6 Back';
  backBtn.title = 'Truncate the breadcrumb to just before this step';
  backBtn.onmouseenter = function(){ backBtn.style.background = 'rgba(179,157,219,.2)'; };
  backBtn.onmouseleave = function(){ backBtn.style.background = 'transparent'; };
  backBtn.onclick = function(e){
    e.stopPropagation();
    _seDismissPopover();
    _seNav(depth);
  };
  pop.appendChild(backBtn);

  const divider = document.createElement('div');
  divider.style.cssText = 'width:1px;background:rgba(120,180,255,.2);margin:2px 4px';
  pop.appendChild(divider);
  outcomes.forEach(function(o){
    const isCurrent = o.ci === _sePath[depth];
    const isActual = g.actual !== null && ['W','D','L'][g.actual] === o.k;
    const GOLD = '#ffd54f';
    const btnClr = isActual ? GOLD : oClr[o.k];
    const btnBg = isCurrent ? (isActual ? 'rgba(255,213,79,.15)' : hexAlpha(oClr[o.k],0.15)) : 'transparent';
    const btnBorder = isCurrent ? (isActual ? GOLD+'80' : oClr[o.k]+'80') : (isActual ? GOLD+'50' : oClr[o.k]+'30');
    const btn = document.createElement('button');
    btn.style.cssText = 'border:1px solid '+btnBorder+';background:'+btnBg+';color:'+btnClr+';font-family:"JetBrains Mono",monospace;font-size:.68rem;font-weight:'+((isCurrent||isActual)?'700':'500')+';padding:4px 8px;cursor:pointer;border-radius:3px;white-space:nowrap;transition:background .12s';
    btn.textContent = (isActual?'\u2713 ':'')+oLbl[o.k];
    var hoverBg = isActual ? 'rgba(255,213,79,.2)' : hexAlpha(oClr[o.k],0.2);
    btn.onmouseenter = function(){ btn.style.background = hoverBg; };
    btn.onmouseleave = function(){ btn.style.background = btnBg; };
    btn.onclick = function(ev){
      ev.stopPropagation();
      applyEdit(o.k);
    };
    pop.appendChild(btn);
  });
  // Position relative to the clicked pill
  const target = evt.currentTarget;
  const rect = target.getBoundingClientRect();
  const crumbEl = document.getElementById('seCrumb');
  const crumbRect = crumbEl.getBoundingClientRect();
  pop.style.left = (rect.left - crumbRect.left) + 'px';
  pop.style.top = (rect.bottom - crumbRect.top + 4) + 'px';
  crumbEl.style.position = 'relative';
  crumbEl.appendChild(pop);
  _seCrumbPopover = pop;
  // Dismiss on outside click
  setTimeout(function(){
    document.addEventListener('click', _seDismissPopover, {once:true});
  }, 0);
}

function _seShowError(msg){
  const box = document.getElementById('seError');
  const txt = document.getElementById('seErrorText');
  if (!box || !txt) return;
  if (msg){ txt.textContent = msg; box.style.display = 'flex'; }
  else { txt.textContent = ''; box.style.display = 'none'; }
}
function _seRenderSamplerStatus(){
  const box = document.getElementById('seSamplerStatus');
  if (!box) return;
  const editInLocked = _seEditInLocked();
  const locked = _seLockedDepth >= 0;
  let clr, bg, br, label, detail;
  if (editInLocked){
    clr = '#ffb74d'; bg = 'rgba(255,183,77,.08)'; br = 'rgba(255,183,77,.3)';
    label = 'UNIFORM ONLY';
    detail = 'hypothetical history \u2014 1000 uniform samples from the locked node; contenders = snapshot after the last unedited round';
  } else if (locked){
    clr = '#4dd0e1'; bg = 'rgba(77,208,225,.08)'; br = 'rgba(77,208,225,.3)';
    label = 'WEIGHTED \u2192 UNIFORM \u2192 DFS';
    detail = 'sampling from the locked prefix; contenders = snapshot after the locked round';
  } else {
    clr = '#7cc6a4'; bg = 'rgba(124,198,164,.07)'; br = 'rgba(124,198,164,.28)';
    label = 'WEIGHTED \u2192 UNIFORM \u2192 DFS';
    detail = 'sampling from the start; contenders = current-round survivors';
  }
  box.style.color = clr;
  box.style.background = bg;
  box.style.border = '1px solid '+br;
  box.innerHTML = '<span style="font-weight:700;letter-spacing:.12em">SAMPLER</span>' +
    '<span style="color:'+clr+'80">\u2022</span>' +
    '<span style="font-weight:700">'+label+'</span>' +
    '<span style="color:var(--paper-4);font-weight:400;letter-spacing:.02em">\u2014 '+detail+'</span>';
}
function _seRenderAll(){
  _seShowError('');
  _seRecomputeContenders();
  // Auto-revert the Random target to "Any" if the player has fallen out of the contender set
  // (e.g., a locked-prefix edit eliminated them). Surface a note so the user sees why.
  const tnBox = document.getElementById('seTargetNote');
  const tnTxt = document.getElementById('seTargetNoteText');
  let tnMsg = '';
  if (_seRandomTarget && !_seContenders.some(function(p){return p.key === _seRandomTarget;})){
    const p = _seAllPlayers.find(function(c){return c.key===_seRandomTarget;});
    const who = p ? p.short : _seRandomTarget;
    tnMsg = who+' is no longer in contention \u2014 either the locked prefix or the modified history has eliminated them. Random target reset to Any.';
    _seRandomTarget = null;
  }
  _seRenderRandomMenu();
  _seRenderSamplerStatus();
  if (tnBox && tnTxt){
    if (tnMsg){ tnTxt.innerHTML = tnMsg; tnBox.style.display = 'flex'; }
    else { tnBox.style.display = 'none'; }
  }
  _seRenderCrumb(); _seRenderSvg();
  const ftBtn = document.getElementById('seFollowTruthBtn');
  if (ftBtn){
    const focus = _seGetFocused();
    let canFollow = false;
    if (!focus.leaf){
      _seGenChildren(focus);
      if (focus.ch && focus.ch.length){
        const gi0 = focus.ch[0].gi;
        if (_seGames[gi0].actual !== null) canFollow = true;
      }
    }
    ftBtn.disabled = !canFollow;
    ftBtn.style.opacity = canFollow ? '' : '.35';
    ftBtn.style.cursor = canFollow ? '' : 'not-allowed';
    ftBtn.title = canFollow ? '' : 'No actual result available from here';
  }
  const fn = document.getElementById('seFootnote');
  if (fn){ if (_seDfsWarning){ fn.textContent = '\u26a0 '+_seDfsWarning; fn.style.display = ''; } else { fn.style.display = 'none'; } }
  _seNavDir = 'fade';
}

/* ── breadcrumb (pill-style with gold for actual results, grouped by round) ── */
function _seRenderCrumb(){
  const el = document.getElementById('seCrumb');
  if (!el) return;
  const oClr = {W:'#00e676', D:'#8494be', L:'#ff5252'};
  const oLbl = {W:'1\u20130', D:'\u00bd\u2013\u00bd', L:'0\u20131'};
  const GOLD = '#ffd54f';

  if (_sePath.length === 0){
    el.innerHTML = '<div style="display:flex;align-items:center;gap:3px;font-family:\'JetBrains Mono\',monospace;font-size:.7rem;line-height:1">' +
      '<span onclick="_seNav(-1)" style="cursor:pointer;padding:4px 8px;border-radius:4px;background:rgba(120,180,255,.1);border:1px solid rgba(120,180,255,.2);color:#78b4ff;font-weight:600;font-size:.65rem;letter-spacing:.05em">START</span></div>';
    return;
  }

  // Collect steps with round info
  const steps = [];
  let n = _seTree;
  for (let i = 0; i < _sePath.length; i++){
    _seGenChildren(n);
    const e = n.ch[_sePath[i]];
    const g = _seGames[e.gi];
    steps.push({depth:i, edge:e, game:g});
    n = e.child;
  }

  // Group by round. Each round is entirely locked or entirely unlocked (lock snaps to round boundary).
  const roundGroups = [];
  steps.forEach(function(s){
    const rn = s.game.round;
    const prev = roundGroups[roundGroups.length-1];
    if (!prev || prev.round !== rn){
      roundGroups.push({round:rn, locked:(s.depth <= _seLockedDepth), steps:[]});
    }
    roundGroups[roundGroups.length-1].steps.push(s);
  });

  const LOCK = '#4dd0e1';

  function renderRoundGroup(rg){
    const bgClr = rg.locked ? 'rgba(77,208,225,.10)' : 'rgba(120,180,255,.03)';
    const borderClr = rg.locked ? LOCK+'50' : 'rgba(120,180,255,.1)';
    const labelClr = rg.locked ? LOCK : '#4e5f8a';
    const labelTitle = rg.locked ? 'Click to unlock round '+rg.round : 'Click to lock rounds through R'+rg.round;
    let out = '<div style="display:inline-flex;align-items:center;gap:2px;padding:2px 4px;border-radius:4px;border:1px solid '+borderClr+';background:'+bgClr+'">';
    out += '<span onclick="_seLockRound('+rg.round+')" title="'+labelTitle+'" style="cursor:pointer;color:'+labelClr+';font-size:.55rem;font-weight:700;letter-spacing:.06em;margin-right:2px;padding:1px 3px;border-radius:2px;user-select:none">'+(rg.locked?'\ud83d\udd12 ':'')+'R'+rg.round+'</span>';
    rg.steps.forEach(function(s){
      const e = s.edge, g = s.game;
      const rc = oClr[e.k];
      const rl = oLbl[e.k];
      const isActual = g.actual !== null && ['W','D','L'][g.actual] === e.k;
      const bg = isActual ? 'rgba(255,213,79,.12)' : hexAlpha(rc, 0.08);
      const border = isActual ? GOLD+'60' : hexAlpha(rc, 0.25);
      const pillLabelClr = isActual ? GOLD : rc;
      out += '<span onclick="_seEditCrumb('+s.depth+',event)" style="cursor:pointer;display:inline-flex;align-items:center;gap:2px;padding:2px 5px;border-radius:3px;background:'+bg+';border:1px solid '+border+';transition:background .15s" '+
        'onmouseenter="this.style.background=\''+hexAlpha(rc,0.18)+'\'" onmouseleave="this.style.background=\''+bg+'\'">';
      if (isActual) out += '<span style="color:'+GOLD+';font-size:.5rem">\u2713</span>';
      out += '<span style="color:var(--paper-2);font-size:.58rem">'+g.ws+'</span>';
      out += '<span style="color:'+pillLabelClr+';font-weight:700;font-size:.6rem">'+rl+'</span>';
      out += '<span style="color:var(--paper-2);font-size:.58rem">'+g.bs+'</span>';
      out += '</span>';
    });
    out += '</div>';
    return out;
  }

  let html = '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:5px;font-family:\'JetBrains Mono\',monospace;font-size:.7rem;line-height:1">';

  // Start pill
  html += '<span onclick="_seNav(-1)" style="cursor:pointer;padding:4px 8px;border-radius:4px;background:rgba(120,180,255,.1);border:1px solid rgba(120,180,255,.2);color:#78b4ff;font-weight:600;font-size:.65rem;letter-spacing:.05em">START</span>';

  roundGroups.forEach(function(rg){
    html += '<span style="color:#263764;font-size:.55rem">\u25b8</span>';
    html += renderRoundGroup(rg);
  });

  // Render orphaned (greyed-out) steps
  if (_seOrphaned.length > 0){
    const orphanLbl = {W:'1\u20130', D:'\u00bd\u2013\u00bd', L:'0\u20131'};
    // Group orphans by round
    const orphanGroups = [];
    _seOrphaned.forEach(function(s){
      if (orphanGroups.length === 0 || orphanGroups[orphanGroups.length-1].round !== s.round){
        orphanGroups.push({round:s.round, steps:[]});
      }
      orphanGroups[orphanGroups.length-1].steps.push(s);
    });

    // Separator
    html += '<span style="color:#263764;font-size:.55rem;margin:0 2px">\u00d7</span>';

    orphanGroups.forEach(function(rg, rgi){
      if (rgi > 0) html += '<span style="color:#1a2448;font-size:.55rem">\u25b8</span>';

      html += '<div style="display:inline-flex;align-items:center;gap:2px;padding:2px 4px;border-radius:4px;border:1px dashed rgba(120,180,255,.08);background:transparent;opacity:.35">';
      html += '<span style="color:#4e5f8a;font-size:.55rem;font-weight:600;letter-spacing:.06em;margin-right:2px">R'+rg.round+'</span>';

      rg.steps.forEach(function(s){
        const k = s.k;
        const rl = orphanLbl[k];
        html += '<span style="display:inline-flex;align-items:center;gap:2px;padding:2px 5px;border-radius:3px;border:1px solid rgba(120,180,255,.08);background:transparent">';
        html += '<span style="color:var(--paper-4);font-size:.58rem">'+s.ws+'</span>';
        html += '<span style="color:var(--paper-4);font-weight:600;font-size:.6rem">'+rl+'</span>';
        html += '<span style="color:var(--paper-4);font-size:.58rem">'+s.bs+'</span>';
        html += '</span>';
      });

      html += '</div>';
    });
  }

  html += '</div>';
  el.innerHTML = html;
}

/* ── SVG rendering (past trail + 2 levels deep + transitions) ── */
function _seRenderSvg(){
  const wrap = document.getElementById('seSvgWrap');
  const focus = _seGetFocused();
  const pastChain = _seBuildPastChain();

  // Animation name based on navigation direction
  const animName = _seNavDir === 'forward' ? 'se-fwd' : _seNavDir === 'backward' ? 'se-bwd' : 'se-fade';

  // Leaf: verdict
  if (focus.leaf){
    wrap.innerHTML = _seLeafCardHTML(focus.scores, focus.winner, focus.tied, _seContenders, animName, 'All contender games decided');
    return;
  }

  _seGenChildren(focus);
  const ch = focus.ch;
  if (!ch || !ch.length){ wrap.innerHTML = ''; return; }

  // Group level-1 children by game
  const groups = [];
  let lastGi = -1;
  ch.forEach(function(c,ci){
    if (c.gi !== lastGi){ groups.push({gi:c.gi, items:[]}); lastGi = c.gi; }
    groups[groups.length-1].items.push({k:c.k, p:c.p, gi:c.gi, child:c.child, ci:ci});
  });

  // Generate level-2 grandchildren
  const GC_H = 18, GC_VS = 7, GC_GRP_LBL = 16, GC_GRP_VS = 14;
  const VERDICT_H = 30;        // base height for leaf verdict nodes
  const TIE_LINE_H = 12;       // per-wrapped-line height in TIE pills
  const TIE_COLOR = '#eceff1'; // near-white, distinct from gold (ground truth) and all player colors
  const TIE_CHARS_PER_LINE = 17; // approx chars that fit at font-size 9 mono in a GC pill
  const wrapLines = function(text, maxChars){
    // Greedy wrap on spaces (names joined by ", ")
    const tokens = text.split(' ');
    const lines = [];
    let cur = '';
    tokens.forEach(function(t){
      if (!cur.length) cur = t;
      else if ((cur + ' ' + t).length <= maxChars) cur += ' ' + t;
      else { lines.push(cur); cur = t; }
    });
    if (cur.length) lines.push(cur);
    return lines;
  };
  const tieLines = function(child){
    if (!child.tied || child.tied.length <= 1) return null;
    const names = child.tied.map(function(p){return p.short;}).join(', ');
    return wrapLines(names, TIE_CHARS_PER_LINE);
  };
  const pillH = function(child){
    if (child.leaf && !child.winner){
      const lines = tieLines(child);
      if (lines) return GC_H + lines.length * TIE_LINE_H;
    }
    return GC_H;
  };
  const verdictH = function(child){
    if (!child.winner){
      const lines = tieLines(child);
      if (lines) return VERDICT_H + lines.length * TIE_LINE_H - 6;
    }
    return VERDICT_H;
  };
  let hasAnyGC = false;
  groups.forEach(function(grp){
    grp.items.forEach(function(c){
      c.gcGroups = []; c.gcFanH = 0; c.isLeaf = c.child.leaf;
      if (c.child.leaf){
        // Leaf children get a verdict node in the GC column
        hasAnyGC = true;
        c.verdictH = verdictH(c.child);
        c.gcFanH = c.verdictH;
      } else {
        _seGenChildren(c.child);
        if (c.child.ch && c.child.ch.length){
          hasAnyGC = true;
          let lg = -1;
          c.child.ch.forEach(function(gc, gci){
            if (gc.gi !== lg){ c.gcGroups.push({gi:gc.gi, items:[]}); lg = gc.gi; }
            c.gcGroups[c.gcGroups.length-1].items.push({k:gc.k, p:gc.p, gi:gc.gi, child:gc.child, gci:gci, _h:pillH(gc.child)});
          });
          let h = 0;
          c.gcGroups.forEach(function(gg,i){
            h += GC_GRP_LBL;
            gg.items.forEach(function(gc,j){
              h += gc._h;
              if (j < gg.items.length - 1) h += GC_VS;
            });
            if (i < c.gcGroups.length - 1) h += GC_GRP_VS;
          });
          c.gcFanH = h;
        }
      }
    });
  });

  // Past trail: group by round, show last 2 rounds
  const MAX_PAST_ROUNDS = 2;
  const PAST_W = 145, PAST_ITEM_H = 28, PAST_ITEM_VS = 10, PAST_HS = 35;
  const TRUNC_W = 18;

  // Group past steps by round
  const pastRoundGroups = [];
  pastChain.forEach(function(step, si){
    const rn = step.game.round;
    if (pastRoundGroups.length === 0 || pastRoundGroups[pastRoundGroups.length-1].round !== rn){
      pastRoundGroups.push({round: rn, steps: []});
    }
    pastRoundGroups[pastRoundGroups.length-1].steps.push({step:step, depth:si});
  });
  const visRoundGroups = pastRoundGroups.slice(-MAX_PAST_ROUNDS);
  const hasTrunc = pastRoundGroups.length > MAX_PAST_ROUNDS;
  const pastAreaW = visRoundGroups.length > 0
    ? (hasTrunc ? TRUNC_W + 10 : 0) + visRoundGroups.length * PAST_W + visRoundGroups.length * PAST_HS
    : 0;

  // Layout dimensions — adapt to number of contenders
  const nC = _seContenders.length;
  const FOCUS_LH = 18;
  const FOCUS_W = 170, FOCUS_H = 26 + nC * FOCUS_LH + 6;
  const CH_W = 170;
  const GC_W = 120;
  const CH_LH = Math.min(15, Math.max(10, (60 - 26) / nC));
  const defaultCH_H = Math.max(42, 26 + nC * CH_LH);
  const VS_IN = 14, VS_OUT = 32, GRP_LBL = 22;
  const HS = 70, HS2 = 45, PAD = 30;

  groups.forEach(function(grp){
    grp.items.forEach(function(c){
      c.slotH = Math.max(defaultCH_H, c.gcFanH);
    });
  });

  let totalChildH = 0;
  groups.forEach(function(grp,gi){
    totalChildH += GRP_LBL;
    grp.items.forEach(function(c,i){
      totalChildH += c.slotH;
      if (i < grp.items.length - 1) totalChildH += VS_IN;
    });
    if (gi < groups.length - 1) totalChildH += VS_OUT;
  });

  let maxPastColH = 0;
  visRoundGroups.forEach(function(rg){
    const h = rg.steps.length * PAST_ITEM_H + (rg.steps.length - 1) * PAST_ITEM_VS + 15;
    if (h > maxPastColH) maxPastColH = h;
  });
  const svgH = Math.max(totalChildH, FOCUS_H, maxPastColH) + PAD*2;
  const svgW = PAD + pastAreaW + FOCUS_W + HS + CH_W + (hasAnyGC ? HS2 + GC_W : 0) + PAD;

  const svg = document.createElementNS(SE_NS,'svg');
  svg.setAttribute('viewBox','0 0 '+svgW+' '+svgH);
  svg.setAttribute('width','100%');
  svg.style.maxWidth = svgW+'px';
  svg.style.overflow = 'hidden';
  svg.style.animation = animName+' .3s ease-out both';

  const fx = PAD + pastAreaW, fy = svgH/2;
  const childX = fx + FOCUS_W + HS;
  const gcX = childX + CH_W + HS2;

  // ── Past trail nodes (grouped by round) ──
  if (visRoundGroups.length > 0){
    const eClr2 = {W:'#00e676', D:'#8494be', L:'#ff5252'};
    let px = PAD + (hasTrunc ? TRUNC_W + 10 : 0);

    // Truncation indicator
    if (hasTrunc){
      const dt = document.createElementNS(SE_NS,'text');
      dt.setAttribute('x',PAD+TRUNC_W/2); dt.setAttribute('y',fy+4);
      dt.setAttribute('text-anchor','middle'); dt.setAttribute('fill','#4e5f8a');
      dt.setAttribute('font-family',"'JetBrains Mono',monospace");
      dt.setAttribute('font-size','11'); dt.setAttribute('font-weight','600');
      dt.textContent = '\u00b7\u00b7\u00b7';
      svg.appendChild(dt);
    }

    const GOLD_PAST = '#ffd54f';
    visRoundGroups.forEach(function(rg, rgi){
      const nItems = rg.steps.length;
      const colH = nItems * PAST_ITEM_H + (nItems - 1) * PAST_ITEM_VS;
      const colTop = fy - colH / 2;
      const baseOp = 0.35 + rgi * (0.35 / Math.max(1, visRoundGroups.length - 1));

      // Round label above the column
      const rl2 = document.createElementNS(SE_NS,'text');
      rl2.setAttribute('x',px+PAST_W/2); rl2.setAttribute('y',colTop-5);
      rl2.setAttribute('text-anchor','middle'); rl2.setAttribute('fill','#4e5f8a');
      rl2.setAttribute('font-family',"'JetBrains Mono',monospace");
      rl2.setAttribute('font-size','7.5'); rl2.setAttribute('opacity',baseOp.toFixed(2));
      rl2.textContent = 'Round '+rg.round;
      svg.appendChild(rl2);

      rg.steps.forEach(function(s, si){
        const step = s.step, depth = s.depth;
        const iy = colTop + si * (PAST_ITEM_H + PAST_ITEM_VS);
        const rc = eClr2[step.edge.k];
        const rl = step.edge.k==='W'?'1\u20130':step.edge.k==='D'?'\u00bd\u2013\u00bd':'0\u20131';
        const isActual = step.game.actual !== null && ['W','D','L'][step.game.actual] === step.edge.k;
        const nodeClr = isActual ? GOLD_PAST : rc;

        const rect = document.createElementNS(SE_NS,'rect');
        rect.setAttribute('x',px); rect.setAttribute('y',iy);
        rect.setAttribute('width',PAST_W); rect.setAttribute('height',PAST_ITEM_H);
        rect.setAttribute('fill', isActual ? 'rgba(255,213,79,0.06)' : 'rgba(11,17,32,0.6)');
        rect.setAttribute('stroke', isActual ? GOLD_PAST+'70' : rc+'50');
        rect.setAttribute('stroke-width', isActual ? '1.5' : '1');
        rect.setAttribute('rx','4'); rect.setAttribute('opacity',baseOp.toFixed(2));
        svg.appendChild(rect);

        // Result text
        const rt = document.createElementNS(SE_NS,'text');
        rt.setAttribute('x',px+PAST_W/2); rt.setAttribute('y',iy+PAST_ITEM_H/2+3);
        rt.setAttribute('text-anchor','middle'); rt.setAttribute('fill',nodeClr);
        rt.setAttribute('font-family',"'JetBrains Mono',monospace");
        rt.setAttribute('font-size','7.5'); rt.setAttribute('font-weight','600');
        rt.setAttribute('opacity',baseOp.toFixed(2));
        const pastLabel = (isActual?'\u2713 ':'')+step.game.ws+' '+rl+' '+step.game.bs;
        rt.textContent = pastLabel;
        if (pastLabel.length > 22) rt.setAttribute('textLength', PAST_W - 12);
        rt.setAttribute('lengthAdjust','spacingAndGlyphs');
        svg.appendChild(rt);

        // Click overlay
        const click = document.createElementNS(SE_NS,'rect');
        click.setAttribute('x',px); click.setAttribute('y',iy);
        click.setAttribute('width',PAST_W); click.setAttribute('height',PAST_ITEM_H);
        click.setAttribute('fill','transparent'); click.setAttribute('cursor','pointer');
        const navDepth = depth;
        click.addEventListener('click', function(){ _seNav(navDepth); });
        click.addEventListener('mouseenter', function(){ rect.setAttribute('stroke', isActual ? GOLD_PAST : rc); rect.setAttribute('opacity','0.9'); });
        click.addEventListener('mouseleave', function(){ rect.setAttribute('stroke',isActual?GOLD_PAST+'70':rc+'50'); rect.setAttribute('opacity',baseOp.toFixed(2)); });
        svg.appendChild(click);
      });

      // Edge from this round column to next column or focus
      const nextX = px + PAST_W;
      const toX = rgi < visRoundGroups.length - 1 ? px + PAST_W + PAST_HS : fx;
      const mx = (nextX + toX) / 2;
      const edge = document.createElementNS(SE_NS,'path');
      edge.setAttribute('d','M'+nextX+','+fy+' C'+mx+','+fy+' '+mx+','+fy+' '+toX+','+fy);
      edge.setAttribute('fill','none');
      edge.setAttribute('stroke','#263764');
      edge.setAttribute('stroke-width','1');
      edge.setAttribute('stroke-dasharray','3,3');
      edge.setAttribute('opacity',(baseOp+0.15).toFixed(2));
      svg.appendChild(edge);

      px += PAST_W + PAST_HS;
    });
  }

  // ── Position level-1 children and level-2 fans ──
  let cy2 = PAD + Math.max(0, svgH - PAD*2 - totalChildH) / 2;
  groups.forEach(function(grp){
    grp._ly = cy2 + GRP_LBL*0.75;
    cy2 += GRP_LBL;
    grp.items.forEach(function(c,i){
      c._x = childX; c._y = cy2 + c.slotH/2;
      if (c.isLeaf){
        // Position verdict node in GC column, centered on child
        c._verdictX = gcX; c._verdictY = c._y;
      } else if (c.gcGroups.length > 0){
        let gy = c._y - c.gcFanH/2;
        c.gcGroups.forEach(function(gg,gi2){
          gg._ly = gy + GC_GRP_LBL*0.75;
          gy += GC_GRP_LBL;
          gg.items.forEach(function(gc,j){
            gc._x = gcX; gc._y = gy + gc._h/2;
            gy += gc._h + (j < gg.items.length-1 ? GC_VS : 0);
          });
          if (gi2 < c.gcGroups.length-1) gy += GC_GRP_VS;
        });
      }
      cy2 += c.slotH + (i < grp.items.length-1 ? VS_IN : 0);
    });
    cy2 += VS_OUT;
  });

  const eClr = {W:'#00e676', D:'#8494be', L:'#ff5252'};

  const GOLD = '#ffd54f';

  // ── Draw level-0 → level-1 edges ──
  groups.forEach(function(grp){
    grp.items.forEach(function(c){
      const gg = _seGames[c.gi];
      const isActual = gg.actual !== null && ['W','D','L'][gg.actual] === c.k;
      const x1 = fx+FOCUS_W, y1 = fy, x2 = c._x, y2 = c._y, mx = (x1+x2)/2;
      const p = document.createElementNS(SE_NS,'path');
      p.setAttribute('d','M'+x1+','+y1+' C'+mx+','+y1+' '+mx+','+y2+' '+x2+','+y2);
      p.setAttribute('fill','none');
      p.setAttribute('stroke',isActual ? GOLD : eClr[c.k]);
      p.setAttribute('stroke-width',isActual ? '2.5' : Math.max(0.8,c.p*3.5).toFixed(1));
      p.setAttribute('opacity',isActual ? '0.9' : (0.25+c.p*0.65).toFixed(2));
      svg.appendChild(p);
    });
  });

  // ── Draw level-1 → level-2 edges ──
  groups.forEach(function(grp){
    grp.items.forEach(function(c){
      if (c.isLeaf){
        // Edge from leaf child to verdict node
        const x1 = c._x+CH_W, y1 = c._y, x2 = c._verdictX, y2 = c._verdictY, mx = (x1+x2)/2;
        const p = document.createElementNS(SE_NS,'path');
        p.setAttribute('d','M'+x1+','+y1+' C'+mx+','+y1+' '+mx+','+y2+' '+x2+','+y2);
        p.setAttribute('fill','none');
        p.setAttribute('stroke', c.child.winner ? c.child.winner.color : TIE_COLOR);
        p.setAttribute('stroke-width','1.5');
        p.setAttribute('opacity','0.7');
        svg.appendChild(p);
      } else if (c.gcGroups.length > 0){
        c.gcGroups.forEach(function(gg){
          gg.items.forEach(function(gc){
            const x1 = c._x+CH_W, y1 = c._y, x2 = gc._x, y2 = gc._y, mx = (x1+x2)/2;
            const p = document.createElementNS(SE_NS,'path');
            p.setAttribute('d','M'+x1+','+y1+' C'+mx+','+y1+' '+mx+','+y2+' '+x2+','+y2);
            p.setAttribute('fill','none');
            p.setAttribute('stroke',eClr[gc.k]);
            p.setAttribute('stroke-width',Math.max(0.5,gc.p*2.5).toFixed(1));
            p.setAttribute('opacity',(0.15+gc.p*0.45).toFixed(2));
            svg.appendChild(p);
          });
        });
      }
    });
  });

  // ── Focus node (level 0) ──
  (function(){
    const sorted = [..._seContenders].sort((a,b) => focus.scores[b.key] - focus.scores[a.key]);
    const lc = sorted[0].color;
    const rect = document.createElementNS(SE_NS,'rect');
    rect.setAttribute('x',fx); rect.setAttribute('y',fy-FOCUS_H/2);
    rect.setAttribute('width',FOCUS_W); rect.setAttribute('height',FOCUS_H);
    rect.setAttribute('fill','rgba(15,22,40,0.95)');
    rect.setAttribute('stroke',lc); rect.setAttribute('stroke-width','2');
    rect.setAttribute('rx','6');
    svg.appendChild(rect);

    const np = focus.pending.length;
    const hl = document.createElementNS(SE_NS,'text');
    hl.setAttribute('x',fx+FOCUS_W/2); hl.setAttribute('y',fy-FOCUS_H/2+15);
    hl.setAttribute('text-anchor','middle'); hl.setAttribute('fill','#6a7ca3');
    hl.setAttribute('font-family',"'JetBrains Mono',monospace");
    hl.setAttribute('font-size','9');
    hl.textContent = np+' game'+(np!==1?'s':'')+' remaining';
    svg.appendChild(hl);

    const sy = fy - FOCUS_H/2 + 26, lh = FOCUS_LH;
    sorted.forEach(function(p,i){
      const sc = focus.scores[p.key], ty = sy + i*lh;
      const al = focus.alive.has(p.key), ld = p.key === sorted[0].key;
      const bw = (sc / DATA.meta.total_rounds) * (FOCUS_W-8);
      const bar = document.createElementNS(SE_NS,'rect');
      bar.setAttribute('x',fx+4); bar.setAttribute('y',ty);
      bar.setAttribute('width',Math.max(0,bw)); bar.setAttribute('height',lh-4);
      bar.setAttribute('fill',hexAlpha(p.color,al?0.2:0.06)); bar.setAttribute('rx','2');
      svg.appendChild(bar);
      const st = document.createElementNS(SE_NS,'text');
      st.setAttribute('x',fx+FOCUS_W-5); st.setAttribute('y',ty+lh*0.65);
      st.setAttribute('text-anchor','end');
      st.setAttribute('fill',al?p.color:hexAlpha(p.color,0.3));
      st.setAttribute('font-family',"'JetBrains Mono',monospace");
      st.setAttribute('font-size','10'); st.setAttribute('font-weight',ld?'700':'400');
      st.textContent = p.short+' '+sc+(al?'':' \u2717');
      svg.appendChild(st);
    });
  })();

  // ── Level-1 group labels + child nodes ──
  groups.forEach(function(grp){
    const g = _seGames[grp.gi];
    const gl = document.createElementNS(SE_NS,'text');
    gl.setAttribute('x',childX); gl.setAttribute('y',grp._ly);
    gl.setAttribute('fill','#6a7ca3');
    gl.setAttribute('font-family',"'JetBrains Mono',monospace");
    gl.setAttribute('font-size','9');
    gl.textContent = 'R'+g.round+': '+g.ws+' vs '+g.bs;
    svg.appendChild(gl);

    grp.items.forEach(function(c){
      const x = c._x, y = c._y;
      const gg = _seGames[c.gi];
      const rc = eClr[c.k];
      const isActual = gg.actual !== null && ['W','D','L'][gg.actual] === c.k;
      const sorted = [..._seContenders].sort((a,b) => c.child.scores[b.key] - c.child.scores[a.key]);

      const grpEl = document.createElementNS(SE_NS,'g');
      const rect = document.createElementNS(SE_NS,'rect');
      rect.setAttribute('x',x); rect.setAttribute('y',y-defaultCH_H/2);
      rect.setAttribute('width',CH_W); rect.setAttribute('height',defaultCH_H);
      rect.setAttribute('fill', isActual ? 'rgba(255,213,79,0.06)' : 'rgba(11,17,32,0.85)');
      rect.setAttribute('stroke', isActual ? GOLD+'80' : rc+'40');
      rect.setAttribute('stroke-width', isActual ? '1.5' : '1');
      rect.setAttribute('rx','4');
      grpEl.appendChild(rect);

      const rl = c.k==='W'?'1\u20130':c.k==='D'?'\u00bd\u2013\u00bd':'0\u20131';
      const rt = document.createElementNS(SE_NS,'text');
      rt.setAttribute('x', isActual ? x+16 : x+6); rt.setAttribute('y',y-defaultCH_H/2+14);
      rt.setAttribute('fill', isActual ? GOLD : rc);
      rt.setAttribute('font-family',"'JetBrains Mono',monospace");
      rt.setAttribute('font-size','10'); rt.setAttribute('font-weight','600');
      rt.textContent = gg.ws+' '+rl+' '+gg.bs;
      grpEl.appendChild(rt);
      // Checkmark for actual result
      if (isActual){
        const chk = document.createElementNS(SE_NS,'text');
        chk.setAttribute('x',x+6); chk.setAttribute('y',y-defaultCH_H/2+14);
        chk.setAttribute('fill',GOLD); chk.setAttribute('font-size','9.5');
        chk.textContent = '\u2713';
        grpEl.appendChild(chk);
      }
      const pt = document.createElementNS(SE_NS,'text');
      pt.setAttribute('x',x+CH_W-6); pt.setAttribute('y',y+defaultCH_H/2-6);
      pt.setAttribute('text-anchor','end'); pt.setAttribute('fill', isActual ? GOLD : rc);
      pt.setAttribute('font-family',"'JetBrains Mono',monospace");
      pt.setAttribute('font-size','9'); pt.setAttribute('opacity','0.7');
      pt.textContent = (c.p*100).toFixed(0)+'%';
      grpEl.appendChild(pt);

      const sy = y - defaultCH_H/2 + 24;
      const lh = CH_LH;
      sorted.forEach(function(p,i){
        const sc = c.child.scores[p.key], ty = sy + i*lh;
        const al = c.child.alive.has(p.key), ld = p.key === sorted[0].key;
        const changed = sc !== focus.scores[p.key];
        const st = document.createElementNS(SE_NS,'text');
        st.setAttribute('x',x+6); st.setAttribute('y',ty+lh*0.8);
        st.setAttribute('fill',al ? (changed ? '#fff' : p.color) : hexAlpha(p.color,0.3));
        st.setAttribute('font-family',"'JetBrains Mono',monospace");
        st.setAttribute('font-size','9.5');
        st.setAttribute('font-weight',(ld||changed)?'700':'400');
        st.textContent = p.short+' '+sc+(al?'':' \u2717');
        grpEl.appendChild(st);
      });

      svg.appendChild(grpEl);

      const click = document.createElementNS(SE_NS,'rect');
      click.setAttribute('x',x); click.setAttribute('y',y-defaultCH_H/2);
      click.setAttribute('width',CH_W); click.setAttribute('height',defaultCH_H);
      click.setAttribute('fill','transparent'); click.setAttribute('cursor','pointer');
      click.addEventListener('click', function(){ _seClick(c.ci); });
      click.addEventListener('mouseenter', function(){ rect.setAttribute('stroke',isActual ? GOLD : rc); rect.setAttribute('stroke-width','1.5'); });
      click.addEventListener('mouseleave', function(){ rect.setAttribute('stroke',isActual ? GOLD+'80' : rc+'40'); rect.setAttribute('stroke-width', isActual ? '1.5' : '1'); });
      svg.appendChild(click);
    });
  });

  // ── Level-2 grandchild pills ──
  groups.forEach(function(grp){
    grp.items.forEach(function(c){
      // Render verdict node for leaf children
      if (c.isLeaf){
        const vx = c._verdictX, vy = c._verdictY;
        const vw = GC_W, vh = c.verdictH;
        const wn = c.child.winner;
        const vc = wn ? wn.color : TIE_COLOR;
        const vr = document.createElementNS(SE_NS,'rect');
        vr.setAttribute('x',vx); vr.setAttribute('y',vy-vh/2);
        vr.setAttribute('width',vw); vr.setAttribute('height',vh);
        vr.setAttribute('fill','rgba(11,17,32,0.85)');
        vr.setAttribute('stroke',vc+'60'); vr.setAttribute('stroke-width','1.5');
        vr.setAttribute('rx','4');
        svg.appendChild(vr);
        // Accent bar
        const va = document.createElementNS(SE_NS,'rect');
        va.setAttribute('x',vx); va.setAttribute('y',vy-vh/2);
        va.setAttribute('width','3'); va.setAttribute('height',vh);
        va.setAttribute('fill',vc); va.setAttribute('opacity','0.8');
        va.setAttribute('rx','1.5');
        svg.appendChild(va);
        if (wn){
          const vt = document.createElementNS(SE_NS,'text');
          vt.setAttribute('x',vx+vw/2); vt.setAttribute('y',vy+4);
          vt.setAttribute('text-anchor','middle'); vt.setAttribute('fill',vc);
          vt.setAttribute('font-family',"'JetBrains Mono',monospace");
          vt.setAttribute('font-size','10'); vt.setAttribute('font-weight','700');
          vt.textContent = '\u2605 '+wn.short;
          svg.appendChild(vt);
        } else {
          // Header "TIE"
          const hdr = document.createElementNS(SE_NS,'text');
          hdr.setAttribute('x',vx+vw/2); hdr.setAttribute('y',vy-vh/2+13);
          hdr.setAttribute('text-anchor','middle'); hdr.setAttribute('fill',TIE_COLOR);
          hdr.setAttribute('font-family',"'JetBrains Mono',monospace");
          hdr.setAttribute('font-size','9'); hdr.setAttribute('font-weight','700');
          hdr.setAttribute('letter-spacing','.18em');
          hdr.textContent = 'TIE';
          svg.appendChild(hdr);
          // Wrapped names (all on as few lines as possible within pill width)
          const lines = tieLines(c.child) || [];
          const body = document.createElementNS(SE_NS,'text');
          body.setAttribute('x',vx+vw/2); body.setAttribute('y', vy-vh/2 + 14 + TIE_LINE_H);
          body.setAttribute('text-anchor','middle'); body.setAttribute('fill','#cfd8dc');
          body.setAttribute('font-family',"'JetBrains Mono',monospace");
          body.setAttribute('font-size','9'); body.setAttribute('font-weight','600');
          lines.forEach(function(ln, i){
            const ts = document.createElementNS(SE_NS,'tspan');
            ts.setAttribute('x', vx+vw/2);
            if (i > 0) ts.setAttribute('dy', TIE_LINE_H);
            ts.textContent = ln;
            body.appendChild(ts);
          });
          svg.appendChild(body);
        }
        return;
      }
      if (c.gcGroups.length === 0) return;
      c.gcGroups.forEach(function(gg){
        const g2 = _seGames[gg.gi];
        const gl2 = document.createElementNS(SE_NS,'text');
        gl2.setAttribute('x',gcX); gl2.setAttribute('y',gg._ly);
        gl2.setAttribute('fill','#4e5f8a');
        gl2.setAttribute('font-family',"'JetBrains Mono',monospace");
        gl2.setAttribute('font-size','8');
        gl2.textContent = g2.ws+' v '+g2.bs;
        svg.appendChild(gl2);

        gg.items.forEach(function(gc){
          const gx = gc._x, gy = gc._y;
          const rc2 = eClr[gc.k];
          const gsorted = [..._seContenders].sort((a,b) => gc.child.scores[b.key] - gc.child.scores[a.key]);
          const glc = gsorted[0].color;

          const pill = document.createElementNS(SE_NS,'rect');
          pill.setAttribute('x',gx); pill.setAttribute('y',gy-gc._h/2);
          pill.setAttribute('width',GC_W); pill.setAttribute('height',gc._h);
          pill.setAttribute('fill','rgba(11,17,32,0.7)');
          pill.setAttribute('stroke',rc2+'30'); pill.setAttribute('stroke-width','0.5');
          pill.setAttribute('rx','3');
          svg.appendChild(pill);

          const accent = document.createElementNS(SE_NS,'rect');
          accent.setAttribute('x',gx); accent.setAttribute('y',gy-gc._h/2);
          accent.setAttribute('width','3'); accent.setAttribute('height',gc._h);
          accent.setAttribute('fill',rc2); accent.setAttribute('opacity','0.7');
          accent.setAttribute('rx','1.5');
          svg.appendChild(accent);

          const rl2 = gc.k==='W'?'W':gc.k==='D'?'D':'L';
          const leaderSc = gc.child.scores[gsorted[0].key];
          const leaders = gsorted.filter(function(p){ return gc.child.scores[p.key] === leaderSc; });
          const pct2 = (gc.p*100).toFixed(0)+'%';
          const isTieLeaf = gc.child.leaf && !gc.child.winner && gc.child.tied && gc.child.tied.length > 1;

          if (isTieLeaf){
            // Header line: "W 31% TIE"
            const hdr = document.createElementNS(SE_NS,'text');
            hdr.setAttribute('x',gx+7); hdr.setAttribute('y',gy-gc._h/2+12);
            hdr.setAttribute('fill',TIE_COLOR);
            hdr.setAttribute('font-family',"'JetBrains Mono',monospace");
            hdr.setAttribute('font-size','8.5'); hdr.setAttribute('font-weight','700');
            hdr.setAttribute('opacity','0.9');
            hdr.textContent = rl2+' '+pct2+' TIE';
            svg.appendChild(hdr);
            // Wrapped tied-names body
            const lines = tieLines(gc.child) || [];
            const body = document.createElementNS(SE_NS,'text');
            body.setAttribute('x', gx+7);
            body.setAttribute('y', gy-gc._h/2 + GC_H + TIE_LINE_H - 3);
            body.setAttribute('fill', '#cfd8dc');
            body.setAttribute('font-family',"'JetBrains Mono',monospace");
            body.setAttribute('font-size','8.5'); body.setAttribute('font-weight','600');
            lines.forEach(function(ln, i){
              const ts = document.createElementNS(SE_NS,'tspan');
              ts.setAttribute('x', gx+7);
              if (i > 0) ts.setAttribute('dy', TIE_LINE_H);
              ts.textContent = ln;
              body.appendChild(ts);
            });
            svg.appendChild(body);
            return;
          }

          let lbl, lblDisplay;
          if (gc.child.leaf){
            if (gc.child.winner){
              lbl = rl2+' '+pct2+' \u2605 '+gc.child.winner.short;
              lblDisplay = lbl;
            } else {
              // tied but single (shouldn't happen — that's a winner)
              lbl = rl2+' '+pct2+' TIE';
              lblDisplay = lbl;
            }
          } else {
            const names = leaders.map(function(p){ return p.short; }).join(', ');
            const suffix = ' '+leaderSc;
            lbl = rl2+' '+pct2+' '+names+suffix;
            // Truncate names if full label is too long (~18 chars at font-size 8.5)
            const maxChars = 18;
            const prefixLen = rl2.length + 1 + pct2.length + 1; // "W 31% "
            const suffixLen = suffix.length;
            const namesBudget = maxChars - prefixLen - suffixLen;
            if (names.length > namesBudget && namesBudget > 2){
              lblDisplay = rl2+' '+pct2+' '+names.slice(0, namesBudget-1)+'\u2026'+suffix;
            } else {
              lblDisplay = lbl;
            }
          }

          const gcGrp = document.createElementNS(SE_NS,'g');
          const gt = document.createElementNS(SE_NS,'text');
          gt.setAttribute('x',gx+7); gt.setAttribute('y',gy+GC_H*0.3);
          gt.setAttribute('fill',gc.child.leaf ? (gc.child.winner ? gc.child.winner.color : '#ffee58') : (leaders.length > 1 ? '#ffee58' : glc));
          gt.setAttribute('font-family',"'JetBrains Mono',monospace");
          gt.setAttribute('font-size','8.5');
          gt.setAttribute('font-weight',gc.child.leaf ? '700' : '400');
          gt.setAttribute('opacity','0.85');
          gt.textContent = lblDisplay;
          gcGrp.appendChild(gt);
          // SVG tooltip via <title> child element
          if (lblDisplay !== lbl){
            const tt = document.createElementNS(SE_NS,'title');
            tt.textContent = lbl;
            gcGrp.appendChild(tt);
          }
          svg.appendChild(gcGrp);
        });
      });
    });
  });

  wrap.innerHTML = '';
  wrap.appendChild(svg);

  // Horizontal scroll to keep focus node visible
  if (_seNavDir === 'forward'){
    wrap.scrollLeft = Math.max(0, fx - 20);
  } else if (_seNavDir === 'backward'){
    wrap.scrollLeft = 0;
  }

  // Scroll the explorer into view so the focus node stays visible
  // (skipped during (re)init so round-tab clicks don't yank the page)
  if (!_seSuppressScroll){
    wrap.scrollIntoView({behavior:'smooth', block:'nearest'});
  }
}

// ═══════════════════════════════════════════════
// PARETO CHART
// ═══════════════════════════════════════════════
function buildPareto(){
  const pd = DATA.pareto;
  document.getElementById('paretoSection').style.display='';

  // meta badges — show raw (unnormalized) values
  const meta = document.getElementById('paretoMeta');
  meta.innerHTML = `
    <div class="pmeta-item"><div class="pk">Total Trials</div><div class="pv">${pd.total_trials.toLocaleString()}</div></div>
    <div class="pmeta-item"><div class="pk">Pareto-Optimal</div><div class="pv">${pd.pareto_count}</div></div>
    <div class="pmeta-item"><div class="pk">Best Trial</div><div class="pv">#${pd.best.n}</div></div>
    <div class="pmeta-item"><div class="pk">Game Brier</div><div class="pv">${pd.best.rx.toFixed(4)}</div></div>
    <div class="pmeta-item"><div class="pk">Rank RPS</div><div class="pv">${pd.best.ry.toFixed(4)}</div></div>`;

  const xMin = pd.norm_min.x, yMin = pd.norm_min.y;
  const maxN = Math.max(...pd.all_points.map(p=>p.n));
  const nonPareto = pd.all_points.filter(p=>!p.p);
  const paretoOnly = pd.all_points.filter(p=>p.p);
  const axisMax = Math.max(...pd.all_points.map(p=>p.x), ...pd.all_points.map(p=>p.y));

  // step line
  const stepLineExt = [];
  for (let i=0; i<pd.pareto_line.length; i++){
    stepLineExt.push({x:pd.pareto_line[i].x, y:pd.pareto_line[i].y});
    if (i<pd.pareto_line.length-1)
      stepLineExt.push({x:pd.pareto_line[i+1].x, y:pd.pareto_line[i].y});
  }

  // Tooltip helper: denormalize for display
  function rawTip(ctx, prefix){
    const rx = (ctx.parsed.x * xMin).toFixed(4);
    const ry = (ctx.parsed.y * yMin).toFixed(4);
    return ` ${prefix}Brier=${rx}, RPS=${ry}`;
  }

  paretoChart = new Chart(document.getElementById('cPareto').getContext('2d'), {
    type:'scatter',
    data:{
      datasets:[
        {
          label:'All trials',
          data: nonPareto.map(p=>({x:p.x,y:p.y})),
          backgroundColor: nonPareto.map(p=>trialColor(p.n,maxN)),
          pointRadius:2.5, pointHoverRadius:4,
          order:3,
        },
        {
          label:'Pareto front line',
          data: stepLineExt,
          type:'line',
          borderColor:'#78b4ff70',
          borderWidth:1.5,
          borderDash:[4,3],
          pointRadius:0,
          tension:0,
          order:2,
          showLine:true,
        },
        {
          label:'Pareto-optimal',
          data: paretoOnly.map(p=>({x:p.x,y:p.y,n:p.n})),
          backgroundColor: '#40c4ffcc',
          borderColor: '#40c4ff',
          borderWidth:1,
          pointRadius:6, pointHoverRadius:8,
          order:1,
        },
        {
          label:`★ Best (Trial ${pd.best.n})`,
          data:[{x:pd.best.x,y:pd.best.y}],
          backgroundColor:'#ffee58',
          borderColor:'#ffee58',
          borderWidth:2,
          pointStyle:'star',
          pointRadius:24, pointHoverRadius:26,
          order:0,
        },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{position:'bottom',labels:{boxWidth:12,padding:12,font:{size:11},
          filter: item => item.text!=='Pareto front line'}},
        tooltip:{callbacks:{
          label: ctx => {
            if (ctx.datasetIndex===3) return rawTip(ctx, `★ Best #${pd.best.n} — `);
            if (ctx.datasetIndex===2) {
              const pt = paretoOnly[ctx.dataIndex];
              return rawTip(ctx, `Pareto #${pt?.n} — `);
            }
            return rawTip(ctx, '');
          }
        }}
      },
      scales:{
        x:{grid:{color:'rgba(120,180,255,.1)'},
           title:{display:true,text:'Game Brier (normalized, 1.0 = optimal)',color:'#8494be'},
           ticks:{font:{size:11}, callback:v=>v.toFixed(2)},
           min:0.98, max:axisMax},
        y:{grid:{color:'rgba(120,180,255,.1)'},
           title:{display:true,text:'Rank RPS (normalized, 1.0 = optimal)',color:'#8494be'},
           ticks:{font:{size:11}, callback:v=>v.toFixed(2)},
           min:0.98, max:axisMax}
      }
    }
  });

  // Pareto front table
  window._paretoPoints = paretoOnly;
  window._paretoBestN = pd.best.n;
  renderParetoTable();

  // Wire up sortable headers
  document.querySelectorAll('#tPareto thead th[data-sort]').forEach(th => {
    th.onclick = () => { toggleSort(paretoSort, th.dataset.sort); renderParetoTable(); };
  });
}

function renderParetoTable(){
  const pts = window._paretoPoints;
  const bestN = window._paretoBestN;
  const sorted = [...pts].sort((a,b) => {
    let va, vb;
    switch(paretoSort.col){
      case 'idx':   va = a.rx; vb = b.rx; break;
      case 'trial': va = a.n;  vb = b.n;  break;
      case 'brier': va = a.rx; vb = b.rx; break;
      case 'rps':   va = a.ry; vb = b.ry; break;
      default:      va = a.rx; vb = b.rx;
    }
    return paretoSort.dir * (va - vb);
  });
  const tbl = document.getElementById('tPareto');
  document.getElementById('tbPareto').innerHTML = sorted.map((p,i) => {
    const star = p.n === bestN ? ' ★' : '';
    return `<tr${star?' style="color:#ffee58"':''}>` +
      `<td>${i+1}</td><td>#${p.n}${star}</td>` +
      `<td>${p.rx.toFixed(6)}</td><td>${p.ry.toFixed(6)}</td></tr>`;
  }).join('');
  markSortHeaders(tbl, paretoSort);
}

let paretoTableVisible = false;
function toggleParetoTable(){
  paretoTableVisible = !paretoTableVisible;
  document.getElementById('paretoTablePanel').style.display = paretoTableVisible ? '' : 'none';
  document.getElementById('showParetoTableBtn').textContent = paretoTableVisible ? '▴ Pareto front points' : '▾ Pareto front points';
}

// ═══════════════════════════════════════════════
// HPARAMS TABLE
// ═══════════════════════════════════════════════
function buildHparams(){
  const hp = DATA.hparams;
  document.getElementById('hparamsSection').style.display='';

  // score metadata
  const scores = document.getElementById('hpScores');
  if (hp.meta && Object.keys(hp.meta).length){
    const labels = {trial:'Trial',rank:'Pareto Rank',game_brier:'Game Brier',rank_rps:'Rank RPS'};
    scores.innerHTML = Object.entries(hp.meta)
      .filter(([k])=>k in labels)
      .map(([k,v])=>`<div class="hp-score"><div class="sk">${labels[k]??k}</div><div class="sv">${v}</div></div>`)
      .join('');
  }

  const container = document.getElementById('hpGroups');
  Object.entries(hp.groups).forEach(([grpName, entries]) => {
    const div = document.createElement('div');
    div.className = 'hp-group';
    div.innerHTML = `<h4>${grpName}</h4>` + entries.map(e => `
      <div class="hp-row">
        <span class="hp-key">${e.key}</span>
        <span class="hp-val">${fmt(e.value)}</span>
        ${e.desc ? `<span class="hp-desc">${e.desc}</span>` : ''}
      </div>`).join('');
    container.appendChild(div);
  });
}

// ═══════════════════════════════════════════════
// PLAYERS TABLE
// ═══════════════════════════════════════════════
function buildTournamentPlayers(){
  renderTournamentPlayers();
}

function renderTournamentPlayers(){
  const tbl = document.getElementById('tPlayers');
  markSortHeaders(tbl, playersSort);

  const valFn = (p) => {
    switch(playersSort.col){
      case 'name':  return p.name.toLowerCase();
      case 'fide_id': return p.fide_id ?? 0;
      case 'rating': return p.rating ?? 0;
      case 'rapid':  return p.rapid_rating ?? 0;
      case 'blitz':  return p.blitz_rating ?? 0;
      default: return p.rating ?? 0;
    }
  };
  const sorted = [...DATA.tournament_players].sort((a,b) => {
    const va = valFn(a), vb = valFn(b);
    if (typeof va === 'string') return playersSort.dir * va.localeCompare(vb);
    return playersSort.dir * (va - vb);
  });

  const tb = document.getElementById('tbPlayers');
  tb.innerHTML = '';
  sorted.forEach((p, idx) => {
    const playerInfo = P_MAP[p.name];
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td><div class="pcell">
        ${playerInfo ? `<span class="dot" style="background:${playerInfo.color}"></span>` : ''}
        ${p.name}
      </div></td>
      <td style="color:var(--paper-3);font-size:.83rem">${p.fide_id??'—'}</td>
      <td style="font-weight:600">${p.rating??'—'}</td>
      <td style="color:var(--paper-2)">${p.rapid_rating??'—'}</td>
      <td style="color:var(--paper-2)">${p.blitz_rating??'—'}</td>`;
    tb.appendChild(tr);

    // Expandable detail row
    const detailTr = document.createElement('tr');
    detailTr.className = 'player-detail-row';
    detailTr.style.display = 'none';
    const detailTd = document.createElement('td');
    detailTd.colSpan = 5;
    detailTd.innerHTML = `<div class="player-history-wrap">
      <div class="player-history-charts">
        <div class="player-history-chart"><canvas id="phClassical${idx}"></canvas></div>
        <div class="player-history-chart"><canvas id="phRapid${idx}"></canvas></div>
        <div class="player-history-chart"><canvas id="phBlitz${idx}"></canvas></div>
      </div>
    </div>`;
    detailTr.appendChild(detailTd);
    tb.appendChild(detailTr);

    let chartBuilt = false;
    tr.onclick = () => {
      const vis = detailTr.style.display !== 'none';
      detailTr.style.display = vis ? 'none' : '';
      if (!vis && !chartBuilt){
        chartBuilt = true;
        buildPlayerHistoryCharts(p, playerInfo, idx);
      }
    };
  });
}

function buildPlayerHistoryCharts(p, info, idx){
  const n = p.history?.length ?? 0;
  if (n === 0) return;
  const labels = [];
  for (let i = 0; i < n; i++) labels.push(i === n-1 ? 'Now' : `−${n-1-i}`);
  const clr = info?.color ?? '#78b4ff';

  const configs = [
    {id:'phClassical'+idx, title:'Classical', elo:p.history, games:p.games_played},
    {id:'phRapid'+idx,     title:'Rapid',     elo:p.rapid_history, games:p.rapid_games_played},
    {id:'phBlitz'+idx,     title:'Blitz',     elo:p.blitz_history, games:p.blitz_games_played},
  ];
  configs.forEach(c => {
    new Chart(document.getElementById(c.id), {
      data:{
        labels,
        datasets:[
          {type:'bar', label:'Games', data:c.games, backgroundColor:clr+'30', borderColor:clr+'60',
           borderWidth:1, borderRadius:2, yAxisID:'yGames', order:2},
          {type:'line', label:'Elo', data:c.elo, borderColor:clr, backgroundColor:clr+'33',
           borderWidth:2, pointRadius:3, tension:.3, yAxisID:'yElo', order:1},
        ]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          title:{display:true, text:c.title, color:'#8494be', font:{size:12}}
        },
        scales:{
          x:{grid:{color:'rgba(120,180,255,.08)'}},
          yElo:{position:'left', grid:{color:'rgba(120,180,255,.08)'},
            title:{display:true, text:'Elo', color:'#6a7ca3', font:{size:10}}},
          yGames:{position:'right', grid:{drawOnChartArea:false}, beginAtZero:true,
            title:{display:true, text:'Games', color:'#6a7ca3', font:{size:10}},
            ticks:{stepSize:1}}
        }
      }
    });
  });
}
