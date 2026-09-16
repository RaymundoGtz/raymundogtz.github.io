const defaultState = { people: [], expenses: [] };
let state = { ...defaultState };
let database;

const $ = (selector) => document.querySelector(selector);
const money = (value) => `€${value.toFixed(2)}`;

function isDatabaseConfigured() {
  return window.SUPABASE_URL && window.SUPABASE_ANON_KEY
    && !window.SUPABASE_URL.includes('YOUR_PROJECT')
    && !window.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
}

async function loadState() {
  if (!isDatabaseConfigured()) {
    showToast('Add your Supabase settings to connect the shared ledger.');
    render();
    return;
  }
  database = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  const { data, error } = await database.from('ledgers').select('people, expenses').eq('room_code', window.SUPABASE_ROOM).maybeSingle();
  if (error) {
    showToast('Could not connect to the shared ledger.');
    render();
    return;
  }
  if (data) state = { people: data.people || [], expenses: data.expenses || [] };
  render();
}

async function saveState() {
  if (!database) return;
  const { error } = await database.from('ledgers').upsert({
    room_code: window.SUPABASE_ROOM,
    people: state.people,
    expenses: state.expenses,
    updated_at: new Date().toISOString(),
  });
  if (error) showToast('Could not save the shared ledger.');
}

function initials(name) {
  return name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function render() {
  renderPeople();
  renderBalances();
  renderLedger();
  renderActivity();
  $('#activityCount').textContent = state.expenses.length;
  $('#peopleCount').textContent = `${state.people.length} ${state.people.length === 1 ? 'person' : 'people'}`;
  const total = getBalances().reduce((sum, item) => sum + item.amount, 0);
  $('#totalOwed').innerHTML = `${money(total)}<br><small>outstanding</small>`;
  updatePersonOptions();
}

function getBalances() {
  const pairTotals = new Map();
  state.expenses.forEach((expense) => {
    const key = [expense.payer, expense.debtor].sort().join('|');
    const direction = expense.payer === expense.debtor ? 0 : expense.payer === key.split('|')[0] ? -1 : 1;
    pairTotals.set(key, (pairTotals.get(key) || 0) + expense.amount * direction);
  });

  return [...pairTotals].flatMap(([key, total]) => {
    if (Math.abs(total) < 0.005) return [];
    const [first, second] = key.split('|');
    return total > 0
      ? [{ payer: second, debtor: first, amount: total }]
      : [{ payer: first, debtor: second, amount: Math.abs(total) }];
  });
}

function renderBalances() {
  const container = $('#balancesList');
  const balances = getBalances();
  if (!balances.length) {
    container.className = 'balance-list empty-state';
    container.innerHTML = '<div class="empty-icon">+</div><strong>Your ledger is clear</strong><p>Add people and record the first lunch split below.</p>';
    return;
  }
  container.className = 'balance-list';
  container.innerHTML = balances.map(({ payer, debtor, amount }) => `
    <article class="balance-card">
      <div class="names"><span class="avatar">${initials(debtor)}</span><span>${escapeHtml(debtor)} <span class="arrow">→</span> ${escapeHtml(payer)}</span></div>
      <div class="balance-amount">${money(amount)}<small>to pay back</small></div>
    </article>`).join('');
}

function renderLedger() {
  const container = $('#ledgerList');
  const pairs = [];
  for (let firstIndex = 0; firstIndex < state.people.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < state.people.length; secondIndex += 1) {
      const first = state.people[firstIndex];
      const second = state.people[secondIndex];
      const balance = getBalances().find((item) =>
        (item.debtor === first && item.payer === second) || (item.debtor === second && item.payer === first));
      pairs.push(balance || { payer: second, debtor: first, amount: 0 });
    }
  }

  if (!pairs.length) {
    container.className = 'ledger-list empty-state';
    container.innerHTML = '<div class="empty-icon">↔</div><strong>Add people to see the full ledger</strong><p>Each pair will appear here with their current net amount.</p>';
    return;
  }
  container.className = 'ledger-list';
  container.innerHTML = pairs.map(({ payer, debtor, amount }) => amount
    ? `<article class="ledger-card"><div><strong>${escapeHtml(debtor)}</strong><span class="ledger-arrow">→</span><strong>${escapeHtml(payer)}</strong></div><span class="ledger-value">${money(amount)}</span><small>${escapeHtml(debtor)} owes ${escapeHtml(payer)}</small></article>`
    : `<article class="ledger-card settled"><div><strong>${escapeHtml(debtor)}</strong><span class="ledger-arrow">↔</span><strong>${escapeHtml(payer)}</strong></div><span class="ledger-value">${money(0)}</span><small>Settled up</small></article>`).join('');
}

