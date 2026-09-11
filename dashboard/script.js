// ===== Supabase Client (no build step, CDN-loaded) =====
const SUPABASE_URL = 'https://jrrbtcsmhrozyvdekycp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_BOR8BVBNti5UZXzhEIhb7Q_nEOXEaGM';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// ===== State =====
const state = {
  weightEntries: [],
  workouts: [],
  exercises: [],
  moodEntries: [],
  habits: [],
  habitCompletions: [],
  charts: {},
  exerciseCounter: 0,
};

// ===== Utilities =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const todayStr = () => new Date().toISOString().split('T')[0];
const fmtDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtShortDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

function toast(msg, type) {
  type = type || '';
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(function () { el.classList.remove('show'); }, 3000);
}

function showLoading(show) {
  $('#loading-overlay').classList.toggle('show', show);
}

function getLast30Days() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function calculateStreak(dates) {
  if (!dates.length) return 0;
  const set = new Set(dates);
  let streak = 0;
  const d = new Date();
  if (!set.has(d.toISOString().split('T')[0])) {
    d.setDate(d.getDate() - 1);
  }
  while (set.has(d.toISOString().split('T')[0])) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function habitStreak(habitId) {
  const completions = state.habitCompletions
    .filter(function (c) { return c.habit_id === habitId && c.completed; })
    .map(function (c) { return c.date; })
    .sort();
  return calculateStreak(completions);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Navigation =====
function setupNavigation() {
  $$('.nav-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const view = btn.dataset.view;
      $$('.nav-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      $$('.view').forEach(function (v) { v.classList.remove('active'); });
      $('#view-' + view).classList.add('active');
      $('#sidebar').classList.remove('open');
      if (view === 'charts') renderAllCharts();
      if (view === 'dashboard') renderDashboard();
    });
  });

  $('#menu-toggle').addEventListener('click', function () {
    $('#sidebar').classList.toggle('open');
  });
}

// ===== Data Loading =====
async function loadAllData() {
  showLoading(true);
  try {
    const results = await Promise.all([
      supabase.from('weight_entries').select('*').order('date', { ascending: false }),
      supabase.from('workouts').select('*').order('date', { ascending: false }),
      supabase.from('exercises').select('*'),
      supabase.from('mood_entries').select('*').order('date', { ascending: false }),
      supabase.from('habits').select('*').order('created_at', { ascending: true }),
      supabase.from('habit_completions').select('*').order('date', { ascending: false }),
    ]);

    state.weightEntries = results[0].data || [];
    state.workouts = results[1].data || [];
    state.exercises = results[2].data || [];
    state.moodEntries = results[3].data || [];
    state.habits = results[4].data || [];
    state.habitCompletions = results[5].data || [];
  } catch (err) {
    toast('Failed to load data', 'error');
    console.error(err);
  }
  showLoading(false);
}

// ===== Weight =====
function setupWeightForm() {
  $('#weight-date').value = todayStr();
  $('#weight-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const date = $('#weight-date').value;
    const weight_kg = parseFloat($('#weight-value').value);
    const note = $('#weight-note').value.trim();
    if (!date || !weight_kg) return;

    try {
      const existing = state.weightEntries.find(function (w) { return w.date === date; });
      let result;
      if (existing) {
        result = await supabase.from('weight_entries').update({ weight_kg: weight_kg, note: note }).eq('id', existing.id);
      } else {
        result = await supabase.from('weight_entries').insert({ date: date, weight_kg: weight_kg, note: note });
      }
      if (result.error) throw result.error;
      toast('Weight saved!', 'success');
      $('#weight-value').value = '';
      $('#weight-note').value = '';
      await loadAllData();
      renderWeightView();
      renderDashboard();
    } catch (err) {
      toast('Failed to save weight', 'error');
      console.error(err);
    }
  });
}

