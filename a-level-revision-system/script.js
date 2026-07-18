/* =========================================================================
   A-LEVEL REVISION SYSTEM — script.js
   Plain JavaScript, no external libraries. Everything is saved to
   localStorage so your plan, log and stats survive a refresh.

   DATA MODEL (all kept in one object called `state`, saved as JSON):
     state.subjects = [{ id, name, color, targetHours, topics:[{id,name,completed}] }]
     state.sessions = [{
        id, subjectId, topicId, date, startTime, finishTime,
        plannedMinutes, priority, difficulty, method, notes,
        completed, status, recurringGroupId,
        actualStart, actualFinish, actualMinutes, pausedMinutes,
        confidence, focus, createdAt, updatedAt
     }]
     state.exams = [{ id, subjectId, name, date }]
     state.settings = { darkMode, weekStartsOn }

   A "study log" entry and a "planned session" are the SAME record — a
   session becomes a log entry once it has actual time recorded. This
   guarantees no piece of revision is ever counted twice.
   ========================================================================= */

'use strict';

/* ---------------------------------------------------------------------
   1. CONSTANTS & GLOBAL STATE
   --------------------------------------------------------------------- */
const STORAGE_KEY = 'als_data_v1';
const BACKUP_KEY = 'als_backup_v1';
const TIMER_KEY = 'als_timer_v1';

const METHODS = ['Active Recall', 'Flashcards', 'Past Papers', 'Mind Maps',
  'Reading / Notes', 'Practice Questions', 'Teaching / Explaining', 'Other'];

const DEFAULT_COLORS = ['#4f8cff', '#f0a63d', '#2fb380', '#e6584c', '#9b6bd6', '#2ec5c5', '#e6598f', '#7d8fa6'];

let state = null;          // main persisted application state
let timer = null;          // current timer runtime state (persisted separately)
let timerIntervalHandle = null;

// Which week/month/day is currently displayed in the Timetable tab
let currentView = 'week';
let cursorDate = new Date(); // the date currently "focused" for week/month/day navigation

// Small in-memory helper for the confirm-dialog callback
let pendingConfirmAction = null;

/* ---------------------------------------------------------------------
   2. UTILITY FUNCTIONS
   --------------------------------------------------------------------- */
function uid() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function todayStr() {
  return formatDate(new Date());
}

// Format a Date object as YYYY-MM-DD (local time, not UTC)
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Parse a YYYY-MM-DD string into a local Date at midnight
function parseDateStr(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function startOfWeek(date, weekStartsOn) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = weekStartsOn === 'sunday' ? day : (day === 0 ? 6 : day - 1);
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function endOfMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }

function isSameDay(d1, d2) { return formatDate(d1) === formatDate(d2); }

function minutesBetween(startHHMM, finishHHMM) {
  const [sh, sm] = startHHMM.split(':').map(Number);
  const [fh, fm] = finishHHMM.split(':').map(Number);
  let mins = (fh * 60 + fm) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // crosses midnight
  return mins;
}

function formatMinutes(mins) {
  mins = Math.round(mins || 0);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatHMS(totalMs) {
  const totalSec = Math.max(0, Math.floor(totalMs / 1000));
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function getSubject(id) { return state.subjects.find(s => s.id === id); }
function getTopic(subjectId, topicId) {
  const subj = getSubject(subjectId);
  return subj ? subj.topics.find(t => t.id === topicId) : null;
}
function subjectColor(id) {
  const s = getSubject(id);
  return s ? s.color : '#999999';
}
function subjectName(id) {
  const s = getSubject(id);
  return s ? s.name : 'Unknown Subject';
}

function dateInRange(dateStr, fromStr, toStr) {
  if (fromStr && dateStr < fromStr) return false;
  if (toStr && dateStr > toStr) return false;
  return true;
}

function showToast(message, type) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function openConfirm(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  pendingConfirmAction = onConfirm;
  document.getElementById('confirmModal').classList.remove('hidden');
}

/* ---------------------------------------------------------------------
   3. STORAGE (localStorage load / save / backup)
   --------------------------------------------------------------------- */
function defaultState() {
  return {
    subjects: [],
    sessions: [],
    exams: [],
    settings: { darkMode: false, weekStartsOn: 'monday' }
  };
}

// Small starter dataset so first-time users see how everything fits together.
function seedState() {
  const s1 = { id: uid(), name: 'Mathematics', color: DEFAULT_COLORS[0], targetHours: 60, topics: [
    { id: uid(), name: 'Differentiation', completed: false },
    { id: uid(), name: 'Vectors', completed: false }
  ]};
  const s2 = { id: uid(), name: 'Chemistry', color: DEFAULT_COLORS[1], targetHours: 50, topics: [
    { id: uid(), name: 'Organic Mechanisms', completed: false },
    { id: uid(), name: 'Equilibria', completed: false }
  ]};
  const s3 = { id: uid(), name: 'Biology', color: DEFAULT_COLORS[2], targetHours: 50, topics: [
    { id: uid(), name: 'Cell Biology', completed: false },
    { id: uid(), name: 'Genetics', completed: false }
  ]};
  const data = defaultState();
  data.subjects = [s1, s2, s3];
  const today = new Date();
  data.sessions = [
    mkSeedSession(s1, s1.topics[0], addDays(today, 1), '16:00', '17:00', 'high'),
    mkSeedSession(s2, s2.topics[0], addDays(today, 2), '18:00', '19:00', 'medium'),
    mkSeedSession(s3, s3.topics[0], addDays(today, -1), '16:00', '17:00', 'medium', true)
  ];
  data.exams = [
    { id: uid(), subjectId: s1.id, name: 'Paper 1', date: formatDate(addDays(today, 45)) }
  ];
  return data;
}
function mkSeedSession(subj, topic, date, start, finish, priority, completed) {
  const planned = minutesBetween(start, finish);
  return {
    id: uid(), subjectId: subj.id, topicId: topic.id, date: formatDate(date),
    startTime: start, finishTime: finish, plannedMinutes: planned,
    priority, difficulty: 'medium', method: 'Active Recall', notes: '',
    completed: !!completed, status: completed ? 'completed' : 'planned',
    recurringGroupId: null,
    actualStart: completed ? date.toISOString() : null,
    actualFinish: completed ? date.toISOString() : null,
    actualMinutes: completed ? planned : 0,
    pausedMinutes: 0, confidence: completed ? 4 : null, focus: completed ? 4 : null,
    createdAt: Date.now(), updatedAt: Date.now()
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    state = seedState();
    persist();
    return;
  }
  try {
    state = JSON.parse(raw);
    if (!state.subjects) state.subjects = [];
    if (!state.sessions) state.sessions = [];
    if (!state.exams) state.exams = [];
    if (!state.settings) state.settings = { darkMode: false, weekStartsOn: 'monday' };
  } catch (e) {
    console.error('Failed to parse saved data, starting fresh.', e);
    state = defaultState();
  }
}

// Write current state to localStorage. Keeps a rolling one-step-back
// backup so accidental edits/clears/imports can be undone.
function persist(skipBackup) {
  if (!skipBackup) {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      localStorage.setItem(BACKUP_KEY, JSON.stringify({ timestamp: Date.now(), data: JSON.parse(existing) }));
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateLastBackupLabel();
}

function updateLastBackupLabel() {
  const label = document.getElementById('lastBackupLabel');
  if (!label) return;
  const raw = localStorage.getItem(BACKUP_KEY);
  if (!raw) { label.textContent = 'No auto-backup saved yet.'; return; }
  try {
    const parsed = JSON.parse(raw);
    label.textContent = 'Last auto-backup: ' + new Date(parsed.timestamp).toLocaleString();
  } catch (e) { label.textContent = ''; }
}

function loadTimer() {
  const raw = localStorage.getItem(TIMER_KEY);
  if (!raw) { timer = null; return; }
  try {
    timer = JSON.parse(raw);
    if (timer && timer.active && timer.running && !timer.paused) {
      // Catch up on time that passed while the page was closed/refreshed
      const now = Date.now();
      const delta = now - timer.lastTickEpoch;
      if (delta > 0) applyTimerDelta(delta);
      timer.lastTickEpoch = now;
    }
  } catch (e) { timer = null; }
}
function saveTimer() {
  if (timer) localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
  else localStorage.removeItem(TIMER_KEY);
}

/* ---------------------------------------------------------------------
   4. RENDER ORCHESTRATION
   --------------------------------------------------------------------- */
function renderAll() {
  renderSubjectSelects();
  renderMethodOptions();
  renderDashboard();
  renderTimetable();
  renderTimerTab();
  renderLog();
  renderSubjectsManage();
  renderStats();
  updateLastBackupLabel();
}

// Populate every <select> in the app that lists subjects/topics/filters.
function renderSubjectSelects() {
  const subjectSelectIds = ['sessionSubject', 'logSubject', 'examSubject', 'timerSubjectSelect', 'filterSubject', 'logFilterSubject'];
  subjectSelectIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isFilter = id === 'filterSubject' || id === 'logFilterSubject';
    const keepValue = el.value;
    el.innerHTML = '';
    if (isFilter) el.appendChild(new Option('All Subjects', ''));
    else el.appendChild(new Option('Select subject...', ''));
    state.subjects.forEach(s => el.appendChild(new Option(s.name, s.id)));
    if ([...el.options].some(o => o.value === keepValue)) el.value = keepValue;
  });
  updateTopicOptions('sessionSubject', 'sessionTopic');
  updateTopicOptions('logSubject', 'logTopic');
  updateTopicOptions('timerSubjectSelect', 'timerTopicSelect');
}

function updateTopicOptions(subjectSelectId, topicSelectId) {
  const subjSel = document.getElementById(subjectSelectId);
  const topicSel = document.getElementById(topicSelectId);
  if (!subjSel || !topicSel) return;
  const keepValue = topicSel.value;
  topicSel.innerHTML = '';
  topicSel.appendChild(new Option('Select topic...', ''));
  const subj = getSubject(subjSel.value);
  if (subj) subj.topics.forEach(t => topicSel.appendChild(new Option(t.name, t.id)));
  if ([...topicSel.options].some(o => o.value === keepValue)) topicSel.value = keepValue;
}

function renderMethodOptions() {
  ['filterMethod', 'logFilterMethod'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const keepValue = el.value;
    el.innerHTML = '<option value="">All Methods</option>';
    METHODS.forEach(m => el.appendChild(new Option(m, m)));
    el.value = keepValue;
  });
}

