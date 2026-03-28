const mongoose = require('mongoose');
const College = require('./backend/models/College');
const Admin = require('./backend/models/Admin');
const User = require('./backend/models/User');

async function setupAdmin() {
  try {
await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/CompushEventHub');
    console.log('✅ Connected to MongoDB');

    // Check if user exists
    const user = await User.findOne({userId: 'Rohit'});
    if (!user) {
      console.log('❌ User Rohit not found');
      process.exit(1);
    }
    console.log(`✅ Found user: ${user._id}`);

    // Create college if not exists
    let college = await College.findOne({name: 'IIT Bansal'});
    if (!college) {
      college = await College.create({
        name: 'IIT Bansal',
        shortName: 'IITB',
        location: 'Bhopal',
        isActive: true
      });
      console.log(`✅ Created college: ${college._id}`);
    } else {
      console.log(`✅ College exists: ${college._id}`);
    }

    // Create admin record
    const admin = await Admin.findOneAndUpdate(
      { userId: user._id },
      {
        userId: user._id,
        collegeId: college._id,
        permissions: ['events', 'registrations', 'analytics', 'students'],
        isActive: true
      },
      { upsert: true, new: true }
    );

    console.log(`✅ Admin record created/updated: ${admin._id}`);
    console.log('🎉 Setup COMPLETE! Refresh app now.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

setupAdmin();

