// -------------------------
  // Client-side JS
  // -------------------------
  const BASE = ''; // served from same origin
  const alarm = document.getElementById('alarmSound');
  const form = document.getElementById('remForm');
  const reminderList = document.getElementById('reminderList');
  const historyList = document.getElementById('historyList');
  const refillAlerts = document.getElementById('refillAlerts');
  const countBadge = document.getElementById('countBadge');

  let reminders = [];
  let history = [];

  // Request notification permission
  document.getElementById('askPerm').addEventListener('click', () => {
    if ('Notification' in window) Notification.requestPermission().then(p => alert('Permission: ' + p));
  });

  // Load initial data
  async function loadAll() {
    await loadReminders();
    await loadHistory();
  }

  // Load reminders from server
  async function loadReminders() {
    const res = await fetch(BASE + '/reminders');
    reminders = await res.json();
    renderReminders();
    renderRefillAlerts();
    countBadge.textContent = reminders.length + ' active';
  }

  // Load history
  async function loadHistory() {
    const res = await fetch(BASE + '/history');
    history = await res.json();
    renderHistory();
  }

  function renderHistory() {
    historyList.innerHTML = '';
    history.slice(0,50).forEach(h => {
      const d = new Date(h.date);
      const item = document.createElement('div');
      item.className = 'hitem';
      item.innerHTML = `<b>${h.name}</b> — ${h.status.toUpperCase()} at ${h.time} <span class="small">(${d.toLocaleString()})</span>`;
      historyList.appendChild(item);
    });
  }

  function renderRefillAlerts() {
    refillAlerts.innerHTML = '';
    const low = reminders.filter(r => typeof r.quantity === 'number' && r.quantity <= r.refillThreshold && r.refillThreshold > 0);
    if (low.length === 0) {
      refillAlerts.textContent = 'No refill alerts';
      return;
    }
    low.forEach(r => {
      const div = document.createElement('div');
      div.innerHTML = `<span class="danger">Low:</span> ${r.name} — ${r.quantity} left (threshold ${r.refillThreshold})`;
      refillAlerts.appendChild(div);
      // also show notification if permission granted
      if (Notification && Notification.permission === 'granted') {
        new Notification('Refill Alert', { body: `${r.name} running low (${r.quantity} left)`});
      }
    });
  }

  // Render reminders UI
  function renderReminders() {
    reminderList.innerHTML = '';
    reminders.forEach(r => {
      const div = document.createElement('div');
      div.className = 'rem';

      const meta = document.createElement('div');
      meta.className = 'meta';
      const repeatText = r.repeat && r.repeat.type === 'every_x_hours' ? `Every ${r.repeat.hours} hrs` : (r.repeat && r.repeat.type === 'daily' ? 'Daily' : 'No repeat');

      meta.innerHTML = `<div><span class="pill">${r.name}</span> <span class="small"> ${r.dosage || ''}</span></div>
                        <div class="small">${r.time} • ${repeatText} ${r.instructions ? '• ' + r.instructions : ''}</div>
                        <div class="small">Qty: ${r.quantity || 0} ${ (r.quantity <= r.refillThreshold && r.refillThreshold>0) ? '<span class="danger"> (Refill!)</span>' : ''}</div>`

      const controls = document.createElement('div');
      controls.className = 'controls';

      // Taken button
      const takeBtn = document.createElement('button');
      takeBtn.className = 'btn';
      takeBtn.textContent = 'Taken';
      takeBtn.onclick = async () => {
        await fetch(`/reminder/${r._id}/take`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ note: '' }) });
        await loadAll();
      };

      // Snooze button
      const snoozeBtn = document.createElement('button');
      snoozeBtn.className = 'btn secondary';
      snoozeBtn.textContent = 'Snooze';
      snoozeBtn.onclick = async () => {
        const mins = parseInt(prompt('Snooze minutes?', '5')) || 5;
        await fetch(`/reminder/${r._id}/snooze`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ minutes: mins }) });
        alert('Snoozed for ' + mins + ' min');
        await loadReminders();
      };

      // Edit button
      const editBtn = document.createElement('button');
      editBtn.className = 'btn secondary';
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => startEdit(r);

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.className = 'btn';
      delBtn.style.background = '#e74c3c';
      delBtn.textContent = 'Delete';
      delBtn.onclick = async () => {
        if (!confirm('Delete this reminder?')) return;
        await fetch(`/reminder/${r._id}`, { method: 'DELETE' });
        await loadAll();
      };

      controls.appendChild(takeBtn);
      controls.appendChild(snoozeBtn);
      controls.appendChild(editBtn);
      controls.appendChild(delBtn);

      div.appendChild(meta);
      div.appendChild(controls);
      reminderList.appendChild(div);
    });
  }

  // Populate form for edit
  function startEdit(r) {
    document.getElementById('editId').value = r._id;
    document.getElementById('name').value = r.name || '';
    document.getElementById('dosage').value = r.dosage || '';
    document.getElementById('instructions').value = r.instructions || '';
    document.getElementById('time').value = r.time || '08:00';
    document.getElementById('quantity').value = r.quantity || 0;
    document.getElementById('refillThreshold').value = r.refillThreshold || 0;
    if (r.repeat && r.repeat.type) {
      document.getElementById('repeatType').value = r.repeat.type;
      document.getElementById('repeatHours').value = r.repeat.hours || '';
    } else {
      document.getElementById('repeatType').value = 'none';
      document.getElementById('repeatHours').value = '';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Add / Update form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    const payload = {
      name: document.getElementById('name').value.trim(),
      dosage: document.getElementById('dosage').value.trim(),
      instructions: document.getElementById('instructions').value.trim(),
      time: document.getElementById('time').value,
      quantity: parseInt(document.getElementById('quantity').value) || 0,
      refillThreshold: parseInt(document.getElementById('refillThreshold').value) || 0,
      repeat: { type: document.getElementById('repeatType').value }
    };
    if (payload.repeat.type === 'every_x_hours') {
      payload.repeat.hours = parseInt(document.getElementById('repeatHours').value) || 8;
    }

    if (id) {
      // update
      await fetch(`/reminder/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      document.getElementById('editId').value = '';
      alert('Updated');
    } else {
      await fetch('/add', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      alert('Added');
    }
    form.reset();
    await loadAll();
  });

  document.getElementById('refreshBtn').addEventListener('click', loadAll);

  // ---------- Notification logic ----------
  // Check every 20 seconds for due reminders. Use snoozeUntil and repeat settings.
  setInterval(checkDueReminders, 20000);
  // Also run check on load
  setTimeout(checkDueReminders, 2000);

  async function checkDueReminders() {
    // ensure we have latest reminders
    await loadReminders();
    const now = new Date();
    const currentHHMM = now.toTimeString().slice(0,5);

    reminders.forEach(async r => {
      // if snoozed and snoozeUntil > now => skip
      if (r.snoozeUntil && new Date(r.snoozeUntil) > new Date()) return;

      // Avoid duplicates: if lastTriggeredAt is in same minute, skip
      if (r.lastTriggeredAt) {
        const last = new Date(r.lastTriggeredAt);
        if (Math.abs(now - last) < 60000) return;
      }

      let due = false;

      // Case 1: simple time matches HH:MM
      if (r.time === currentHHMM) due = true;

      // Case 2: repeat every X hours (calculate if now - createdAt fits multiple of hours)
      if (!due && r.repeat && r.repeat.type === 'every_x_hours') {
        // compute the last triggered or creation time baseline
        // We'll consider a reminder due if the current time (in ms) modulo (interval) is close to the scheduled time-of-day minute
        // Simpler approach: check lastTriggeredAt or createdAt + n * hours equals now by minutes match
        if (r.lastTriggeredAt) {
          // if enough hours passed since lastTriggeredAt
          const last = new Date(r.lastTriggeredAt);
          const diffHours = (Date.now() - last.getTime()) / (1000*60*60);
          if (diffHours >= r.repeat.hours - 0.016) due = true;
        } else {
          // fallback: match time HH:MM for first trigger
          if (r.time === currentHHMM) due = true;
        }
      }

      // Case 3: daily repeat -> same HH:MM every day
      if (!due && r.repeat && r.repeat.type === 'daily') {
        if (r.time === currentHHMM) due = true;
      }

      if (due) {
        // show notification & play sound
        showNotification(r);
        // update lastTriggeredAt to avoid duplicate within minute
        await fetch(`/reminder/${r._id}`, { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ lastTriggeredAt: new Date() }) });
      }
    });
  }

  function showNotification(r) {
    const title = '💊 Medicine Reminder';
    const body = `${r.name} — ${r.dosage || ''} ${r.instructions ? '('+r.instructions+')' : ''}`;
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/2966/2966488.png' });
    } else {
      alert(`${title}\n${body}`);
    }
    // play sound
    try { alarm.currentTime = 0; alarm.play(); } catch(e) {}
    // Optionally, show quick browser UI changes, e.g., highlight in list
  }

  function getRecommendation() {
    const symptom = document.getElementById("symptomSelect").value;
    const box = document.getElementById("recommendationBox");

    const recommendations = {
        fever: `
            <b>General Advice for Fever:</b><br>
            • Drink plenty of water.<br>
            • Take adequate rest.<br>
            • Use a damp cloth on the forehead to reduce temperature.<br><br>
            <b>Over-the-counter options (ask a pharmacist):</b><br>
            • Fever-reducing medicines category (antipyretics).<br><br>
            <b>Consult a doctor if:</b><br>
            • Fever lasts more than 2 days<br>
            • Temperature goes above 103°F<br>
        `,

        headache: `
            <b>General Advice for Headache:</b><br>
            • Drink enough water.<br>
            • Take rest in a dark, quiet room.<br>
            • Avoid screen strain.<br><br>
            <b>Over-the-counter options (ask a pharmacist):</b><br>
            • Pain relief category.<br><br>
            <b>Consult a doctor if:</b><br>
            • Frequent or severe headaches occur<br>
            • Headache with blurred vision or dizziness<br>
        `,

        cold: `
            <b>General Advice for Cold & Cough:</b><br>
            • Drink warm water.<br>
            • Do steam inhalation.<br>
            • Gargle with warm salt water.<br><br>
            <b>Over-the-counter options (ask a pharmacist):</b><br>
            • Cough syrup category<br>
            • Nasal decongestant category<br><br>
            <b>Consult a doctor if:</b><br>
            • Symptoms last more than 3–4 days<br>
            • Breathing difficulty occurs<br>
        `,

        acidity: `
            <b>General Advice for Acidity:</b><br>
            • Avoid spicy & oily food.<br>
            • Eat small meals.<br>
            • Drink cold milk or coconut water.<br><br>
            <b>Over-the-counter options (ask a pharmacist):</b><br>
            • Antacid category<br><br>
            <b>Consult a doctor if:</b><br>
            • Pain becomes severe<br>
            • Acidity persists for many days<br>
        `,

        stomach: `
            <b>General Advice for Stomach Pain:</b><br>
            • Drink warm water.<br>
            • Avoid heavy meals temporarily.<br>
            • Rest and avoid stress.<br><br>
            <b>Over-the-counter options (ask a pharmacist):</b><br>
            • Stomach pain relief category<br>
            • ORS for dehydration<br><br>
            <b>Consult a doctor if:</b><br>
            • Severe or long-lasting pain<br>
            • Vomiting or fever occurs<br>
        `,

        allergy: `
            <b>General Advice for Allergy Symptoms:</b><br>
            • Avoid dust & strong smells.<br>
            • Wash face & hands frequently.<br>
            • Keep windows closed during high pollen time.<br><br>
            <b>Over-the-counter options (ask a pharmacist):</b><br>
            • Anti-allergy category<br><br>
            <b>Consult a doctor if:</b><br>
            • Breathing difficulty occurs<br>
            • Symptoms last more than 2 days<br>
        `,

        bodypain: `
            <b>General Advice for Body Pain:</b><br>
            • Stay hydrated.<br>
            • Do light stretching.<br>
            • Warm water bath helps.<br><br>
            <b>Over-the-counter options (ask a pharmacist):</b><br>
            • Pain relief category<br><br>
            <b>Consult a doctor if:</b><br>
            • Pain persists for many days<br>
        `
    };

    if (!symptom) {
        box.innerHTML = "Please select a health issue.";
    } else {
        box.innerHTML = recommendations[symptom];
    }

    box.classList.remove("hidden");
}




  // initial load
  loadAll();