function renderWeightView() {
  const list = $('#weight-list');
  if (!state.weightEntries.length) {
    list.innerHTML = '<div class="empty-state">No weight entries yet. Start tracking today!</div>';
  } else {
    list.innerHTML = state.weightEntries.map(function (w) {
      return '<div class="entry-item">' +
        '<div class="entry-item-left">' +
        '<span class="entry-date">' + fmtShortDate(w.date) + '</span>' +
        '<span class="entry-main">' + w.weight_kg + ' kg</span>' +
        (w.note ? '<span class="entry-note">' + escapeHtml(w.note) + '</span>' : '') +
        '</div>' +
        '<button class="entry-delete" data-weight-id="' + w.id + '" aria-label="Delete">✕</button>' +
        '</div>';
    }).join('');
    list.querySelectorAll('.entry-delete').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.dataset.weightId;
        try {
          await supabase.from('weight_entries').delete().eq('id', id);
          toast('Weight entry deleted', 'success');
          await loadAllData();
          renderWeightView();
          renderDashboard();
        } catch (err) {
          toast('Failed to delete', 'error');
        }
      });
    });
  }
  renderWeightChart('weight-chart');
}

function renderWeightChart(canvasId) {
  const canvas = $('#' + canvasId);
  if (!canvas) return;
  const sorted = state.weightEntries.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
  const labels = sorted.map(function (w) { return fmtShortDate(w.date); });
  const data = sorted.map(function (w) { return w.weight_kg; });

  if (state.charts[canvasId]) state.charts[canvasId].destroy();
  if (!data.length) {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  state.charts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Weight (kg)',
        data: data,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: '#3b82f6',
      }],
    },
    options: chartOptions('Weight (kg)'),
  });
}

// ===== Workouts =====
var WORKOUT_DRAFT_KEY = 'fittrack_workout_draft';
var WORKOUT_QUEUE_KEY = 'fittrack_workout_queue';

function readDraft() {
  try { return JSON.parse(localStorage.getItem(WORKOUT_DRAFT_KEY) || 'null'); }
  catch (err) { return null; }
}
function writeDraft(draft) {
  try { localStorage.setItem(WORKOUT_DRAFT_KEY, JSON.stringify(draft)); }
  catch (err) { console.warn('Could not save draft locally', err); }
}
function clearDraft() {
  try { localStorage.removeItem(WORKOUT_DRAFT_KEY); }
  catch (err) {}
}

function readQueue() {
  try { return JSON.parse(localStorage.getItem(WORKOUT_QUEUE_KEY) || '[]'); }
  catch (err) { return []; }
}
function writeQueue(queue) {
  try { localStorage.setItem(WORKOUT_QUEUE_KEY, JSON.stringify(queue)); }
  catch (err) { console.warn('Could not save sync queue locally', err); }
}

// Reads the current form + exercise rows into a plain object.
function collectWorkoutFormData() {
  const date = $('#workout-date').value;
  const name = $('#workout-name').value;
  const duration_min = $('#workout-duration').value;

  const exercises = Array.from($$('.exercise-row')).map(function (row) {
    const exName = row.querySelector('.ex-name input').value;
    const sets = Array.from(row.querySelectorAll('.set-row')).map(function (setRow) {
      const inputs = setRow.querySelectorAll('input');
      return { reps: inputs[0].value, weight_kg: inputs[1].value };
    });
    return { name: exName, sets: sets };
  });

  return { date: date, name: name, duration_min: duration_min, exercises: exercises };
}

// Rebuilds the form + exercise rows from a saved draft object.
function applyWorkoutFormData(draft) {
  if (!draft) return;
  $('#workout-date').value = draft.date || todayStr();
  $('#workout-name').value = draft.name || '';
  $('#workout-duration').value = draft.duration_min || '';
  $('#exercise-list').innerHTML = '';
  state.exerciseCounter = 0;
  if (draft.exercises && draft.exercises.length) {
    draft.exercises.forEach(function (ex) {
      addExerciseRow(ex.name, ex.sets);
    });
  } else {
    addExerciseRow();
  }
}

var draftSaveTimer = null;
function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(function () {
    writeDraft(collectWorkoutFormData());
  }, 400);
}

