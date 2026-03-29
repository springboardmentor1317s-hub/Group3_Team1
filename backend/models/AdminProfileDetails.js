const mongoose = require("mongoose");

const adminProfileDetailsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    index: true
  },
  phone: {
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
  }
}, { timestamps: true });

module.exports = mongoose.model("AdminProfileDetails", adminProfileDetailsSchema);
