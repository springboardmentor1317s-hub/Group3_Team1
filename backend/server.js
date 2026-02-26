require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect MongoDB (use local URI if env not set)
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/campus_event_hub';
mongoose.connect(mongoUri)
  .then(() => console.log("MongoDB Connected ", mongoUri))
  .catch((err) => console.log("DB Error", err));

// Test Route
app.get('/', (req, res) => {
  res.send("Backend Running Successfully");
});

// mount API routes
const authRoutes = require('./routes/authRoutes');
app.use('/api', authRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
