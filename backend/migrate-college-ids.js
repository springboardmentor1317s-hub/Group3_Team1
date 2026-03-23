const mongoose = require('mongoose');
const College = require('./models/College');
const Admin = require('./models/Admin');
const Event = require('./models/Event');
const Registration = require('./models/Registration');
const User = require('./models/User');

async function migrate() {
  try {
    // Connect to DB (update connection string)
    await mongoose.connect('mongodb://localhost:27017/your-db-name'); 
    console.log('✅ Connected to MongoDB');

    // Step 1: Create Colleges from unique college names
    const uniqueColleges = await Event.distinct('collegeName');
    console.log(`Found ${uniqueColleges.length} unique colleges`);

    const colleges = [];
    for (const collegeName of uniqueColleges) {
      if (!collegeName) continue;
      
      let college = await College.findOne({ name: collegeName });
      if (!college) {
        college = await College.create({
          name: collegeName.trim(),
          shortName: collegeName.substring(0,4).toUpperCase() + 'C',
          location: ''
        });
        console.log(`✅ Created College: ${college.name} (${college._id})`);
      }
      colleges[collegeName] = college._id;
    }

    // Step 2: Update Events
    let updatedEvents = 0;
    for (const [collegeName, collegeId] of Object.entries(colleges)) {
      const result = await Event.updateMany(
        { collegeName },
        { $set: { collegeId } }
      );
      updatedEvents += result.modifiedCount;
      console.log(`Updated ${result.modifiedCount} Events for ${collegeName}`);
    }
    console.log(`✅ Total Events updated: ${updatedEvents}`);

    // Step 3: Update Registrations  
    let updatedRegs = 0;
    for (const [collegeName, collegeId] of Object.entries(colleges)) {
      const result = await Registration.updateMany(
        { college: collegeName },
        { $set: { collegeId } }
      );
      updatedRegs += result.modifiedCount;
      console.log(`Updated ${result.modifiedCount} Registrations for ${collegeName}`);
    }
    console.log(`✅ Total Registrations updated: ${updatedRegs}`);

    // Step 4: Link existing approved college admins
    const approvedAdmins = await User.find({
      role: { $in: ['college_admin', 'admin'] },
      adminApprovalStatus: 'approved'
    });

    for (const user of approvedAdmins) {
      if (user.college) {
        const college = await College.findOne({ 
          $or: [{name: user.college}, {shortName: user.college}] 
        });
        if (college) {
          await Admin.findOneAndUpdate(
            { userId: user._id },
            { userId: user._id, collegeId: college._id },
            { upsert: true }
          );
          console.log(`✅ Linked Admin ${user.userId} to College ${college.name}`);
        }
      }
    }

    console.log('🎉 Migration COMPLETE!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();

