const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true,
    unique: true   // unique userid
  },
  email: {
    type: String,
    required: true,
    unique: true   // unique email
  },
  college: {
    type: String,
    required: false
  },
  phone: {
    type: String,
    default: ""
  },
  parentPhone: {
    type: String,
    default: ""
  },
  gender: {
    type: String,
    default: ""
  },
  dateOfBirth: {
    type: String,
    default: ""
  },
  location: {
    type: String,
    default: ""
  },
  department: {
    type: String,
    default: ""
  },
  departmentOther: {
    type: String,
    default: ""
  },
  currentClass: {
    type: String,
    default: ""
  },
  semester: {
    type: String,
    default: ""
  },
  currentCgpa: {
    type: String,
    default: ""
  },
  currentState: {
    type: String,
    default: ""
  },
  currentDistrict: {
    type: String,
    default: ""
  },
  currentCity: {
    type: String,
    default: ""
  },
  currentPincode: {
    type: String,
    default: ""
  },
  currentAddressLine: {
    type: String,
    default: ""
  },
  permanentState: {
    type: String,
    default: ""
  },
  permanentDistrict: {
    type: String,
    default: ""
  },
  permanentCity: {
    type: String,
    default: ""
  },
  permanentPincode: {
    type: String,
    default: ""
  },
  permanentAddressLine: {
    type: String,
    default: ""
  },
  profileImageUrl: {
    type: String,
    default: ""
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ["admin", "student", "college_admin"],
    default: "student"
  },
  adminApprovalStatus: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: function () {
      const role = (this.role || "").toLowerCase();
      return role === "college_admin" || role === "admin" ? "pending" : "approved";
    }
  },
  adminRejectionReason: {
    type: String,
    default: ""
  },
  adminReviewedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