function renderActivity() {
  const container = $('#activityList');
  if (!state.expenses.length) {
    container.className = 'activity-list empty-state';
    container.innerHTML = '<div class="empty-icon">◷</div><strong>Nothing logged yet</strong><p>Your canteen payments will appear here.</p>';
    return;
  }
  container.className = 'activity-list';
  container.innerHTML = [...state.expenses].reverse().map((expense) => `
    <article class="activity-card">
      <div class="activity-main"><strong>${escapeHtml(expense.debtor)} owes ${escapeHtml(expense.payer)}</strong><small>${escapeHtml(expense.note || 'Canteen payment')} · ${formatDate(expense.createdAt)}</small></div>
      <span class="activity-value">${money(expense.amount)}</span>
    </article>`).join('');
}

function renderPeople() {
  const list = $('#peopleList');
  if (!state.people.length) {
    list.innerHTML = '<p class="muted">No people added yet.</p>';
    return;
  }
  list.innerHTML = state.people.map((person) => `<div class="person-row"><span>${escapeHtml(person)}</span><button class="remove-person" data-person="${escapeHtml(person)}">Remove</button></div>`).join('');
  list.querySelectorAll('.remove-person').forEach((button) => button.addEventListener('click', () => removePerson(button.dataset.person)));
}

function updatePersonOptions() {
  const options = state.people.length
    ? state.people.map((person) => `<option value="${escapeHtml(person)}">${escapeHtml(person)}</option>`).join('')
    : '<option value="">Add people first</option>';
  $('#payer').innerHTML = options;
  $('#debtor').innerHTML = options;
  $('#payer').disabled = state.people.length < 2;
  $('#debtor').disabled = state.people.length < 2;
}

function addPerson(event) {
  event.preventDefault();
  const input = $('#personName');
  const name = input.value.trim();
  if (!name) return;
  if (state.people.some((person) => person.toLowerCase() === name.toLowerCase())) {
    showToast('That person is already in your group.');
    return;
  }
  state.people.push(name);
  saveState();
  input.value = '';
  render();
  showToast(`${name} added to the group.`);
}

function removePerson(person) {
  if (state.expenses.some((expense) => expense.payer === person || expense.debtor === person)) {
    showToast('Keep this person until their balances are settled.');
    return;
  }
  state.people = state.people.filter((entry) => entry !== person);
  saveState();
  render();
}

function addExpense(event) {
  event.preventDefault();
  const payer = $('#payer').value;
  const debtor = $('#debtor').value;
  const amount = Number($('#amount').value);
  const error = $('#expenseError');
  if (payer === debtor) {
    error.textContent = 'Choose two different people.';
    return;
  }
  if (state.people.length < 2) {
    error.textContent = 'Add at least two people first.';
    return;
  }
  state.expenses.push({ payer, debtor, amount, note: $('#note').value.trim(), createdAt: Date.now() });
  saveState();
  render();
  closeModal('expenseModal');
  $('#expenseForm').reset();
  showToast('Payment added to the ledger.');
}

function openModal(id) {
  if (id === 'expenseModal' && state.people.length < 2) {
    openModal('peopleModal');
    showToast('Add at least two people to start.');
    return;
  }
  $(`#${id}`).hidden = false;
}
function closeModal(id) { $(`#${id}`).hidden = true; }
function formatDate(timestamp) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timeout); showToast.timeout = setTimeout(() => toast.classList.remove('show'), 2600); }

$('.tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('.tab');
  if (!tab) return;
  document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === tab));
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === `${tab.dataset.view}View`));
});
$('#addExpenseButton').addEventListener('click', () => openModal('expenseModal'));
$('#managePeopleButton').addEventListener('click', () => openModal('peopleModal'));
$('#expenseForm').addEventListener('submit', addExpense);
$('#personForm').addEventListener('submit', addPerson);
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeModal(button.dataset.close)));
document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeModal(backdrop.id); }));
$('#resetButton').addEventListener('click', () => {
  if (!state.people.length && !state.expenses.length) return;
  if (window.confirm('Clear all people and payments?')) {
    state = { ...defaultState, people: [], expenses: [] };
    saveState();
    render();
    showToast('Ledger cleared.');
  }
});

loadState();
