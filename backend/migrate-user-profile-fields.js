const mongoose = require("mongoose");
require("dotenv").config({ path: `${__dirname}/.env` });

const User = require("./models/User");
const StudentProfileDetails = require("./models/StudentProfileDetails");
const AdminProfileDetails = require("./models/AdminProfileDetails");

const USER_DEFAULTS = {
  college: "",
  phone: "",
  parentPhone: "",
  gender: "",
  dateOfBirth: "",
  location: "",
  department: "",
  departmentOther: "",
  currentClass: "",
  semester: "",
  currentCgpa: "",
  currentState: "",
  currentDistrict: "",
  currentCity: "",
  currentPincode: "",
  currentAddressLine: "",
  permanentState: "",
  permanentDistrict: "",
  permanentCity: "",
  permanentPincode: "",
  permanentAddressLine: "",
  profileImageUrl: "",
  adminApprovalStatus: "approved",
  adminRejectionReason: "",
  adminReviewedAt: null,
  isBlocked: false
};

async function run() {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000
  });

  const users = await User.find({}).lean();
  let updatedUsers = 0;
  let updatedStudentDetails = 0;
  let updatedAdminDetails = 0;

  for (const user of users) {
    const nextUserId = String(user.email || "").trim().toLowerCase();
    const update = {};

    for (const [key, fallback] of Object.entries(USER_DEFAULTS)) {
      if (user[key] === undefined) {
        update[key] = fallback;
      }
    }

    if (nextUserId && String(user.userId || "").trim().toLowerCase() !== nextUserId) {
      update.userId = nextUserId;
    }

    if (Object.keys(update).length > 0) {
      await User.updateOne({ _id: user._id }, { $set: update });
      updatedUsers += 1;
    }

    if (nextUserId) {
      const studentResult = await StudentProfileDetails.updateOne(
        { user: user._id },
        {
          $set: {
            userId: nextUserId,
            email: String(user.email || "").trim().toLowerCase()
          }
        }
      );
      if (studentResult.modifiedCount > 0) {
        updatedStudentDetails += 1;
      }

      const adminResult = await AdminProfileDetails.updateOne(
        { user: user._id },
        {
          $set: {
            userId: nextUserId,
            email: String(user.email || "").trim().toLowerCase()
          }
        }
      );
      if (adminResult.modifiedCount > 0) {
        updatedAdminDetails += 1;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        totalUsers: users.length,
        updatedUsers,
        updatedStudentDetails,
        updatedAdminDetails
      },
      null,
      2
    )
  );
}

run()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