/* ---------------------------------------------------------------------
   5. STATISTICS ENGINE
   --------------------------------------------------------------------- */
// Computes aggregate numbers for a given array of sessions.
function computeStats(sessions) {
  const perSubject = {};
  state.subjects.forEach(s => {
    perSubject[s.id] = { actualMinutes: 0, plannedMinutes: 0, completedCount: 0, totalCount: 0, sessionLengths: [] };
  });
  let totalActual = 0, totalPlanned = 0, completedCount = 0;

  sessions.forEach(sess => {
    const bucket = perSubject[sess.subjectId];
    if (!bucket) return;
    bucket.totalCount++;
    bucket.plannedMinutes += sess.plannedMinutes || 0;
    totalPlanned += sess.plannedMinutes || 0;
    if (sess.completed) {
      bucket.completedCount++;
      bucket.actualMinutes += sess.actualMinutes || 0;
      bucket.sessionLengths.push(sess.actualMinutes || 0);
      totalActual += sess.actualMinutes || 0;
      completedCount++;
    }
  });

  return { perSubject, totalActual, totalPlanned, completedCount, totalCount: sessions.length };
}

function sessionsInRange(fromStr, toStr) {
  return state.sessions.filter(s => dateInRange(s.date, fromStr, toStr));
}

// Streak = consecutive days (ending today or yesterday) with >=1 completed session.
function computeStreaks() {
  const daysWithRevision = new Set(
    state.sessions.filter(s => s.completed && s.actualMinutes > 0).map(s => s.date)
  );
  if (daysWithRevision.size === 0) return { current: 0, longest: 0 };

  // Current streak: walk backwards from today.
  let current = 0;
  let cursor = new Date();
  // allow the streak to still count if today has none yet but yesterday does
  if (!daysWithRevision.has(formatDate(cursor))) cursor = addDays(cursor, -1);
  while (daysWithRevision.has(formatDate(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }

  // Longest streak: scan all recorded days.
  const sortedDays = [...daysWithRevision].sort();
  let longest = 1, run = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = parseDateStr(sortedDays[i - 1]);
    const cur = parseDateStr(sortedDays[i]);
    const diffDays = Math.round((cur - prev) / 86400000);
    if (diffDays === 1) { run++; } else { run = 1; }
    longest = Math.max(longest, run);
  }
  return { current, longest };
}

/* ---------------------------------------------------------------------
   6. DASHBOARD RENDERING
   --------------------------------------------------------------------- */
function getDashboardRange() {
  const mode = document.getElementById('dashFilterRange').value;
  const today = new Date();
  let from = null, to = null;
  if (mode === 'today') { from = to = todayStr(); }
  else if (mode === 'week') { from = formatDate(startOfWeek(today, state.settings.weekStartsOn)); to = formatDate(addDays(startOfWeek(today, state.settings.weekStartsOn), 6)); }
  else if (mode === 'month') { from = formatDate(startOfMonth(today)); to = formatDate(endOfMonth(today)); }
  else if (mode === 'custom') {
    from = document.getElementById('dashFromDate').value || null;
    to = document.getElementById('dashToDate').value || null;
  }
  return { from, to, mode };
}

function renderDashboard() {
  const { from, to } = getDashboardRange();
  const rangeSessions = sessionsInRange(from, to);
  const rangeStats = computeStats(rangeSessions);

  const today = new Date();
  const weekFrom = formatDate(startOfWeek(today, state.settings.weekStartsOn));
  const weekTo = formatDate(addDays(startOfWeek(today, state.settings.weekStartsOn), 6));
  const monthFrom = formatDate(startOfMonth(today));
  const monthTo = formatDate(endOfMonth(today));

  const todayStats = computeStats(sessionsInRange(todayStr(), todayStr()));
  const weekStats = computeStats(sessionsInRange(weekFrom, weekTo));
  const monthStats = computeStats(sessionsInRange(monthFrom, monthTo));
  const allStats = computeStats(state.sessions);
  const streaks = computeStreaks();

  const pctPlanned = rangeStats.totalCount ? Math.round((rangeStats.completedCount / rangeStats.totalCount) * 100) : 0;

  const cards = [
    { label: 'Total Revision (selected range)', value: formatMinutes(rangeStats.totalActual) },
    { label: 'Revised Today', value: formatMinutes(todayStats.totalActual) },
    { label: 'Revised This Week', value: formatMinutes(weekStats.totalActual) },
    { label: 'Revised This Month', value: formatMinutes(monthStats.totalActual) },
    { label: 'Planned vs Completed (range)', value: `${formatMinutes(rangeStats.totalActual)} / ${formatMinutes(rangeStats.totalPlanned)}` },
    { label: '% Planned Sessions Completed', value: pctPlanned + '%' },
    { label: 'Completed Sessions (range)', value: rangeStats.completedCount },
    { label: 'Current Streak', value: streaks.current + ' day' + (streaks.current === 1 ? '' : 's') },
    { label: 'All-Time Total', value: formatMinutes(allStats.totalActual) }
  ];
  document.getElementById('dashStatCards').innerHTML = cards.map(c => `
    <div class="stat-card"><div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div></div>
  `).join('');

  renderSubjectSummaryCards(allStats, weekStats);
  renderUpcomingSessions();
  renderUpcomingExams();
  renderBalanceCheck(allStats);
  renderDashboardCharts(rangeStats, allStats);
}

function renderSubjectSummaryCards(allStats, weekStats) {
  const container = document.getElementById('subjectSummaryCards');
  if (state.subjects.length === 0) {
    container.innerHTML = '<div class="empty-state">No subjects yet. Add one in the Subjects tab.</div>';
    return;
  }
  const grandTotal = allStats.totalActual || 1; // avoid divide by zero
  container.innerHTML = state.subjects.map(subj => {
    const bucket = allStats.perSubject[subj.id] || { actualMinutes: 0, completedCount: 0 };
    const weekBucket = weekStats.perSubject[subj.id] || { actualMinutes: 0 };
    const pctOfTotal = Math.round((bucket.actualMinutes / grandTotal) * 100);
    const targetMinutes = (subj.targetHours || 0) * 60;
    const pctOfTarget = targetMinutes ? Math.min(100, Math.round((bucket.actualMinutes / targetMinutes) * 100)) : 0;

    const subjSessions = state.sessions.filter(s => s.subjectId === subj.id);
    const lastDone = subjSessions.filter(s => s.completed).sort((a, b) => (b.actualFinish || '').localeCompare(a.actualFinish || ''))[0];
    const nextPlanned = subjSessions.filter(s => !s.completed && s.date >= todayStr()).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0];

    return `
    <div class="subject-card" style="--subject-color:${subj.color}">
      <div class="subject-card-top">
        <span class="subject-card-name"><span class="dot" style="background:${subj.color}"></span>${escapeHtml(subj.name)}</span>
        <span>${formatMinutes(bucket.actualMinutes)}</span>
      </div>
      <div class="subject-card-meta">
        <span>This week: ${formatMinutes(weekBucket.actualMinutes)}</span>
        <span>Sessions: ${bucket.completedCount}</span>
        <span>${pctOfTotal}% of total</span>
        <span>Target: ${pctOfTarget}%</span>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pctOfTarget}%"></div></div>
      <div class="subject-card-meta" style="margin-top:6px">
        <span>Last topic: ${lastDone ? escapeHtml(topicLabel(lastDone)) : '—'}</span>
        <span>Next: ${nextPlanned ? escapeHtml(nextPlanned.date) + ' ' + nextPlanned.startTime : '—'}</span>
      </div>
    </div>`;
  }).join('');
}

function topicLabel(session) {
  const t = getTopic(session.subjectId, session.topicId);
  return t ? t.name : (session.topicCustom || 'General');
}

function renderUpcomingSessions() {
  const upcoming = state.sessions
    .filter(s => !s.completed && s.date >= todayStr())
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .slice(0, 8);
  const container = document.getElementById('upcomingSessionsList');
  if (upcoming.length === 0) { container.innerHTML = '<div class="empty-state">No upcoming sessions planned.</div>'; return; }
  container.innerHTML = upcoming.map(s => `
    <div class="list-item">
      <span class="list-item-main"><span class="dot" style="background:${subjectColor(s.subjectId)}"></span>
        <strong>${escapeHtml(subjectName(s.subjectId))}</strong> — ${escapeHtml(topicLabel(s))}
        <span class="tag">${s.date} ${s.startTime}</span>
        <span class="tag priority-${s.priority}">${s.priority}</span>
      </span>
      <button class="btn btn-small" onclick="openSessionModal('${s.id}')">Edit</button>
    </div>`).join('');
}