function renderSyncBadge() {
  const existing = document.getElementById('sync-badge');
  if (existing) existing.remove();
  const queue = readQueue();
  if (!queue.length) return;
  const header = document.querySelector('#view-workouts .page-header');
  if (!header) return;
  const badge = document.createElement('div');
  badge.id = 'sync-badge';
  badge.className = 'sync-badge';
  badge.innerHTML =
    '⏳ ' + queue.length + ' workout' + (queue.length === 1 ? '' : 's') + ' saved locally, not yet synced' +
    ' <button type="button" id="retry-sync-btn">Retry now</button>';
  header.insertAdjacentElement('afterend', badge);
  document.getElementById('retry-sync-btn').addEventListener('click', flushWorkoutQueue);
}

// Attempts to push any queued (previously failed) workouts to Supabase.
async function flushWorkoutQueue() {
  let queue = readQueue();
  if (!queue.length) return;
  const remaining = [];
  for (const entry of queue) {
    try {
      await pushWorkoutToServer(entry);
    } catch (err) {
      remaining.push(entry);
    }
  }
  writeQueue(remaining);
  renderSyncBadge();
  if (remaining.length < queue.length) {
    toast('Synced ' + (queue.length - remaining.length) + ' saved workout' + (queue.length - remaining.length === 1 ? '' : 's'), 'success');
    await loadAllData();
    renderWorkoutView();
    renderDashboard();
  }
}

// Sends one workout payload (date/name/duration + exercises with set_details) to Supabase.
// Throws if the network/insert fails, so callers can decide to queue it.
async function pushWorkoutToServer(payload) {
  const workoutResult = await supabase
    .from('workouts')
    .insert({ date: payload.date, name: payload.name, duration_min: payload.duration_min })
    .select()
    .single();
  if (workoutResult.error) throw workoutResult.error;
  const workout = workoutResult.data;

  if (payload.exercises.length) {
    const exData = payload.exercises.map(function (ex) {
      return {
        workout_id: workout.id,
        name: ex.name,
        sets: ex.set_details.length,
        reps: ex.set_details[0] ? ex.set_details[0].reps : 0,
        weight_kg: ex.set_details[0] ? ex.set_details[0].weight_kg : null,
        set_details: ex.set_details,
      };
    });
    const exResult = await supabase.from('exercises').insert(exData);
    if (exResult.error) throw exResult.error;
  }
}

function setupWorkoutForm() {
  const draft = readDraft();
  if (draft && (draft.name || (draft.exercises && draft.exercises.some(function (e) { return e.name; })))) {
    applyWorkoutFormData(draft);
    toast('Restored your unsaved workout draft', '');
  } else {
    $('#workout-date').value = todayStr();
    addExerciseRow();
  }

  $('#workout-form').addEventListener('input', scheduleDraftSave);

  $('#add-exercise-btn').addEventListener('click', function () { addExerciseRow(); scheduleDraftSave(); });

  $('#workout-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const raw = collectWorkoutFormData();
    const date = raw.date;
    const name = raw.name.trim();
    const duration_min = parseInt(raw.duration_min) || null;
    if (!date || !name) return;

    const exercises = [];
    raw.exercises.forEach(function (ex) {
      const exName = ex.name.trim();
      const setDetails = ex.sets
        .map(function (s) { return { reps: parseInt(s.reps) || 0, weight_kg: s.weight_kg !== '' ? parseFloat(s.weight_kg) : null }; })
        .filter(function (s) { return s.reps > 0; });
      if (exName && setDetails.length) {
        exercises.push({ name: exName, set_details: setDetails });
      }
    });

    const payload = { date: date, name: name, duration_min: duration_min, exercises: exercises };

    try {
      await pushWorkoutToServer(payload);
      toast('Workout saved!', 'success');
      clearDraft();
      $('#workout-name').value = '';
      $('#workout-duration').value = '';
      $('#exercise-list').innerHTML = '';
      state.exerciseCounter = 0;
      addExerciseRow();
      await loadAllData();
      renderWorkoutView();
      renderDashboard();
    } catch (err) {
      console.error(err);
      // Couldn't reach the server — keep it safe locally and let the
      // person keep going instead of losing what they just logged.
      const queue = readQueue();
      queue.push(payload);
      writeQueue(queue);
      clearDraft();
      renderSyncBadge();
      toast('Offline or save failed — kept locally, will retry', 'error');
      $('#workout-name').value = '';
      $('#workout-duration').value = '';
      $('#exercise-list').innerHTML = '';
      state.exerciseCounter = 0;
      addExerciseRow();
    }
  });

  window.addEventListener('online', flushWorkoutQueue);
  renderSyncBadge();
  flushWorkoutQueue();
}

