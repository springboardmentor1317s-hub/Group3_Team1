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

// Routes (will be mounted after DB connects)
app.use('/api', authRoutes);
app.use('/api', eventRoutes);
app.use('/api', debugRoutes);

// Test Route
app.get('/', (req, res) => {
  res.send('Backend Running Successfully');
});

const PORT = process.env.PORT || 5000;

// Connect MongoDB and start server
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/campus_event_hub';
mongoose.connect(mongoUri)
  .then(() => {
    console.log('MongoDB Connected:', mongoUri);
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.log('DB Error', err));