function renderUpcomingExams() {
  const upcoming = state.exams.filter(e => e.date >= todayStr()).sort((a, b) => a.date.localeCompare(b.date));
  const container = document.getElementById('upcomingExamsList');
  if (upcoming.length === 0) { container.innerHTML = '<div class="empty-state">No exams added yet.</div>'; return; }
  container.innerHTML = upcoming.map(e => {
    const days = Math.round((parseDateStr(e.date) - parseDateStr(todayStr())) / 86400000);
    return `
    <div class="list-item">
      <span class="list-item-main"><span class="dot" style="background:${subjectColor(e.subjectId)}"></span>
        <strong>${escapeHtml(subjectName(e.subjectId))}</strong> ${escapeHtml(e.name || '')}
        <span class="tag">${e.date}</span>
        <span class="tag">${days} day${days === 1 ? '' : 's'} left</span>
      </span>
      <button class="btn btn-small" onclick="openExamModal('${e.id}')">Edit</button>
    </div>`;
  }).join('');
}

function renderBalanceCheck(allStats) {
  const container = document.getElementById('balanceCheck');
  if (state.subjects.length === 0) { container.innerHTML = '<div class="empty-state">Add subjects to see balance insights.</div>'; return; }
  const totals = state.subjects.map(s => ({ subj: s, minutes: (allStats.perSubject[s.id] || {}).actualMinutes || 0 }));
  const sorted = [...totals].sort((a, b) => b.minutes - a.minutes);
  const most = sorted[0], least = sorted[sorted.length - 1];

  const sevenDaysAgo = formatDate(addDays(new Date(), -7));
  const stale = state.subjects.filter(subj => {
    const lastSession = state.sessions.filter(s => s.subjectId === subj.id && s.completed)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return !lastSession || lastSession.date < sevenDaysAgo;
  });

  let balanceVerdict = 'Not enough data yet.';
  if (most && least && most.minutes > 0) {
    const ratio = least.minutes === 0 ? Infinity : most.minutes / least.minutes;
    balanceVerdict = ratio <= 1.5 ? 'Your revision looks well balanced across subjects.' : 'Your revision is uneven — consider giving neglected subjects more time.';
  }

  container.innerHTML = `
    <div class="list-item"><span>Most revised</span><strong>${most ? escapeHtml(most.subj.name) : '—'}</strong></div>
    <div class="list-item"><span>Least revised</span><strong>${least ? escapeHtml(least.subj.name) : '—'}</strong></div>
    <div class="list-item"><span>Not revised in 7+ days</span><strong>${stale.length ? stale.map(s => escapeHtml(s.name)).join(', ') : 'None'}</strong></div>
    <div class="list-item"><span>Balance</span><strong>${balanceVerdict}</strong></div>
  `;
}

/* ---- Charts: simple dependency-free horizontal bar charts ---- */
function renderBarChart(containerId, rows, opts) {
  opts = opts || {};
  const container = document.getElementById(containerId);
  if (!rows.length) { container.innerHTML = '<div class="bar-empty">No data yet.</div>'; return; }
  const max = Math.max(1, ...rows.map(r => Math.max(r.value, r.secondaryValue || 0)));
  container.innerHTML = rows.map(r => {
    const pct = Math.round((r.value / max) * 100);
    const secPct = r.secondaryValue !== undefined ? Math.round((r.secondaryValue / max) * 100) : null;
    return `
    <div class="bar-row">
      <span class="bar-label" title="${escapeHtml(r.label)}">${escapeHtml(r.label)}</span>
      <div class="dual-bar">
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${r.color || 'var(--accent)'}"></div></div>
        ${secPct !== null ? `<div class="bar-track"><div class="bar-fill secondary" style="width:${secPct}%;background:${r.color || 'var(--accent)'}"></div></div>` : ''}
      </div>
      <span class="bar-value">${r.displayValue || formatMinutes(r.value)}</span>
    </div>`;
  }).join('');
}

function renderDashboardCharts(rangeStats, allStats) {
  // Revision time by subject (all-time)
  renderBarChart('chartBySubject', state.subjects.map(s => ({
    label: s.name, value: (allStats.perSubject[s.id] || {}).actualMinutes || 0, color: s.color
  })));

  // Weekly revision hours for the last 8 weeks
  const weekRows = [];
  for (let i = 7; i >= 0; i--) {
    const wStart = addDays(startOfWeek(new Date(), state.settings.weekStartsOn), -7 * i);
    const wEnd = addDays(wStart, 6);
    const stats = computeStats(sessionsInRange(formatDate(wStart), formatDate(wEnd)));
    weekRows.push({ label: `${wStart.getDate()}/${wStart.getMonth() + 1}`, value: stats.totalActual, displayValue: formatMinutes(stats.totalActual) });
  }
  renderBarChart('chartWeekly', weekRows);

  // Planned vs actual per subject (all-time)
  renderBarChart('chartPlannedActual', state.subjects.map(s => {
    const bucket = allStats.perSubject[s.id] || { actualMinutes: 0, plannedMinutes: 0 };
    return { label: s.name, value: bucket.plannedMinutes, secondaryValue: bucket.actualMinutes, color: s.color, displayValue: `${formatMinutes(bucket.actualMinutes)}/${formatMinutes(bucket.plannedMinutes)}` };
  }));

  // Activity over the last 7 days
  const dayRows = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(new Date(), -i);
    const stats = computeStats(sessionsInRange(formatDate(d), formatDate(d)));
    dayRows.push({ label: d.toLocaleDateString(undefined, { weekday: 'short' }), value: stats.totalActual, displayValue: formatMinutes(stats.totalActual) });
  }
  renderBarChart('chartLast7', dayRows);
}

/* ---------------------------------------------------------------------
   7. TIMETABLE / CALENDAR (Week, Month, Day views)
   --------------------------------------------------------------------- */