// `sets` here is an array of { reps, weight_kg } — one row per set.
function addExerciseRow(name, sets) {
  name = name || '';
  sets = (sets && sets.length) ? sets : [{ reps: '', weight_kg: '' }];
  state.exerciseCounter++;
  const row = document.createElement('div');
  row.className = 'exercise-row';
  row.innerHTML =
    '<div class="exercise-row-top">' +
      '<label class="ex-name">Exercise' +
        '<input type="text" value="' + escapeHtml(name) + '" placeholder="Bench Press" />' +
      '</label>' +
      '<button type="button" class="remove-exercise" aria-label="Remove exercise">✕</button>' +
    '</div>' +
    '<div class="set-rows"></div>' +
    '<button type="button" class="add-set-btn">+ Add set</button>';

  const setRowsEl = row.querySelector('.set-rows');
  function addSetRow(reps, weight) {
    const setRow = document.createElement('div');
    setRow.className = 'set-row';
    const setNum = setRowsEl.children.length + 1;
    setRow.innerHTML =
      '<span class="set-label">Set ' + setNum + '</span>' +
      '<label>Reps<input type="number" value="' + (reps || '') + '" min="0" placeholder="10" /></label>' +
      '<label>Weight (kg)<input type="number" value="' + (weight || '') + '" step="0.5" min="0" placeholder="60" /></label>' +
      '<button type="button" class="remove-set" aria-label="Remove set">✕</button>';
    setRow.querySelector('.remove-set').addEventListener('click', function () {
      setRow.remove();
      renumberSetRows(setRowsEl);
      scheduleDraftSave();
    });
    setRowsEl.appendChild(setRow);
  }

  sets.forEach(function (s) { addSetRow(s.reps, s.weight_kg); });

  row.querySelector('.add-set-btn').addEventListener('click', function () {
    addSetRow();
    scheduleDraftSave();
  });

  row.querySelector('.remove-exercise').addEventListener('click', function () {
    row.remove();
    if ($$('.exercise-row').length === 0) addExerciseRow();
    scheduleDraftSave();
  });

  $('#exercise-list').appendChild(row);
}

function renumberSetRows(setRowsEl) {
  Array.from(setRowsEl.querySelectorAll('.set-row')).forEach(function (setRow, i) {
    setRow.querySelector('.set-label').textContent = 'Set ' + (i + 1);
  });
}

function renderWorkoutView() {
  const workoutDates = state.workouts.map(function (w) { return w.date; });
  const streak = calculateStreak(workoutDates);
  $('#workout-streak-display').textContent = streak + ' day' + (streak !== 1 ? 's' : '');
  $('#total-workouts').textContent = state.workouts.length;


  const list = $('#workout-list');
  if (!state.workouts.length) {
    list.innerHTML = '<div class="empty-state">No workouts logged yet. Time to get moving!</div>';
    return;
  }

  list.innerHTML = state.workouts.map(function (w) {
    const exercises = state.exercises.filter(function (e) { return e.workout_id === w.id; });
    const exHtml = exercises.map(function (ex) {
      if (ex.set_details && ex.set_details.length) {
        const setsStr = ex.set_details.map(function (s, i) {
          return (i + 1) + ') ' + s.reps + (s.weight_kg ? '×' + s.weight_kg + 'kg' : ' reps');
        }).join(', ');
        return '<div class="exercise-detail">' + escapeHtml(ex.name) + ' — ' + setsStr + '</div>';
      }
      return '<div class="exercise-detail">' + escapeHtml(ex.name) + ' — ' + ex.sets + '×' + ex.reps +
        (ex.weight_kg ? ' @ ' + ex.weight_kg + 'kg' : '') + '</div>';
    }).join('');
    return '<div class="workout-entry">' +
      '<div class="workout-entry-header">' +
        '<span class="workout-entry-title">' + escapeHtml(w.name) + '</span>' +
        '<div>' +
          '<span class="workout-entry-meta">' + fmtDate(w.date) + '</span>' +
          (w.duration_min ? '<span class="workout-entry-meta"> · ' + w.duration_min + ' min</span>' : '') +
          '<button class="entry-delete" data-workout-id="' + w.id + '" style="margin-left:8px">✕</button>' +
        '</div>' +
      '</div>' +
      (exHtml ? '<div class="workout-exercises">' + exHtml + '</div>' : '') +
    '</div>';
  }).join('');

  list.querySelectorAll('.entry-delete').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const id = btn.dataset.workoutId;
      try {
        await supabase.from('workouts').delete().eq('id', id);
        toast('Workout deleted', 'success');
        await loadAllData();
        renderWorkoutView();
        renderDashboard();
      } catch (err) {
        toast('Failed to delete', 'error');
      }
    });
  });
}

