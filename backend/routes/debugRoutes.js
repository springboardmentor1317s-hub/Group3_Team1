const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Event = require('../models/Event');

// DEV ONLY: list users without password
router.get('/debug/users', async (req, res) => {
  try {
    const users = await User.find().select('-password -__v');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get dashboard stats for super admin
router.get('/stats/summary', async (req, res) => {
  try {
    const totalAdmins = await User.countDocuments({ role: 'college_admin' });
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalEvents = await Event.countDocuments();
    const totalSuperAdmins = await User.countDocuments({ role: 'super_admin' });
    
    res.json({
      totalAdmins,
      totalStudents,
      totalEvents,
      totalSuperAdmins
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get admin activities for super admin dashboard
router.get('/stats/admin-activities', async (req, res) => {
  try {
    const admins = await User.find({ role: 'college_admin' }).select('name college createdAt');
    
    // Get event counts for each admin using userId or _id
    const adminActivities = await Promise.all(
      admins.map(async (admin) => {
        // Try to match by organizer field which stores userId or name
        const eventCount = await Event.countDocuments({ 
          $or: [{ organizer: admin.userId }, { organizer: admin.name }, { organizer: admin.email }]
        });
        return {
          name: admin.name,
          college: admin.college || 'Not specified',
          userId: admin.userId,
          eventCount,
          createdAt: admin.createdAt
        };
      })
    );
    
    res.json(adminActivities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get more detailed stats for super admin
router.get('/stats/detailed', async (req, res) => {
  try {
    const totalAdmins = await User.countDocuments({ role: 'college_admin' });
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalEvents = await Event.countDocuments();
    const totalSuperAdmins = await User.countDocuments({ role: 'super_admin' });
    
    // Get active events count
    const activeEvents = await Event.countDocuments({ status: 'Active' });
    
    // Get recent registrations (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentStudents = await User.countDocuments({ 
      role: 'student', 
      createdAt: { $gte: sevenDaysAgo } 
    });
    
    // Calculate system load (mock - in real app would be based on actual metrics)
    const cpuUsage = Math.floor(Math.random() * 30) + 20; // Random between 20-50%
    
    res.json({
      totalAdmins,
      totalStudents,
      totalEvents,
      totalSuperAdmins,
      activeEvents,
      recentStudents,
      systemLoad: cpuUsage
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all users for super admin management
router.get('/users/all', async (req, res) => {
  try {
    const users = await User.find().select('-password -__v').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user role
router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select('-password -__v');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
