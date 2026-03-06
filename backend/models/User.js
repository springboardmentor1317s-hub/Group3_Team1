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