// ===== Mood =====
const moodEmojis = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };
const moodLabels = { 1: 'Awful', 2: 'Bad', 3: 'Okay', 4: 'Good', 5: 'Great' };

function setupMoodForm() {
  $('#mood-date').value = todayStr();
  $('#mood-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const date = $('#mood-date').value;
    const moodEl = $('input[name="mood-value"]:checked');
    const mood = moodEl ? parseInt(moodEl.value) : null;
    const note = $('#mood-note').value.trim();
    if (!date || !mood) {
      toast('Please select a mood', 'error');
      return;
    }

    try {
      const existing = state.moodEntries.find(function (m) { return m.date === date; });
      let result;
      if (existing) {
        result = await supabase.from('mood_entries').update({ mood: mood, note: note }).eq('id', existing.id);
      } else {
        result = await supabase.from('mood_entries').insert({ date: date, mood: mood, note: note });
      }
      if (result.error) throw result.error;
      toast('Mood saved!', 'success');
      $('#mood-note').value = '';
      $$('input[name="mood-value"]').forEach(function (r) { r.checked = false; });
      await loadAllData();
      renderMoodView();
      renderDashboard();
    } catch (err) {
      toast('Failed to save mood', 'error');
      console.error(err);
    }
  });
}

function renderMoodView() {
  const list = $('#mood-list');
  if (!state.moodEntries.length) {
    list.innerHTML = '<div class="empty-state">No mood entries yet. How are you feeling?</div>';
  } else {
    list.innerHTML = state.moodEntries.map(function (m) {
      return '<div class="entry-item">' +
        '<div class="entry-item-left">' +
        '<span class="entry-date">' + fmtShortDate(m.date) + '</span>' +
        '<span class="entry-main">' + moodEmojis[m.mood] + ' ' + moodLabels[m.mood] + '</span>' +
        (m.note ? '<span class="entry-note">' + escapeHtml(m.note) + '</span>' : '') +
        '</div>' +
        '<button class="entry-delete" data-mood-id="' + m.id + '" aria-label="Delete">✕</button>' +
      '</div>';
    }).join('');
    list.querySelectorAll('.entry-delete').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.dataset.moodId;
        try {
          await supabase.from('mood_entries').delete().eq('id', id);
          toast('Mood entry deleted', 'success');
          await loadAllData();
          renderMoodView();
          renderDashboard();
        } catch (err) {
          toast('Failed to delete', 'error');
        }
      });
    });
  }
  renderMoodChart('mood-chart');
}

function renderMoodChart(canvasId) {
  const canvas = $('#' + canvasId);
  if (!canvas) return;
  const sorted = state.moodEntries.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
  const labels = sorted.map(function (m) { return fmtShortDate(m.date); });
  const data = sorted.map(function (m) { return m.mood; });

  if (state.charts[canvasId]) state.charts[canvasId].destroy();
  if (!data.length) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const baseOpts = chartOptions('Mood (1-5)');
  state.charts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Mood',
        data: data,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16,185,129,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: data.map(function (v) {
          return v >= 4 ? '#10b981' : v === 3 ? '#f59e0b' : '#ef4444';
        }),
      }],
    },
    options: {
      responsive: baseOpts.responsive,
      maintainAspectRatio: baseOpts.maintainAspectRatio,
      plugins: baseOpts.plugins,
      scales: {
        x: baseOpts.scales.x,
        y: { min: 0, max: 5, ticks: { stepSize: 1 }, grid: { color: '#f3f4f6' } },
      },
    },
  });
}