function getTimetableFiltered() {
  const subjectId = document.getElementById('filterSubject').value;
  const completedFilter = document.getElementById('filterCompleted').value;
  const priority = document.getElementById('filterPriority').value;
  const method = document.getElementById('filterMethod').value;
  const search = document.getElementById('filterSearch').value.trim().toLowerCase();

  return state.sessions.filter(s => {
    if (subjectId && s.subjectId !== subjectId) return false;
    if (priority && s.priority !== priority) return false;
    if (method && s.method !== method) return false;
    if (completedFilter === 'completed' && !s.completed) return false;
    if (completedFilter === 'incomplete' && s.completed) return false;
    if (completedFilter === 'upcoming' && (s.completed || s.date < todayStr())) return false;
    if (search) {
      const hay = (topicLabel(s) + ' ' + (s.notes || '')).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function renderTimetable() {
  const sessions = getTimetableFiltered();
  if (currentView === 'week') renderWeekView(sessions);
  else if (currentView === 'month') renderMonthView(sessions);
  else renderDayView(sessions);
}

const HOUR_START = 6, HOUR_END = 23; // timetable shows 06:00–23:00

function renderWeekView(sessions) {
  const weekStart = startOfWeek(cursorDate, state.settings.weekStartsOn);
  document.getElementById('periodLabel').textContent =
    `${weekStart.toLocaleDateString()} – ${addDays(weekStart, 6).toLocaleDateString()}`;

  let html = '<div class="week-corner"></div>';
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    days.push(d);
    html += `<div class="week-day-header ${isSameDay(d, new Date()) ? 'is-today' : ''}">${d.toLocaleDateString(undefined, { weekday: 'short' })}<br>${d.getDate()}/${d.getMonth() + 1}</div>`;
  }
  // hour label column
  for (let h = HOUR_START; h <= HOUR_END; h++) {
    html += `<div class="week-hour-label">${String(h).padStart(2, '0')}:00</div>`;
    for (let i = 0; i < 7; i++) html += ''; // placeholder, columns built separately below
  }

  document.getElementById('weekView').innerHTML = '';
  const grid = document.getElementById('weekView');
  grid.style.gridTemplateRows = `40px repeat(${HOUR_END - HOUR_START + 1}, 48px)`;

  // Build corner + headers
  const corner = document.createElement('div');
  corner.className = 'week-corner';
  grid.appendChild(corner);
  days.forEach(d => {
    const h = document.createElement('div');
    h.className = 'week-day-header' + (isSameDay(d, new Date()) ? ' is-today' : '');
    h.innerHTML = `${d.toLocaleDateString(undefined, { weekday: 'short' })}<br>${d.getDate()}/${d.getMonth() + 1}`;
    grid.appendChild(h);
  });

  // Build hour label column cells interleaved with day columns per row
  for (let h = HOUR_START; h <= HOUR_END; h++) {
    const label = document.createElement('div');
    label.className = 'week-hour-label';
    label.textContent = String(h).padStart(2, '0') + ':00';
    grid.appendChild(label);
    days.forEach((d, dayIndex) => {
      // Only create the day column once (on the first hour row), spanning all hours
      if (h === HOUR_START) {
        const col = document.createElement('div');
        col.className = 'week-day-col';
        col.style.gridColumn = String(dayIndex + 2);
        col.style.gridRow = `2 / span ${HOUR_END - HOUR_START + 1}`;
        col.dataset.date = formatDate(d);
        col.addEventListener('dragover', onDayColDragOver);
        col.addEventListener('dragleave', onDayColDragLeave);
        col.addEventListener('drop', onDayColDrop);
        col.addEventListener('dblclick', (e) => {
          if (e.target !== col) return;
          const rect = col.getBoundingClientRect();
          const hourOffset = Math.floor((e.clientY - rect.top) / 48);
          openSessionModal(null, formatDate(d), `${String(HOUR_START + hourOffset).padStart(2, '0')}:00`);
        });
        grid.appendChild(col);
      }
    });
  }

  // Place session blocks into their day column
  const daySessions = {};
  days.forEach(d => daySessions[formatDate(d)] = []);
  sessions.forEach(s => { if (daySessions[s.date]) daySessions[s.date].push(s); });

  document.querySelectorAll('.week-day-col').forEach(col => {
    const dateStr = col.dataset.date;
    (daySessions[dateStr] || []).forEach(s => {
      const [sh, sm] = s.startTime.split(':').map(Number);
      const topPx = ((sh - HOUR_START) * 60 + sm) * (48 / 60);
      const heightPx = Math.max(20, s.plannedMinutes * (48 / 60));
      const block = document.createElement('div');
      block.className = 'week-slot-block' + (s.completed ? ' completed' : '');
      block.style.top = topPx + 'px';
      block.style.height = heightPx + 'px';
      block.style.background = subjectColor(s.subjectId);
      block.draggable = true;
      block.dataset.sessionId = s.id;
      block.title = `${subjectName(s.subjectId)} — ${topicLabel(s)}`;
      block.innerHTML = `<strong>${escapeHtml(subjectName(s.subjectId))}</strong><br>${escapeHtml(topicLabel(s))}<br>${s.startTime}-${s.finishTime}
        <div class="slot-actions">
          <button title="Edit" onclick="event.stopPropagation();openSessionModal('${s.id}')">Edit</button>
          <button title="Duplicate" onclick="event.stopPropagation();duplicateSession('${s.id}')">Dup</button>
          <button title="Toggle complete" onclick="event.stopPropagation();toggleSessionCompleted('${s.id}')">${s.completed ? 'Undo' : 'Done'}</button>
        </div>`;
      block.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', s.id); });
      block.addEventListener('click', () => openSessionModal(s.id));
      col.appendChild(block);
    });
  });
}

function onDayColDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drop-hover'); }
function onDayColDragLeave(e) { e.currentTarget.classList.remove('drop-hover'); }
function onDayColDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drop-hover');
  const sessionId = e.dataTransfer.getData('text/plain');
  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const hourOffset = (e.clientY - rect.top) / 48;
  const totalMinutesFromStart = Math.round(hourOffset * 60 / 15) * 15; // snap to 15 min
  const newStartMinutes = HOUR_START * 60 + Math.max(0, totalMinutesFromStart);
  const newStart = `${String(Math.floor(newStartMinutes / 60)).padStart(2, '0')}:${String(newStartMinutes % 60).padStart(2, '0')}`;
  const newFinishMinutes = newStartMinutes + session.plannedMinutes;
  const newFinish = `${String(Math.floor(newFinishMinutes / 60) % 24).padStart(2, '0')}:${String(newFinishMinutes % 60).padStart(2, '0')}`;
  session.date = e.currentTarget.dataset.date;
  session.startTime = newStart;
  session.finishTime = newFinish;
  session.updatedAt = Date.now();
  persist();
  renderAll();
  showToast('Session moved to ' + session.date + ' ' + session.startTime, 'success');
}

function renderMonthView(sessions) {
  const monthStart = startOfMonth(cursorDate);
  document.getElementById('periodLabel').textContent = cursorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const gridStart = startOfWeek(monthStart, state.settings.weekStartsOn);
  const container = document.getElementById('monthView');
  let html = '';
  const dayNames = state.settings.weekStartsOn === 'sunday'
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  dayNames.forEach(n => html += `<div class="month-day-header">${n}</div>`);

  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    if (i >= 35 && d.getMonth() !== monthStart.getMonth()) break; // trim trailing row if unneeded
    const dateStr = formatDate(d);
    const daySessions = sessions.filter(s => s.date === dateStr);
    const otherMonth = d.getMonth() !== monthStart.getMonth();
    html += `<div class="month-cell ${otherMonth ? 'other-month' : ''} ${isSameDay(d, new Date()) ? 'is-today' : ''}" data-date="${dateStr}">
      <div class="month-cell-date">${d.getDate()}</div>
      ${daySessions.slice(0, 4).map(s => `<div class="month-cell-session" style="background:${subjectColor(s.subjectId)}" onclick="openSessionModal('${s.id}')" title="${escapeHtml(subjectName(s.subjectId))} — ${escapeHtml(topicLabel(s))}">${escapeHtml(subjectName(s.subjectId))}</div>`).join('')}
      ${daySessions.length > 4 ? `<div class="muted small">+${daySessions.length - 4} more</div>` : ''}
    </div>`;
  }
  container.innerHTML = html;
  container.querySelectorAll('.month-cell').forEach(cell => {
    cell.addEventListener('dblclick', (e) => {
      if (e.target !== cell && e.target.className !== 'month-cell-date') return;
      openSessionModal(null, cell.dataset.date);
    });
  });
}

function renderDayView(sessions) {
  document.getElementById('periodLabel').textContent = cursorDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dateStr = formatDate(cursorDate);
  const daySessions = sessions.filter(s => s.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const container = document.getElementById('dayView');
  if (!daySessions.length) { container.innerHTML = '<div class="empty-state">No sessions planned for this day. Double-click below to add one, or use "+ Add Session".</div>'; return; }
  container.innerHTML = daySessions.map(s => `
    <div class="day-slot" style="border-left-color:${subjectColor(s.subjectId)}">
      <div class="day-slot-time">${s.startTime}–${s.finishTime}</div>
      <div>
        <strong>${escapeHtml(subjectName(s.subjectId))}</strong> — ${escapeHtml(topicLabel(s))}
        <div class="subject-card-meta">
          <span class="tag priority-${s.priority}">${s.priority}</span>
          <span class="tag">${s.difficulty}</span>
          <span class="tag">${s.method}</span>
          <span class="tag">${s.completed ? 'Completed' : 'Planned'}</span>
        </div>
        ${s.notes ? `<p class="muted small">${escapeHtml(s.notes)}</p>` : ''}
      </div>
      <button class="btn btn-small" onclick="openSessionModal('${s.id}')">Edit</button>
    </div>`).join('');
}

function changePeriod(delta) {
  if (currentView === 'week') cursorDate = addDays(cursorDate, 7 * delta);
  else if (currentView === 'month') cursorDate = new Date(cursorDate.getFullYear(), cursorDate.getMonth() + delta, 1);
  else cursorDate = addDays(cursorDate, delta);
  renderTimetable();
}

/* ---------------------------------------------------------------------
   8. SESSION CRUD (add / edit / duplicate / delete / recurring)
   --------------------------------------------------------------------- */
function openSessionModal(id, prefillDate, prefillTime) {
  const modal = document.getElementById('sessionModal');
  document.getElementById('sessionId').value = id || '';
  const isEdit = !!id;
  document.getElementById('sessionModalTitle').textContent = isEdit ? 'Edit Session' : 'Add Session';
  document.getElementById('deleteSessionBtn').classList.toggle('hidden', !isEdit);
  document.getElementById('duplicateSessionBtn').classList.toggle('hidden', !isEdit);

  if (isEdit) {
    const s = state.sessions.find(x => x.id === id);
    document.getElementById('sessionSubject').value = s.subjectId;
    updateTopicOptions('sessionSubject', 'sessionTopic');
    document.getElementById('sessionTopic').value = s.topicId || '';
    document.getElementById('sessionDate').value = s.date;
    document.getElementById('sessionStart').value = s.startTime;
    document.getElementById('sessionFinish').value = s.finishTime;
    document.getElementById('sessionPriority').value = s.priority;
    document.getElementById('sessionDifficulty').value = s.difficulty;
    document.getElementById('sessionMethod').value = s.method;
    document.getElementById('sessionNotes').value = s.notes || '';
    document.getElementById('sessionCompleted').checked = s.completed;
    document.getElementById('sessionRecur').value = 'none';
    document.getElementById('sessionRecur').disabled = true;
  } else {
    document.getElementById('sessionSubject').value = state.subjects[0] ? state.subjects[0].id : '';
    updateTopicOptions('sessionSubject', 'sessionTopic');
    document.getElementById('sessionDate').value = prefillDate || todayStr();
    document.getElementById('sessionStart').value = prefillTime || '16:00';
    document.getElementById('sessionFinish').value = addMinutesToTime(prefillTime || '16:00', 60);
    document.getElementById('sessionPriority').value = 'medium';
    document.getElementById('sessionDifficulty').value = 'medium';
    document.getElementById('sessionMethod').value = METHODS[0];
    document.getElementById('sessionNotes').value = '';
    document.getElementById('sessionCompleted').checked = false;
    document.getElementById('sessionRecur').value = 'none';
    document.getElementById('sessionRecur').disabled = false;
  }
  document.getElementById('sessionRecurCountWrap').classList.add('hidden-input');
  modal.classList.remove('hidden');
}

function addMinutesToTime(hhmm, addMin) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + addMin;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function saveSessionFromModal() {
  const id = document.getElementById('sessionId').value;
  const subjectId = document.getElementById('sessionSubject').value;
  if (!subjectId) { showToast('Please select a subject.', 'danger'); return; }
  const date = document.getElementById('sessionDate').value;
  const startTime = document.getElementById('sessionStart').value;
  const finishTime = document.getElementById('sessionFinish').value;
  if (!date || !startTime || !finishTime) { showToast('Please fill in date, start and finish time.', 'danger'); return; }

  const base = {
    subjectId,
    topicId: document.getElementById('sessionTopic').value || null,
    date, startTime, finishTime,
    plannedMinutes: minutesBetween(startTime, finishTime),
    priority: document.getElementById('sessionPriority').value,
    difficulty: document.getElementById('sessionDifficulty').value,
    method: document.getElementById('sessionMethod').value,
    notes: document.getElementById('sessionNotes').value,
    completed: document.getElementById('sessionCompleted').checked,
    updatedAt: Date.now()
  };

  if (id) {
    const s = state.sessions.find(x => x.id === id);
    Object.assign(s, base);
    if (s.completed && !s.actualMinutes) { s.actualMinutes = s.plannedMinutes; s.actualStart = s.actualStart || new Date().toISOString(); s.actualFinish = s.actualFinish || new Date().toISOString(); }
    s.status = s.completed ? 'completed' : 'planned';
    showToast('Session updated.', 'success');
  } else {
    const recur = document.getElementById('sessionRecur').value;
    const count = recur !== 'none' ? parseInt(document.getElementById('sessionRecurCount').value, 10) || 1 : 1;
    const groupId = recur !== 'none' ? uid() : null;
    for (let i = 0; i < count; i++) {
      const occurrenceDate = recur === 'daily' ? formatDate(addDays(parseDateStr(date), i))
        : recur === 'weekly' ? formatDate(addDays(parseDateStr(date), i * 7))
        : date;
      state.sessions.push({
        id: uid(), ...base, date: occurrenceDate, status: base.completed ? 'completed' : 'planned',
        recurringGroupId: groupId,
        actualStart: base.completed ? new Date().toISOString() : null,
        actualFinish: base.completed ? new Date().toISOString() : null,
        actualMinutes: base.completed ? base.plannedMinutes : 0,
        pausedMinutes: 0, confidence: null, focus: null, createdAt: Date.now()
      });
    }
    showToast(count > 1 ? `${count} recurring sessions created.` : 'Session added.', 'success');
  }
  persist();
  closeModal('sessionModal');
  renderAll();
}

function deleteSession(id) {
  openConfirm('Delete session?', 'This will permanently remove this revision session.', () => {
    state.sessions = state.sessions.filter(s => s.id !== id);
    persist();
    closeModal('sessionModal');
    renderAll();
    showToast('Session deleted.', 'danger');
  });
}

function duplicateSession(id) {
  const s = state.sessions.find(x => x.id === id);
  if (!s) return;
  const copy = { ...s, id: uid(), completed: false, status: 'planned', actualStart: null, actualFinish: null, actualMinutes: 0, pausedMinutes: 0, confidence: null, focus: null, createdAt: Date.now(), updatedAt: Date.now(), recurringGroupId: null };
  state.sessions.push(copy);
  persist();
  closeModal('sessionModal');
  renderAll();
  showToast('Session duplicated.', 'success');
}

function toggleSessionCompleted(id) {
  const s = state.sessions.find(x => x.id === id);
  if (!s) return;
  s.completed = !s.completed;
  s.status = s.completed ? 'completed' : 'planned';
  if (s.completed && !s.actualMinutes) {
    s.actualMinutes = s.plannedMinutes;
    s.actualStart = s.actualStart || new Date().toISOString();
    s.actualFinish = s.actualFinish || new Date().toISOString();
  }
  s.updatedAt = Date.now();
  persist();
  renderAll();
}

/* ---------------------------------------------------------------------
   9. STUDY LOG (manual entries share the same `sessions` array)
   --------------------------------------------------------------------- */
function getLogFiltered() {
  const subjectId = document.getElementById('logFilterSubject').value;
  const completedFilter = document.getElementById('logFilterCompleted').value;
  const priority = document.getElementById('logFilterPriority').value;
  const method = document.getElementById('logFilterMethod').value;
  const date = document.getElementById('logFilterDate').value;
  const search = document.getElementById('logSearch').value.trim().toLowerCase();

  return state.sessions.filter(s => {
    if (subjectId && s.subjectId !== subjectId) return false;
    if (priority && s.priority !== priority) return false;
    if (method && s.method !== method) return false;
    if (date && s.date !== date) return false;
    if (completedFilter === 'completed' && !s.completed) return false;
    if (completedFilter === 'incomplete' && s.completed) return false;
    if (completedFilter === 'upcoming' && (s.completed || s.date < todayStr())) return false;
    if (search) {
      const hay = (topicLabel(s) + ' ' + (s.notes || '') + ' ' + subjectName(s.subjectId)).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  }).sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
}

function renderLog() {
  const rows = getLogFiltered();
  const tbody = document.getElementById('logTableBody');
  document.getElementById('logEmptyState').classList.toggle('hidden', rows.length > 0);
  tbody.innerHTML = rows.map(s => `
    <tr>
      <td>${s.date}</td>
      <td><span class="dot" style="background:${subjectColor(s.subjectId)}"></span>${escapeHtml(subjectName(s.subjectId))}</td>
      <td>${escapeHtml(topicLabel(s))}</td>
      <td>${formatMinutes(s.plannedMinutes)}</td>
      <td>${formatMinutes(s.actualMinutes)}</td>
      <td>${escapeHtml(s.method || '')}</td>
      <td>${s.confidence ? '★'.repeat(s.confidence) : '—'}</td>
      <td>${s.focus ? '★'.repeat(s.focus) : '—'}</td>
      <td>${s.completed ? 'Completed' : (s.date < todayStr() ? 'Missed' : 'Upcoming')}</td>
      <td class="notes-cell">${escapeHtml(s.notes || '')}</td>
      <td><button class="btn btn-small" onclick="openLogModal('${s.id}')">Edit</button></td>
    </tr>`).join('');
}

function openLogModal(id) {
  const modal = document.getElementById('logModal');
  document.getElementById('logId').value = id || '';
  document.getElementById('deleteLogBtn').classList.toggle('hidden', !id);
  if (id) {
    const s = state.sessions.find(x => x.id === id);
    document.getElementById('logModalTitle').textContent = 'Edit Log Entry';
    document.getElementById('logSubject').value = s.subjectId;
    updateTopicOptions('logSubject', 'logTopic');
    document.getElementById('logTopic').value = s.topicId || '';
    document.getElementById('logDate').value = s.date;
    document.getElementById('logPlanned').value = s.plannedMinutes;
    document.getElementById('logActual').value = s.actualMinutes;
    document.getElementById('logMethod').value = s.method;
    document.getElementById('logConfidence').value = s.confidence || 3;
    document.getElementById('logFocus').value = s.focus || 3;
    document.getElementById('logNotes').value = s.notes || '';
    document.getElementById('logCompleted').checked = s.completed;
  } else {
    document.getElementById('logModalTitle').textContent = 'Add Log Entry';
    document.getElementById('logSubject').value = state.subjects[0] ? state.subjects[0].id : '';
    updateTopicOptions('logSubject', 'logTopic');
    document.getElementById('logDate').value = todayStr();
    document.getElementById('logPlanned').value = 30;
    document.getElementById('logActual').value = 30;
    document.getElementById('logMethod').value = METHODS[0];
    document.getElementById('logConfidence').value = 3;
    document.getElementById('logFocus').value = 3;
    document.getElementById('logNotes').value = '';
    document.getElementById('logCompleted').checked = true;
  }
  modal.classList.remove('hidden');
}

function saveLogFromModal() {
  const id = document.getElementById('logId').value;
  const subjectId = document.getElementById('logSubject').value;
  if (!subjectId) { showToast('Please select a subject.', 'danger'); return; }
  const actualMinutes = parseInt(document.getElementById('logActual').value, 10) || 0;
  const data = {
    subjectId,
    topicId: document.getElementById('logTopic').value || null,
    date: document.getElementById('logDate').value,
    plannedMinutes: parseInt(document.getElementById('logPlanned').value, 10) || 0,
    actualMinutes,
    method: document.getElementById('logMethod').value,
    confidence: parseInt(document.getElementById('logConfidence').value, 10),
    focus: parseInt(document.getElementById('logFocus').value, 10),
    notes: document.getElementById('logNotes').value,
    completed: document.getElementById('logCompleted').checked,
    updatedAt: Date.now()
  };
  if (id) {
    const s = state.sessions.find(x => x.id === id);
    Object.assign(s, data);
    s.status = s.completed ? 'completed' : 'planned';
    showToast('Log entry updated.', 'success');
  } else {
    state.sessions.push({
      id: uid(), ...data, startTime: '00:00', finishTime: '00:00', priority: 'medium', difficulty: 'medium',
      status: data.completed ? 'completed' : 'planned', recurringGroupId: null,
      actualStart: new Date(data.date).toISOString(), actualFinish: new Date(data.date).toISOString(),
      pausedMinutes: 0, createdAt: Date.now()
    });
    showToast('Log entry added.', 'success');
  }
  persist();
  closeModal('logModal');
  renderAll();
}

function deleteLogEntry(id) {
  openConfirm('Delete this log entry?', 'This cannot be undone.', () => {
    state.sessions = state.sessions.filter(s => s.id !== id);
    persist();
    closeModal('logModal');
    renderAll();
    showToast('Log entry deleted.', 'danger');
  });
}

/* ---------------------------------------------------------------------
   10. SUBJECTS & TOPICS MANAGEMENT
   --------------------------------------------------------------------- */
function renderSubjectsManage() {
  const container = document.getElementById('subjectsList');
  document.getElementById('subjectsEmptyState').classList.toggle('hidden', state.subjects.length > 0);
  container.innerHTML = state.subjects.map(subj => {
    const stats = computeStats(state.sessions.filter(s => s.subjectId === subj.id));
    return `
    <div class="subject-manage-card" style="--subject-color:${subj.color}">
      <div class="subject-manage-top">
        <span class="subject-manage-title"><span class="dot" style="background:${subj.color}"></span>${escapeHtml(subj.name)}</span>
        <span class="muted small">${formatMinutes(stats.totalActual)} revised · target ${subj.targetHours}h</span>
        <div class="subject-manage-actions">
          <button class="btn btn-small" onclick="openTopicModal('${subj.id}')">+ Topic</button>
          <button class="btn btn-small" onclick="openSubjectModal('${subj.id}')">Edit</button>
        </div>
      </div>
      <div class="topic-list">
        ${subj.topics.length ? subj.topics.map(t => `
          <div class="topic-row ${t.completed ? 'completed' : ''}">
            <span class="topic-name">${escapeHtml(t.name)}</span>
            <div class="topic-row-actions">
              <button class="btn btn-small" onclick="toggleTopicCompleted('${subj.id}','${t.id}')">${t.completed ? 'Undo' : 'Done'}</button>
              <button class="btn btn-small" onclick="openTopicModal('${subj.id}','${t.id}')">Edit</button>
            </div>
          </div>`).join('') : '<div class="muted small">No topics yet.</div>'}
      </div>
    </div>`;
  }).join('');
}

function openSubjectModal(id) {
  document.getElementById('subjectId').value = id || '';
  document.getElementById('deleteSubjectBtn').classList.toggle('hidden', !id);
  document.getElementById('subjectModalTitle').textContent = id ? 'Edit Subject' : 'Add Subject';
  if (id) {
    const s = getSubject(id);
    document.getElementById('subjectName').value = s.name;
    document.getElementById('subjectColor').value = s.color;
    document.getElementById('subjectTarget').value = s.targetHours;
  } else {
    document.getElementById('subjectName').value = '';
    document.getElementById('subjectColor').value = DEFAULT_COLORS[state.subjects.length % DEFAULT_COLORS.length];
    document.getElementById('subjectTarget').value = 50;
  }
  document.getElementById('subjectModal').classList.remove('hidden');
}

function saveSubjectFromModal() {
  const id = document.getElementById('subjectId').value;
  const name = document.getElementById('subjectName').value.trim();
  if (!name) { showToast('Please enter a subject name.', 'danger'); return; }
  const color = document.getElementById('subjectColor').value;
  const targetHours = parseFloat(document.getElementById('subjectTarget').value) || 0;
  if (id) {
    const s = getSubject(id);
    s.name = name; s.color = color; s.targetHours = targetHours;
    showToast('Subject updated.', 'success');
  } else {
    state.subjects.push({ id: uid(), name, color, targetHours, topics: [] });
    showToast('Subject added.', 'success');
  }
  persist();
  closeModal('subjectModal');
  renderAll();
}

function deleteSubject(id) {
  openConfirm('Delete subject?', 'This will also delete all of its topics and revision sessions.', () => {
    state.subjects = state.subjects.filter(s => s.id !== id);
    state.sessions = state.sessions.filter(s => s.subjectId !== id);
    state.exams = state.exams.filter(e => e.subjectId !== id);
    persist();
    closeModal('subjectModal');
    renderAll();
    showToast('Subject deleted.', 'danger');
  });
}

function openTopicModal(subjectId, topicId) {
  document.getElementById('topicSubjectId').value = subjectId;
  document.getElementById('topicId').value = topicId || '';
  document.getElementById('deleteTopicBtn').classList.toggle('hidden', !topicId);
  document.getElementById('topicModalTitle').textContent = topicId ? 'Edit Topic' : 'Add Topic';
  if (topicId) {
    const t = getTopic(subjectId, topicId);
    document.getElementById('topicName').value = t.name;
    document.getElementById('topicCompleted').checked = t.completed;
  } else {
    document.getElementById('topicName').value = '';
    document.getElementById('topicCompleted').checked = false;
  }
  document.getElementById('topicModal').classList.remove('hidden');
}

function saveTopicFromModal() {
  const subjectId = document.getElementById('topicSubjectId').value;
  const topicId = document.getElementById('topicId').value;
  const name = document.getElementById('topicName').value.trim();
  if (!name) { showToast('Please enter a topic name.', 'danger'); return; }
  const subj = getSubject(subjectId);
  const completed = document.getElementById('topicCompleted').checked;
  if (topicId) {
    const t = getTopic(subjectId, topicId);
    t.name = name; t.completed = completed;
  } else {
    subj.topics.push({ id: uid(), name, completed });
  }
  persist();
  closeModal('topicModal');
  renderAll();
  showToast('Topic saved.', 'success');
}

function deleteTopic() {
  const subjectId = document.getElementById('topicSubjectId').value;
  const topicId = document.getElementById('topicId').value;
  openConfirm('Delete topic?', 'Sessions referencing this topic will keep their history but show as "General".', () => {
    const subj = getSubject(subjectId);
    subj.topics = subj.topics.filter(t => t.id !== topicId);
    persist();
    closeModal('topicModal');
    renderAll();
    showToast('Topic deleted.', 'danger');
  });
}

function toggleTopicCompleted(subjectId, topicId) {
  const t = getTopic(subjectId, topicId);
  if (!t) return;
  t.completed = !t.completed;
  persist();
  renderAll();
}

/* ---------------------------------------------------------------------
   11. EXAMS
   --------------------------------------------------------------------- */
function openExamModal(id) {
  document.getElementById('examId').value = id || '';
  document.getElementById('deleteExamBtn').classList.toggle('hidden', !id);
  if (id) {
    const e = state.exams.find(x => x.id === id);
    document.getElementById('examSubject').value = e.subjectId;
    document.getElementById('examName').value = e.name || '';
    document.getElementById('examDate').value = e.date;
  } else {
    document.getElementById('examSubject').value = state.subjects[0] ? state.subjects[0].id : '';
    document.getElementById('examName').value = '';
    document.getElementById('examDate').value = todayStr();
  }
  document.getElementById('examModal').classList.remove('hidden');
}

function saveExamFromModal() {
  const id = document.getElementById('examId').value;
  const subjectId = document.getElementById('examSubject').value;
  if (!subjectId) { showToast('Please select a subject.', 'danger'); return; }
  const data = { subjectId, name: document.getElementById('examName').value.trim(), date: document.getElementById('examDate').value };
  if (id) { Object.assign(state.exams.find(e => e.id === id), data); }
  else { state.exams.push({ id: uid(), ...data }); }
  persist();
  closeModal('examModal');
  renderAll();
  showToast('Exam saved.', 'success');
}

function deleteExam(id) {
  openConfirm('Delete exam?', 'This will remove the exam countdown.', () => {
    state.exams = state.exams.filter(e => e.id !== id);
    persist();
    closeModal('examModal');
    renderAll();
    showToast('Exam deleted.', 'danger');
  });
}

/* ---------------------------------------------------------------------
   12. STATISTICS TAB
   --------------------------------------------------------------------- */
function renderStats() {
  const allStats = computeStats(state.sessions);
  const streaks = computeStreaks();
  const completedSessions = state.sessions.filter(s => s.completed);
  const lengths = completedSessions.map(s => s.actualMinutes || 0);
  const avgLength = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const longest = lengths.length ? Math.max(...lengths) : 0;
  const totalPlannedAll = state.sessions.reduce((sum, s) => sum + (s.plannedMinutes || 0), 0);
  const completionPct = state.sessions.length ? Math.round((completedSessions.length / state.sessions.length) * 100) : 0;

  const bySubjectTotals = state.subjects.map(s => ({ s, minutes: (allStats.perSubject[s.id] || {}).actualMinutes || 0 }));
  const most = bySubjectTotals.slice().sort((a, b) => b.minutes - a.minutes)[0];
  const least = bySubjectTotals.slice().sort((a, b) => a.minutes - b.minutes)[0];

  const cards = [
    { label: 'Total Revision Hours', value: formatMinutes(allStats.totalActual) },
    { label: 'Average Session Length', value: formatMinutes(avgLength) },
    { label: 'Longest Session', value: formatMinutes(longest) },
    { label: 'Current Streak', value: streaks.current + ' days' },
    { label: 'Longest Streak', value: streaks.longest + ' days' },
    { label: 'Completion %', value: completionPct + '%' },
    { label: 'Most Revised Subject', value: most && most.minutes > 0 ? most.s.name : '—' },
    { label: 'Least Revised Subject', value: least ? least.s.name : '—' },
    { label: 'Planned vs Actual (all time)', value: `${formatMinutes(allStats.totalActual)} / ${formatMinutes(totalPlannedAll)}` }
  ];
  document.getElementById('statsGrid').innerHTML = cards.map(c => `
    <div class="stat-card"><div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div></div>
  `).join('');

  document.getElementById('statsSubjectBody').innerHTML = state.subjects.map(s => {
    const bucket = allStats.perSubject[s.id] || { actualMinutes: 0, completedCount: 0 };
    const targetMinutes = (s.targetHours || 0) * 60;
    const pct = targetMinutes ? Math.round((bucket.actualMinutes / targetMinutes) * 100) : 0;
    const avg = bucket.completedCount ? bucket.actualMinutes / bucket.completedCount : 0;
    return `<tr>
      <td><span class="dot" style="background:${s.color}"></span>${escapeHtml(s.name)}</td>
      <td>${(bucket.actualMinutes / 60).toFixed(1)}</td>
      <td>${s.targetHours}</td>
      <td>${pct}%</td>
      <td>${bucket.completedCount}</td>
      <td>${Math.round(avg)}</td>
    </tr>`;
  }).join('');
}

/* ---------------------------------------------------------------------
   13. TIMER
   --------------------------------------------------------------------- */
let currentTimerMode = 'stopwatch';
let timerLinkedSessionId = null;

function renderTimerTab() {
  const container = document.getElementById('timerTodaysSessions');
  const todays = state.sessions.filter(s => s.date === todayStr() && !s.completed).sort((a, b) => a.startTime.localeCompare(b.startTime));
  if (!todays.length) { container.innerHTML = '<div class="empty-state">No planned sessions for today. Add one in the Timetable tab, or just start a quick timer above.</div>'; }
  else {
    container.innerHTML = todays.map(s => `
      <div class="list-item">
        <span class="list-item-main"><span class="dot" style="background:${subjectColor(s.subjectId)}"></span>
          <strong>${escapeHtml(subjectName(s.subjectId))}</strong> — ${escapeHtml(topicLabel(s))}
          <span class="tag">${s.startTime}-${s.finishTime}</span>
        </span>
        <button class="btn btn-small" onclick="startTimerForSession('${s.id}')">Start Timer</button>
      </div>`).join('');
  }
  updateTimerButtons();
  renderTimerDisplay();
}

function startTimerForSession(sessionId) {
  const s = state.sessions.find(x => x.id === sessionId);
  if (!s) return;
  document.querySelector('.nav-item[data-tab="timer"]').click();
  document.getElementById('timerSubjectSelect').value = s.subjectId;
  updateTopicOptions('timerSubjectSelect', 'timerTopicSelect');
  document.getElementById('timerTopicSelect').value = s.topicId || '';
  timerLinkedSessionId = sessionId;
  showToast('Session linked. Press Start when ready.', 'success');
}

function setTimerMode(mode) {
  currentTimerMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.getElementById('countdownSetup').classList.toggle('hidden', mode !== 'countdown');
  document.getElementById('pomodoroSetup').classList.toggle('hidden', mode !== 'pomodoro');
  document.getElementById('pomodoroPhaseLabel').classList.toggle('hidden', mode !== 'pomodoro');
}

function timerStart() {
  if (timer && timer.active) return;
  const subjectId = document.getElementById('timerSubjectSelect').value;
  if (!subjectId) { showToast('Please choose a subject first.', 'danger'); return; }
  const topicId = document.getElementById('timerTopicSelect').value || null;
  const topicCustom = document.getElementById('timerCustomTopic').value.trim();
  const workMin = parseInt(document.getElementById('pomodoroWork').value, 10) || 25;
  const breakMin = parseInt(document.getElementById('pomodoroBreak').value, 10) || 5;
  const countdownMin = parseInt(document.getElementById('countdownMinutes').value, 10) || 25;

  timer = {
    active: true, mode: currentTimerMode, running: true, paused: false,
    elapsedMs: 0, workMs: 0, phase: 'work',
    countdownTargetMin: countdownMin, pomodoroWorkMin: workMin, pomodoroBreakMin: breakMin,
    remainingMs: currentTimerMode === 'countdown' ? countdownMin * 60000 : workMin * 60000,
    lastTickEpoch: Date.now(),
    linkedSessionId: timerLinkedSessionId, subjectId, topicId, topicCustom,
    actualStartISO: new Date().toISOString()
  };
  saveTimer();
  updateTimerButtons();
  renderTimerDisplay();
}

function timerPause() {
  if (!timer || !timer.active || timer.paused) return;
  timer.paused = true;
  saveTimer();
  updateTimerButtons();
}
function timerResume() {
  if (!timer || !timer.active || !timer.paused) return;
  timer.paused = false;
  timer.lastTickEpoch = Date.now();
  saveTimer();
  updateTimerButtons();
}
function timerStop() {
  if (!timer || !timer.active) return;
  openConfirm('Discard this timer session?', 'Time recorded so far will be lost. Use "Finish Session" instead if you want to save it.', () => {
    timer = null;
    saveTimer();
    timerLinkedSessionId = null;
    updateTimerButtons();
    renderTimerDisplay();
    showToast('Timer discarded.', 'danger');
  });
}

function timerFinish() {
  if (!timer || !timer.active) return;
  document.getElementById('finishConfidence').value = 3;
  document.getElementById('finishFocus').value = 3;
  document.getElementById('finishNotes').value = '';
  document.getElementById('finishModal').classList.remove('hidden');
}

function confirmFinish() {
  const confidence = parseInt(document.getElementById('finishConfidence').value, 10);
  const focus = parseInt(document.getElementById('finishFocus').value, 10);
  const notes = document.getElementById('finishNotes').value;

  const activeMinutes = Math.round((timer.mode === 'pomodoro' ? timer.workMs : timer.elapsedMs) / 60000);
  const now = new Date().toISOString();

  if (timer.linkedSessionId) {
    const s = state.sessions.find(x => x.id === timer.linkedSessionId);
    if (s) {
      s.completed = true; s.status = 'completed';
      s.actualStart = timer.actualStartISO; s.actualFinish = now;
      s.actualMinutes = activeMinutes;
      s.confidence = confidence; s.focus = focus;
      if (notes) s.notes = (s.notes ? s.notes + ' | ' : '') + notes;
      s.updatedAt = Date.now();
    }
  } else {
    const subj = getSubject(timer.subjectId);
    state.sessions.push({
      id: uid(), subjectId: timer.subjectId, topicId: timer.topicId,
      topicCustom: timer.topicCustom || '', date: formatDate(new Date(timer.actualStartISO)),
      startTime: new Date(timer.actualStartISO).toTimeString().slice(0, 5),
      finishTime: new Date().toTimeString().slice(0, 5),
      plannedMinutes: activeMinutes, priority: 'medium', difficulty: 'medium',
      method: 'Active Recall', notes, completed: true, status: 'completed', recurringGroupId: null,
      actualStart: timer.actualStartISO, actualFinish: now, actualMinutes: activeMinutes,
      pausedMinutes: 0, confidence, focus, createdAt: Date.now(), updatedAt: Date.now()
    });
  }
  persist();
  timer = null;
  saveTimer();
  timerLinkedSessionId = null;
  closeModal('finishModal');
  updateTimerButtons();
  renderAll();
  showToast(`Session saved — ${activeMinutes} minutes logged.`, 'success');
}

function updateTimerButtons() {
  const active = !!(timer && timer.active);
  const paused = active && timer.paused;
  document.getElementById('timerStartBtn').disabled = active;
  document.getElementById('timerPauseBtn').disabled = !active || paused;
  document.getElementById('timerPauseBtn').classList.toggle('hidden', paused);
  document.getElementById('timerResumeBtn').classList.toggle('hidden', !paused);
  document.getElementById('timerStopBtn').disabled = !active;
  document.getElementById('timerFinishBtn').disabled = !active;
  document.getElementById('timerSubjectSelect').disabled = active;
  document.getElementById('timerTopicSelect').disabled = active;
  document.querySelectorAll('.mode-btn').forEach(b => b.disabled = active);
  document.getElementById('countdownMinutes').disabled = active;
  document.getElementById('pomodoroWork').disabled = active;
  document.getElementById('pomodoroBreak').disabled = active;
}

function renderTimerDisplay() {
  const display = document.getElementById('timerDisplay');
  const subLabel = document.getElementById('timerSubLabel');
  const phaseLabel = document.getElementById('pomodoroPhaseLabel');
  if (!timer || !timer.active) {
    display.textContent = '00:00:00';
    subLabel.textContent = 'Not started';
    phaseLabel.classList.add('hidden');
    return;
  }
  if (timer.mode === 'stopwatch') {
    display.textContent = formatHMS(timer.elapsedMs);
  } else if (timer.mode === 'countdown') {
    display.textContent = formatHMS(timer.remainingMs);
  } else if (timer.mode === 'pomodoro') {
    display.textContent = formatHMS(timer.remainingMs);
    phaseLabel.classList.remove('hidden');
    phaseLabel.textContent = timer.phase === 'work' ? 'Focus Time' : 'Break Time';
  }
  subLabel.textContent = timer.paused ? 'Paused' : 'Running — ' + subjectName(timer.subjectId);
}

// Global 1-second tick, applied whenever the timer is active & running.
function applyTimerDelta(deltaMs) {
  timer.elapsedMs += deltaMs;
  if (timer.mode === 'countdown') {
    timer.remainingMs = Math.max(0, timer.countdownTargetMin * 60000 - timer.elapsedMs);
    if (timer.remainingMs === 0) showToastOnce('Countdown finished — press Finish Session to log it.');
  } else if (timer.mode === 'pomodoro') {
    if (timer.phase === 'work') timer.workMs += deltaMs;
    timer.remainingMs -= deltaMs;
    if (timer.remainingMs <= 0) {
      timer.phase = timer.phase === 'work' ? 'break' : 'work';
      timer.remainingMs = (timer.phase === 'work' ? timer.pomodoroWorkMin : timer.pomodoroBreakMin) * 60000;
      showToastOnce(timer.phase === 'work' ? 'Break over — back to focus!' : 'Nice work — take a break!');
    }
  }
}
let lastToastMsg = '', lastToastTime = 0;
function showToastOnce(msg) {
  if (msg === lastToastMsg && Date.now() - lastToastTime < 4000) return;
  lastToastMsg = msg; lastToastTime = Date.now();
  showToast(msg, 'success');
}

function timerTick() {
  if (timer && timer.active && timer.running && !timer.paused) {
    const now = Date.now();
    const delta = now - timer.lastTickEpoch;
    timer.lastTickEpoch = now;
    applyTimerDelta(delta);
    saveTimer();
  }
  renderTimerDisplay();
}

/* ---------------------------------------------------------------------
   14. IMPORT / EXPORT / BACKUP
   --------------------------------------------------------------------- */
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function exportJSON() {
  downloadBlob(JSON.stringify(state, null, 2), `a-level-revision-backup-${todayStr()}.json`, 'application/json');
  showToast('Backup exported.', 'success');
}

function csvEscape(val) {
  const s = String(val === undefined || val === null ? '' : val);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportSessionsCSV() {
  const header = ['Date', 'Subject', 'Topic', 'Start', 'Finish', 'Planned (min)', 'Actual (min)', 'Priority', 'Difficulty', 'Method', 'Completed', 'Confidence', 'Focus', 'Notes'];
  const rows = state.sessions.map(s => [s.date, subjectName(s.subjectId), topicLabel(s), s.startTime, s.finishTime, s.plannedMinutes, s.actualMinutes, s.priority, s.difficulty, s.method, s.completed ? 'Yes' : 'No', s.confidence || '', s.focus || '', s.notes || '']);
  const csv = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
  downloadBlob(csv, `revision-sessions-${todayStr()}.csv`, 'text/csv');
  showToast('Sessions exported as CSV.', 'success');
}
function exportLogCSV() { exportSessionsCSV(); } // log entries and sessions are the same records

function importJSONFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.subjects || !parsed.sessions) throw new Error('File is missing required data.');
      openConfirm('Import backup?', 'This will replace all current data with the contents of the selected file.', () => {
        localStorage.setItem(BACKUP_KEY, JSON.stringify({ timestamp: Date.now(), data: state }));
        state = parsed;
        if (!state.exams) state.exams = [];
        if (!state.settings) state.settings = { darkMode: false, weekStartsOn: 'monday' };
        persist(true);
        applyDarkMode();
        renderAll();
        showToast('Backup imported successfully.', 'success');
      });
    } catch (e) {
      showToast('Could not import file: ' + e.message, 'danger');
    }
  };
  reader.readAsText(file);
}

