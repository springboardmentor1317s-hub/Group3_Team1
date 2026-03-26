const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  college: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    default: ''
  },
  currentAddress: {
    line1: { type: String, default: '' },
    line2: { type: String, default: '' },
    pincode: { type: String, default: '' },
    country: { type: String, default: 'India' },
    state: { type: String, default: '' },
    district: { type: String, default: '' },
    townVillage: { type: String, default: '' }
  },
  permanentAddress: {
    line1: { type: String, default: '' },
    line2: { type: String, default: '' },
    pincode: { type: String, default: '' },
    country: { type: String, default: 'India' },
    state: { type: String, default: '' },
    district: { type: String, default: '' },
    townVillage: { type: String, default: '' },
    sameAsCurrent: { type: Boolean, default: false }
  },
  department: { type: String, default: '' },
  course: { type: String, default: '' },
  year: { type: String, default: '' },
  semester: { type: String, default: '' },
  heardFrom: { type: String, default: '' },
  location: {
    type: String,
    default: ''
  },
  profileImageUrl: {
    type: String,
    default: ''
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
    default: ''
  },
  adminReviewedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
