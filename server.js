// server.js
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());


// Connect to MongoDB database "MedicineApp"
mongoose.connect('mongodb://localhost:27017/MedicineAPP', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.once('open', () => console.log('✅ Connected to MedicineApp database'));
db.on('error', (err) => console.error('Mongo error', err));

// Models

// History entries for taken/missed events
const historySchema = new mongoose.Schema({
  reminderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reminder' },
  name: String,
  time: String, // time string when event occurred (HH:MM)
  date: { type: Date, default: Date.now },
  status: String, // "taken" or "missed"
  note: String
});
const History = mongoose.model('History', historySchema);

// Reminder schema
const reminderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  dosage: String,
  instructions: String,
  // primary time stored as "HH:MM"
  time: { type: String, required: true },
  // repeat types:
  // { type: "none" } or { type: "daily" } or { type: "every_x_hours", hours: Number }
  repeat: {
    type: {
      type: String,
      enum: ['none', 'daily', 'every_x_hours'],
      default: 'none'
    },
    hours: Number
  },
  // quantity of pills left (optional)
  quantity: { type: Number, default: 0 },
  refillThreshold: { type: Number, default: 0 },
  // lastSnoozeUntil: date-time string when snooze expires (optional)
  snoozeUntil: Date,
  // lastTriggered at store the last time we notified to avoid duplicates in same minute
  lastTriggeredAt: Date
}, { timestamps: true });

const Reminder = mongoose.model('Reminder', reminderSchema);

// Routes

// improved chatbot route (replace existing /api/chatbot)
app.post("/api/chatbot", (req, res) => {
  try {
    const qRaw = req.body?.question;
    if (!qRaw) {
      return res.status(400).json({ error: 'No question provided' });
    }

    const q = String(qRaw).toLowerCase();
    console.log('[chatbot] question:', q); // debug log

    let answer = '';

    if (q.includes("fever") || q.includes("temperature")) {
        answer = "For fever, you may take Paracetamol 500mg every 6-8 hours. Drink water and rest.";
    } else if (q.includes("cold") || q.includes("runny nose") || q.includes("sneezing")) {
        answer = "For cold, you can take Cetirizine at night. Steam inhalation also helps.";
    } else if (q.includes("headache") || q.includes("pain")) {
        answer = "For headache, try Ibuprofen or Paracetamol. Stay hydrated.";
    } else if (q.includes("cough")) {
        answer = "For cough, you may try a cough syrup (dextromethorphan). Warm water helps.";
    } else if (q.includes("acidity") || q.includes("gas") || q.includes("stomach")) {
        answer = "For acidity, take an antacid like Gelusil/Digene. Avoid spicy foods.";
    } else if (q.includes("diarrhea") || q.includes("loose motion")) {
        answer = "For diarrhea, take ORS and zinc. Consult a doctor if it persists.";
    } else if (q.includes("vomit") || q.includes("nausea")) {
        answer = "For vomiting, keep hydrated and consult a doctor if persistent.";
    } else {
        answer = "I'm not sure about that. Please consult a doctor for detailed guidance.";
    }

    return res.json({ answer });
  } catch (err) {
    console.error('[chatbot] error:', err);
    return res.status(500).json({ error: 'Server error in chatbot' });
  }
});


// Add a new reminder
app.post('/add', async (req, res) => {
  try {
    const data = req.body;

    // normalize repeat
    if (!data.repeat) data.repeat = { type: 'none' };
    if (data.repeat.type === 'every_x_hours' && !data.repeat.hours) data.repeat.hours = 8;

    const reminder = new Reminder(data);
    await reminder.save();
    res.json({ message: 'Reminder added successfully!', reminder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error adding reminder' });
  }
});


// Get all reminders
app.get('/reminders', async (req, res) => {
  try {
    const reminders = await Reminder.find().sort({ createdAt: -1 }).lean();
    res.json(reminders);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching reminders' });
  }
});

// Update reminder
app.put('/reminder/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;
    const reminder = await Reminder.findByIdAndUpdate(id, data, { new: true });
    res.json({ message: 'Updated', reminder });
  } catch (err) {
    res.status(500).json({ message: 'Error updating reminder' });
  }
});

// Delete reminder
app.delete('/reminder/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await Reminder.findByIdAndDelete(id);
    await History.deleteMany({ reminderId: id }); // remove history for cleanliness
    res.json({ message: 'Deleted successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting reminder' });
  }
});

// Mark as taken
app.post('/reminder/:id/take', async (req, res) => {
  try {
    const id = req.params.id;
    const note = req.body.note || '';
    const reminder = await Reminder.findById(id);
    if (!reminder) return res.status(404).json({ message: 'Reminder not found' });

    // decrement quantity if > 0
    if (typeof reminder.quantity === 'number' && reminder.quantity > 0) {
      reminder.quantity -= 1;
      await reminder.save();
    }

    // log history
    const now = new Date();
    const hhmm = now.toTimeString().slice(0,5);
    const history = new History({
      reminderId: reminder._id,
      name: reminder.name,
      time: hhmm,
      status: 'taken',
      note
    });
    await history.save();

    res.json({ message: 'Marked taken', reminder });
  } catch (err) {
    res.status(500).json({ message: 'Error marking taken' });
  }
});

// Mark as missed
app.post('/reminder/:id/miss', async (req, res) => {
  try {
    const id = req.params.id;
    const note = req.body.note || '';
    const reminder = await Reminder.findById(id);
    if (!reminder) return res.status(404).json({ message: 'Reminder not found' });

    const now = new Date();
    const hhmm = now.toTimeString().slice(0,5);
    const history = new History({
      reminderId: reminder._id,
      name: reminder.name,
      time: hhmm,
      status: 'missed',
      note
    });
    await history.save();

    res.json({ message: 'Marked missed' });
  } catch (err) {
    res.status(500).json({ message: 'Error marking missed' });
  }
});

// Snooze: postpone next alert by X minutes (store snoozeUntil)
app.post('/reminder/:id/snooze', async (req, res) => {
  try {
    const id = req.params.id;
    const minutes = parseInt(req.body.minutes) || 5;
    const until = new Date(Date.now() + minutes * 60000);
    const reminder = await Reminder.findByIdAndUpdate(id, { snoozeUntil: until }, { new: true });
    res.json({ message: `Snoozed for ${minutes} minutes`, reminder });
  } catch (err) {
    res.status(500).json({ message: 'Error snoozing' });
  }
});

// Get history (latest first)
app.get('/history', async (req, res) => {
  try {
    const hist = await History.find().sort({ date: -1 }).limit(200);
    res.json(hist);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching history' });
  }
});





// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// Start server
const PORT = 5000;
app.listen(PORT, () => console.log(`🌍 Server running on http://localhost:${PORT}`));