// ===== Habits =====
function setupHabitForm() {
  $('#habit-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const name = $('#habit-name').value.trim();
    const color = $('#habit-color').value;
    if (!name) return;

    try {
      const result = await supabase.from('habits').insert({ name: name, color: color });
      if (result.error) throw result.error;
      toast('Habit added!', 'success');
      $('#habit-name').value = '';
      await loadAllData();
      renderHabitView();
      renderDashboard();
    } catch (err) {
      toast('Failed to add habit', 'error');
      console.error(err);
    }
  });
}

function renderHabitView() {
  const container = $('#habit-tracker');
  if (!state.habits.length) {
    container.innerHTML = '<div class="empty-state">No habits yet. Add one to start building streaks!</div>';
    return;
  }

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last7.push(d.toISOString().split('T')[0]);
  }
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = todayStr();

  container.innerHTML = state.habits.map(function (habit) {
    const streak = habitStreak(habit.id);
    const weekHtml = last7.map(function (date) {
      const completion = state.habitCompletions.find(function (c) {
        return c.habit_id === habit.id && c.date === date;
      });
      const isCompleted = completion && completion.completed;
      const dayName = dayNames[new Date(date + 'T00:00:00').getDay()];
      return '<div class="habit-day">' +
        '<span class="habit-day-label">' + dayName + '</span>' +
        '<button class="habit-day-btn ' + (isCompleted ? 'completed' : '') + ' ' + (date === today ? 'today' : '') + '"' +
        ' style="--habit-color: ' + habit.color + '"' +
        ' data-habit-id="' + habit.id + '"' +
        ' data-date="' + date + '"' +
        ' data-completed="' + (isCompleted ? 'true' : 'false') + '"' +
        ' aria-label="Toggle ' + escapeHtml(habit.name) + ' for ' + date + '">' +
        (isCompleted ? '✓' : '') +
        '</button>' +
      '</div>';
    }).join('');

    return '<div class="habit-row">' +
      '<div class="habit-row-header">' +
        '<div class="habit-row-title">' +
          '<span class="habit-color-dot" style="background:' + habit.color + '"></span>' +
          '<span class="habit-name">' + escapeHtml(habit.name) + '</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span class="habit-streak-badge" style="background:' + habit.color + '">🔥 ' + streak + 'd</span>' +
          '<button class="habit-delete" data-habit-id="' + habit.id + '" aria-label="Delete habit">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="habit-week">' + weekHtml + '</div>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.habit-day-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const habitId = btn.dataset.habitId;
      const date = btn.dataset.date;
      const wasCompleted = btn.dataset.completed === 'true';

      try {
        if (wasCompleted) {
          const existing = state.habitCompletions.find(function (c) {
            return c.habit_id === habitId && c.date === date;
          });
          if (existing) {
            await supabase.from('habit_completions').delete().eq('id', existing.id);
          }
        } else {
          await supabase.from('habit_completions').insert({ habit_id: habitId, date: date, completed: true });
        }
        await loadAllData();
        renderHabitView();
        renderDashboard();
      } catch (err) {
        toast('Failed to update habit', 'error');
        console.error(err);
      }
    });
  });

  container.querySelectorAll('.habit-delete').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const habitId = btn.dataset.habitId;
      try {
        await supabase.from('habits').delete().eq('id', habitId);
        toast('Habit deleted', 'success');
        await loadAllData();
        renderHabitView();
        renderDashboard();
      } catch (err) {
        toast('Failed to delete habit', 'error');
      }
    });
  });
}

// ===== Charts View =====
function renderAllCharts() {
  renderWeightChart('charts-weight');
  renderWorkoutFrequencyChart();
  renderMoodChart('charts-mood');
  renderHabitCompletionChart();
}