function restoreAutoBackup() {
  const raw = localStorage.getItem(BACKUP_KEY);
  if (!raw) { showToast('No auto-backup available yet.', 'danger'); return; }
  const parsed = JSON.parse(raw);
  openConfirm('Restore auto-backup?', `This will replace your current data with the backup from ${new Date(parsed.timestamp).toLocaleString()}.`, () => {
    state = parsed.data;
    persist();
    applyDarkMode();
    renderAll();
    showToast('Auto-backup restored.', 'success');
  });
}

function clearAllData() {
  openConfirm('Clear all data?', 'This will delete every subject, session and exam. This cannot be undone (though your last auto-backup will still be recoverable).', () => {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ timestamp: Date.now(), data: state }));
    state = defaultState();
    persist(true);
    renderAll();
    showToast('All data cleared.', 'danger');
  });
}

/* ---------------------------------------------------------------------
   15. MODALS, DARK MODE, NAVIGATION, SHORTCUTS
   --------------------------------------------------------------------- */
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function closeAllModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden')); }

function applyDarkMode() {
  const dark = state.settings.darkMode;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.getElementById('darkModeCheckbox').checked = dark;
}
function toggleDarkMode() {
  state.settings.darkMode = !state.settings.darkMode;
  persist();
  applyDarkMode();
}

