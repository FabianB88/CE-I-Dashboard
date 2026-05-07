import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, collection, addDoc, updateDoc, doc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ─────────────────────────────────────────────────────────────────────────────
// SETUP — replace the values below with your own Firebase project config.
//
// Steps:
//   1. Go to https://console.firebase.google.com and create a project
//   2. Click "Add app" → Web, register it, copy the config here
//   3. Go to Authentication → Sign-in method → enable Google
//   4. Go to Authentication → Settings → Authorized domains → add your
//      GitHub Pages domain (e.g. fabianb88.github.io)
//   5. Go to Firestore Database → Create database (start in test mode)
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);
const provider    = new GoogleAuthProvider();

// ── State ─────────────────────────────────────────────────────────────────────
let cards = [];
let tasks = [];

// ── Auth ──────────────────────────────────────────────────────────────────────
document.getElementById('btn-google-login').addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch {
    const el = document.getElementById('login-error');
    el.textContent = 'Sign-in failed. Please try again.';
    el.classList.remove('hidden');
  }
});

document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, user => {
  if (user) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('user-name').textContent = user.displayName || user.email;
    if (user.photoURL) document.getElementById('user-avatar').src = user.photoURL;
    loadData(user.uid);
  } else {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  }
});

// ── Navigation ────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('view-' + btn.dataset.view).classList.remove('hidden');
  });
});

// ── Firestore data ────────────────────────────────────────────────────────────
function loadData(uid) {
  onSnapshot(collection(db, 'users', uid, 'cards'), snap => {
    cards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderKanban();
    updateStats();
  });
  onSnapshot(collection(db, 'users', uid, 'tasks'), snap => {
    tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTasks();
    updateStats();
  });
}

// ── Kanban ────────────────────────────────────────────────────────────────────
function renderKanban() {
  ['backlog', 'inprogress', 'done'].forEach(col => {
    const el = document.getElementById('col-' + col);
    el.innerHTML = '';
    cards.filter(c => c.col === col).forEach(card => {
      const div = document.createElement('div');
      div.className = 'kanban-card';
      div.draggable = true;
      div.dataset.id = card.id;
      div.innerHTML = `
        <div class="card-title">${esc(card.title)}</div>
        ${card.assignee ? `<div class="card-meta">👤 ${esc(card.assignee)}</div>` : ''}
      `;
      div.addEventListener('dragstart', e => e.dataTransfer.setData('cardId', card.id));
      el.appendChild(div);
    });
  });

  document.querySelectorAll('.kanban-col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-target'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag-target'));
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('drag-target');
      const id = e.dataTransfer.getData('cardId');
      const uid = auth.currentUser.uid;
      await updateDoc(doc(db, 'users', uid, 'cards', id), { col: col.dataset.col });
    });
  });
}

document.getElementById('btn-add-card').addEventListener('click', () =>
  document.getElementById('modal-card').classList.remove('hidden'));

document.getElementById('btn-cancel-card').addEventListener('click', () =>
  document.getElementById('modal-card').classList.add('hidden'));

document.getElementById('btn-save-card').addEventListener('click', async () => {
  const title = document.getElementById('card-title').value.trim();
  if (!title) return;
  const uid = auth.currentUser.uid;
  await addDoc(collection(db, 'users', uid, 'cards'), {
    title,
    col:      document.getElementById('card-col').value,
    assignee: document.getElementById('card-assignee').value.trim(),
    createdAt: Date.now()
  });
  document.getElementById('modal-card').classList.add('hidden');
  document.getElementById('card-title').value = '';
  document.getElementById('card-assignee').value = '';
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
function renderTasks() {
  const el = document.getElementById('task-list');
  el.innerHTML = '';
  [...tasks].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0)).forEach(task => {
    const div = document.createElement('div');
    div.className = 'task-item';
    div.innerHTML = `
      <input type="checkbox" class="task-check" ${task.done ? 'checked' : ''} data-id="${task.id}" />
      <span class="task-title${task.done ? ' done' : ''}">${esc(task.title)}</span>
      ${task.assignee ? `<span class="task-assignee">${esc(task.assignee)}</span>` : ''}
      ${task.due     ? `<span class="task-due">${task.due}</span>` : ''}
    `;
    div.querySelector('.task-check').addEventListener('change', async e => {
      const uid = auth.currentUser.uid;
      await updateDoc(doc(db, 'users', uid, 'tasks', task.id), { done: e.target.checked });
    });
    el.appendChild(div);
  });
}

document.getElementById('btn-add-task').addEventListener('click', () =>
  document.getElementById('modal-task').classList.remove('hidden'));

document.getElementById('btn-cancel-task').addEventListener('click', () =>
  document.getElementById('modal-task').classList.add('hidden'));

document.getElementById('btn-save-task').addEventListener('click', async () => {
  const title = document.getElementById('task-title').value.trim();
  if (!title) return;
  const uid = auth.currentUser.uid;
  await addDoc(collection(db, 'users', uid, 'tasks'), {
    title,
    assignee:  document.getElementById('task-assignee').value.trim(),
    due:       document.getElementById('task-due').value,
    done:      false,
    createdAt: Date.now()
  });
  document.getElementById('modal-task').classList.add('hidden');
  document.getElementById('task-title').value = '';
  document.getElementById('task-assignee').value = '';
  document.getElementById('task-due').value = '';
});

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-total').textContent      = tasks.length;
  document.getElementById('stat-inprogress').textContent = cards.filter(c => c.col === 'inprogress').length;
  document.getElementById('stat-done').textContent       = tasks.filter(t => t.done).length;
}

// ── Utility ───────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
