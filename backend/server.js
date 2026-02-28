require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const eventRoutes = require('./routes/eventRoutes');
const debugRoutes = require('./routes/debugRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

<<<<<<< HEAD
// Connect MongoDB (use local URI if env not set)
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/campus_event_hub';
mongoose.connect(mongoUri)
  .then(() => console.log("MongoDB Connected ", mongoUri))
  .catch((err) => console.log("DB Error", err));
=======
// Routes (will be mounted after DB connects)
app.use('/api', authRoutes);
app.use('/api', eventRoutes);
app.use('/api', debugRoutes);
>>>>>>> main

// Test Route
app.get('/', (req, res) => {
  res.send('Backend Running Successfully');
});

// mount API routes
const authRoutes = require('./routes/authRoutes');
app.use('/api', authRoutes);

const PORT = process.env.PORT || 5000;

// Connect MongoDB and start server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB Connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.log('DB Error', err));