function switchTab(tabName) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tabName));
  document.getElementById('mainNav').classList.remove('open');
  document.getElementById('navOverlay').classList.remove('open');
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.getElementById('weekView').classList.toggle('hidden', view !== 'week');
  document.getElementById('monthView').classList.toggle('hidden', view !== 'month');
  document.getElementById('dayView').classList.toggle('hidden', view !== 'day');
  renderTimetable();
}

/* ---------------------------------------------------------------------
   16. EVENT BINDING & INIT
   --------------------------------------------------------------------- */
function bindEvents() {
  // Navigation
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  document.getElementById('navToggleBtn').addEventListener('click', () => {
    document.getElementById('mainNav').classList.toggle('open');
    document.getElementById('navOverlay').classList.toggle('open');
  });
  document.getElementById('navOverlay').addEventListener('click', () => {
    document.getElementById('mainNav').classList.remove('open');
    document.getElementById('navOverlay').classList.remove('open');
  });
  document.getElementById('darkModeBtn').addEventListener('click', toggleDarkMode);
  document.getElementById('darkModeCheckbox').addEventListener('change', toggleDarkMode);
  document.getElementById('quickTimerBtn').addEventListener('click', () => switchTab('timer'));
  document.getElementById('weekStartSelect').addEventListener('change', (e) => {
    state.settings.weekStartsOn = e.target.value; persist(); renderAll();
  });

  // Modal close (backdrop + X buttons)
  document.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
  });
  document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));

  // Dashboard filters
  document.getElementById('dashFilterRange').addEventListener('change', (e) => {
    const isCustom = e.target.value === 'custom';
    document.getElementById('dashFromDate').classList.toggle('hidden-input', !isCustom);
    document.getElementById('dashToDate').classList.toggle('hidden-input', !isCustom);
    document.getElementById('dashToLabel').classList.toggle('hidden-input', !isCustom);
    renderDashboard();
  });
  document.getElementById('dashFromDate').addEventListener('change', renderDashboard);
  document.getElementById('dashToDate').addEventListener('change', renderDashboard);
  document.getElementById('addExamBtn').addEventListener('click', () => openExamModal(null));

  // Timetable
  document.querySelectorAll('.view-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  document.getElementById('prevPeriod').addEventListener('click', () => changePeriod(-1));
  document.getElementById('nextPeriod').addEventListener('click', () => changePeriod(1));
  document.getElementById('todayBtn').addEventListener('click', () => { cursorDate = new Date(); renderTimetable(); });
  document.getElementById('addSessionBtn').addEventListener('click', () => openSessionModal(null));
  document.getElementById('printBtn').addEventListener('click', () => window.print());
  ['filterSubject', 'filterCompleted', 'filterPriority', 'filterMethod'].forEach(id => document.getElementById(id).addEventListener('change', renderTimetable));
  document.getElementById('filterSearch').addEventListener('input', renderTimetable);

  // Session modal
  document.getElementById('sessionSubject').addEventListener('change', () => updateTopicOptions('sessionSubject', 'sessionTopic'));
  document.getElementById('sessionRecur').addEventListener('change', (e) => {
    document.getElementById('sessionRecurCountWrap').classList.toggle('hidden-input', e.target.value === 'none');
  });
  document.getElementById('saveSessionBtn').addEventListener('click', saveSessionFromModal);
  document.getElementById('deleteSessionBtn').addEventListener('click', () => deleteSession(document.getElementById('sessionId').value));
  document.getElementById('duplicateSessionBtn').addEventListener('click', () => duplicateSession(document.getElementById('sessionId').value));

  // Study log
  document.getElementById('addLogBtn').addEventListener('click', () => openLogModal(null));
  document.getElementById('logSubject').addEventListener('change', () => updateTopicOptions('logSubject', 'logTopic'));
  document.getElementById('saveLogBtn').addEventListener('click', saveLogFromModal);
  document.getElementById('deleteLogBtn').addEventListener('click', () => deleteLogEntry(document.getElementById('logId').value));
  ['logFilterSubject', 'logFilterCompleted', 'logFilterPriority', 'logFilterMethod', 'logFilterDate'].forEach(id => document.getElementById(id).addEventListener('change', renderLog));
  document.getElementById('logSearch').addEventListener('input', renderLog);

  // Subjects & topics
  document.getElementById('addSubjectBtn').addEventListener('click', () => openSubjectModal(null));
  document.getElementById('saveSubjectBtn').addEventListener('click', saveSubjectFromModal);
  document.getElementById('deleteSubjectBtn').addEventListener('click', () => deleteSubject(document.getElementById('subjectId').value));
  document.getElementById('saveTopicBtn').addEventListener('click', saveTopicFromModal);
  document.getElementById('deleteTopicBtn').addEventListener('click', deleteTopic);

  // Exams
  document.getElementById('saveExamBtn').addEventListener('click', saveExamFromModal);
  document.getElementById('deleteExamBtn').addEventListener('click', () => deleteExam(document.getElementById('examId').value));

  // Timer
  document.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click', () => setTimerMode(btn.dataset.mode)));
  document.getElementById('timerStartBtn').addEventListener('click', timerStart);
  document.getElementById('timerPauseBtn').addEventListener('click', timerPause);
  document.getElementById('timerResumeBtn').addEventListener('click', timerResume);
  document.getElementById('timerStopBtn').addEventListener('click', timerStop);
  document.getElementById('timerFinishBtn').addEventListener('click', timerFinish);
  document.getElementById('confirmFinishBtn').addEventListener('click', confirmFinish);
  document.getElementById('timerSubjectSelect').addEventListener('change', () => { updateTopicOptions('timerSubjectSelect', 'timerTopicSelect'); timerLinkedSessionId = null; });

  // Data & settings
  document.getElementById('exportJsonBtn').addEventListener('click', exportJSON);
  document.getElementById('exportCsvSessionsBtn').addEventListener('click', exportSessionsCSV);
  document.getElementById('exportCsvLogBtn').addEventListener('click', exportLogCSV);
  document.getElementById('importFileInput').addEventListener('change', (e) => { if (e.target.files[0]) importJSONFile(e.target.files[0]); e.target.value = ''; });
  document.getElementById('restoreAutoBackupBtn').addEventListener('click', restoreAutoBackup);
  document.getElementById('clearAllDataBtn').addEventListener('click', clearAllData);

  // Generic confirm dialog
  document.getElementById('confirmOkBtn').addEventListener('click', () => {
    const action = pendingConfirmAction;
    pendingConfirmAction = null;
    document.getElementById('confirmModal').classList.add('hidden');
    if (action) action();
  });
  document.getElementById('confirmCancelBtn').addEventListener('click', () => {
    pendingConfirmAction = null;
    document.getElementById('confirmModal').classList.add('hidden');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (e.key === 'Escape') { closeAllModals(); return; }
    if (typing) return;
    if (e.key === '/') { e.preventDefault(); (document.querySelector('.tab-panel.active #filterSearch, .tab-panel.active #logSearch') || {}).focus?.(); return; }
    switch (e.key.toLowerCase()) {
      case 'd': switchTab('dashboard'); break;
      case 'w': switchTab('timetable'); break;
      case 't': switchTab('timer'); break;
      case 'l': switchTab('log'); break;
      case 'n': if (document.getElementById('tab-timetable').classList.contains('active')) openSessionModal(null); break;
      case 'm': toggleDarkMode(); break;
    }
  });
}

function init() {
  loadState();
  loadTimer();
  applyDarkMode();
  document.getElementById('weekStartSelect').value = state.settings.weekStartsOn;
  bindEvents();
  renderAll();
  updateTimerButtons();
  renderTimerDisplay();
  timerIntervalHandle = setInterval(timerTick, 1000);
}

document.addEventListener('DOMContentLoaded', init);
