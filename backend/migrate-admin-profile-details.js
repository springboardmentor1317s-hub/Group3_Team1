require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const StudentProfileDetails = require("./models/StudentProfileDetails");
const AdminProfileDetails = require("./models/AdminProfileDetails");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const adminUsers = await User.find({
    role: { $in: ["college_admin", "admin"] }
  }).lean();

  let migratedCount = 0;
  let removedLegacyCount = 0;

  for (const user of adminUsers) {
    const legacyStudentDetails = await StudentProfileDetails.findOne({ user: user._id }).lean();

    await AdminProfileDetails.findOneAndUpdate(
      { user: user._id },
      {
        user: user._id,
        userId: user.userId,
        email: user.email,
        phone: legacyStudentDetails?.phone || user.phone || "",
        location: legacyStudentDetails?.location || user.location || "",
        department: legacyStudentDetails?.department || user.department || "",
        departmentOther: legacyStudentDetails?.departmentOther || user.departmentOther || ""
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    migratedCount += 1;

    if (legacyStudentDetails) {
      await StudentProfileDetails.deleteOne({ _id: legacyStudentDetails._id });
      removedLegacyCount += 1;
    }
  }

  console.log(`Migrated admin profile records: ${migratedCount}`);
  console.log(`Removed legacy admin student-profile records: ${removedLegacyCount}`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("Admin profile migration failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
