require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const eventRoutes = require('./routes/eventRoutes');
const debugRoutes = require('./routes/debugRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes'); 
const registrationRoutes = require('./routes/registrationRoutes');
const profileRoutes = require('./routes/profileRoutes');
const eventReviewRoutes = require('./routes/eventReviewRoutes');
const eventCommentRoutes = require('./routes/eventCommentRoutes');
const studentQueryRoutes = require('./routes/studentQueryRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.use('/api', authRoutes);
app.use('/api', debugRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/superadmin', superAdminRoutes); 
app.use("/api/events", eventRoutes);
app.use('/api/registrations', registrationRoutes);
app.use('/api/event-reviews', eventReviewRoutes);
app.use('/api/event-comments', eventCommentRoutes);
app.use('/api/student-queries', studentQueryRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/attendance', attendanceRoutes);

app.get('/', (req, res) => {
  res.send('Backend Running Successfully');
});

const PORT = process.env.PORT || 5000;
const databaseUrl = process.env.DATABASE_URL || process.env.MONGO_URI;

mongoose.connect(databaseUrl)
  .then(() => {
    console.log('MongoDB Connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.log('DB Error', err));