function renderWorkoutFrequencyChart() {
  const canvas = $('#charts-workout-freq');
  if (!canvas) return;
  const last30 = getLast30Days();
  const counts = last30.map(function (date) {
    return state.workouts.filter(function (w) { return w.date === date; }).length;
  });

  if (state.charts['charts-workout-freq']) state.charts['charts-workout-freq'].destroy();

  state.charts['charts-workout-freq'] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: last30.map(function (d) { return fmtShortDate(d); }),
      datasets: [{
        label: 'Workouts',
        data: counts,
        backgroundColor: '#3b82f6',
        borderRadius: 4,
      }],
    },
    options: chartOptions('Workouts'),
  });
}

function renderHabitCompletionChart() {
  const canvas = $('#charts-habits');
  if (!canvas) return;
  const last30 = getLast30Days();

  if (state.charts['charts-habits']) state.charts['charts-habits'].destroy();

  if (!state.habits.length) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const datasets = state.habits.map(function (habit) {
    const data = last30.map(function (date) {
      const c = state.habitCompletions.find(function (c) {
        return c.habit_id === habit.id && c.date === date;
      });
      return c && c.completed ? 1 : 0;
    });
    return {
      label: habit.name,
      data: data,
      backgroundColor: habit.color,
      borderColor: habit.color,
      borderWidth: 1,
      borderRadius: 3,
    };
  });

  const baseOpts = chartOptions('Completed (1=yes)');
  state.charts['charts-habits'] = new Chart(canvas, {
    type: 'bar',
    data: { labels: last30.map(function (d) { return fmtShortDate(d); }), datasets: datasets },
    options: {
      responsive: baseOpts.responsive,
      maintainAspectRatio: baseOpts.maintainAspectRatio,
      plugins: baseOpts.plugins,
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, max: state.habits.length, ticks: { stepSize: 1 } },
      },
    },
  });
}

// ===== Dashboard =====
function renderDashboard() {
  const today = todayStr();
  $('#today-date').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  if (state.weightEntries.length) {
    const latest = state.weightEntries.slice().sort(function (a, b) { return b.date.localeCompare(a.date); })[0];
    $('#stat-weight').textContent = latest.weight_kg + ' kg';
  } else {
    $('#stat-weight').textContent = '—';
  }

  const workoutDates = state.workouts.map(function (w) { return w.date; });
  const streak = calculateStreak(workoutDates);
  $('#stat-workout-streak').textContent = streak + 'd';

  const todayMood = state.moodEntries.find(function (m) { return m.date === today; });
  $('#stat-mood').textContent = todayMood ? moodEmojis[todayMood.mood] : '—';

  const completedToday = state.habitCompletions.filter(function (c) {
    return c.date === today && c.completed;
  }).length;
  $('#stat-habits').textContent = completedToday + '/' + state.habits.length;

  renderWeightChart('dashboard-weight-chart');
  renderMoodChart('dashboard-mood-chart');

  const recent = state.workouts.slice(0, 5);
  const recentContainer = $('#recent-workouts');
  if (!recent.length) {
    recentContainer.innerHTML = '<div class="empty-state">No workouts yet.</div>';
  } else {
    recentContainer.innerHTML = recent.map(function (w) {
      const exCount = state.exercises.filter(function (e) { return e.workout_id === w.id; }).length;
      return '<div class="recent-workout-item">' +
        '<span class="recent-workout-date">' + fmtShortDate(w.date) + '</span>' +
        '<span class="recent-workout-name">' + escapeHtml(w.name) + '</span>' +
        '<span class="recent-workout-info">' + exCount + ' exercises' +
          (w.duration_min ? ' · ' + w.duration_min + 'min' : '') + '</span>' +
      '</div>';
    }).join('');
  }
}

// ===== Chart Options Helper =====
function chartOptions(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1f2937',
        padding: 12,
        cornerRadius: 8,
        titleFont: { size: 13, weight: '600' },
        bodyFont: { size: 12 },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 10 } },
      y: { grid: { color: '#f3f4f6' }, ticks: { font: { size: 11 } }, title: { display: !!yLabel, text: yLabel, font: { size: 11 } } },
    },
  };
}

// ===== Google Sheets Sync =====
function setupSettings() {
  const savedUrl = localStorage.getItem('sheets_url') || '';
  $('#sheets-url').value = savedUrl;

  $('#sheets-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const url = $('#sheets-url').value.trim();
    localStorage.setItem('sheets_url', url);
    toast('Google Sheets URL saved!', 'success');
  });

  $('#sync-now-btn').addEventListener('click', syncToGoogleSheets);
  $('#export-csv-btn').addEventListener('click', function () { exportCSV(); });
  $('#download-all-btn').addEventListener('click', function () { exportCSV(); });
}

async function syncToGoogleSheets() {
  const url = $('#sheets-url').value.trim();
  if (!url) {
    toast('Please enter a Google Apps Script URL first', 'error');
    return;
  }

  const status = $('#sync-status');
  status.className = 'sync-status loading';
  status.textContent = 'Syncing...';

  try {
    const payload = {
      weight: state.weightEntries,
      workouts: state.workouts.map(function (w) {
        return Object.assign({}, w, {
          exercises: state.exercises.filter(function (e) { return e.workout_id === w.id; }),
        });
      }),
      mood: state.moodEntries,
      habits: state.habits,
      habitCompletions: state.habitCompletions,
    };

    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    status.className = 'sync-status success';
    status.textContent = 'Sync sent successfully! Check your Google Sheet.';
    toast('Data synced to Google Sheets!', 'success');
  } catch (err) {
    status.className = 'sync-status error';
    status.textContent = 'Sync failed: ' + err.message;
    toast('Sync failed', 'error');
    console.error(err);
  }
}

function csvEscape(str) {
  return String(str).replace(/"/g, '""');
}

function exportCSV() {
  const csvParts = [];

  csvParts.push('WEIGHT ENTRIES');
  csvParts.push('Date,Weight (kg),Note');
  state.weightEntries.forEach(function (w) {
    csvParts.push(w.date + ',' + w.weight_kg + ',"' + csvEscape(w.note || '') + '"');
  });
  csvParts.push('');

  csvParts.push('WORKOUTS');
  csvParts.push('Date,Name,Duration (min),Exercise,Sets,Reps,Weight (kg)');
  state.workouts.forEach(function (w) {
    const exercises = state.exercises.filter(function (e) { return e.workout_id === w.id; });
    if (exercises.length === 0) {
      csvParts.push(w.date + ',"' + csvEscape(w.name) + '",' + (w.duration_min || '') + ',,,,');
    } else {
      exercises.forEach(function (ex) {
        csvParts.push(w.date + ',"' + csvEscape(w.name) + '",' + (w.duration_min || '') + ',"' + csvEscape(ex.name) + '",' + ex.sets + ',' + ex.reps + ',' + (ex.weight_kg || ''));
      });
    }
  });
  csvParts.push('');

  csvParts.push('MOOD ENTRIES');
  csvParts.push('Date,Mood (1-5),Mood Label,Note');
  state.moodEntries.forEach(function (m) {
    csvParts.push(m.date + ',' + m.mood + ',"' + (moodLabels[m.mood] || '') + '","' + csvEscape(m.note || '') + '"');
  });
  csvParts.push('');

  csvParts.push('HABITS');
  csvParts.push('Name,Color,Date,Completed');
  state.habits.forEach(function (h) {
    const completions = state.habitCompletions.filter(function (c) { return c.habit_id === h.id; });
    if (completions.length === 0) {
      csvParts.push('"' + csvEscape(h.name) + '",' + h.color + ',,');
    } else {
      completions.forEach(function (c) {
        csvParts.push('"' + csvEscape(h.name) + '",' + h.color + ',' + c.date + ',' + (c.completed ? 'Yes' : 'No'));
      });
    }
  });

  const csv = csvParts.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'fittrack-export-' + todayStr() + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('CSV exported!', 'success');
}

// ===== Init =====
async function init() {
  setupNavigation();
  setupWeightForm();
  setupWorkoutForm();
  setupMoodForm();
  setupHabitForm();
  setupSettings();

  await loadAllData();

  renderDashboard();
  renderWeightView();
  renderWorkoutView();
  renderMoodView();
  renderHabitView();
}

init();
