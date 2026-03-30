const mongoose = require("mongoose");

const studentProfileDetailsSchema = new mongoose.Schema({
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
  gender: {
    type: String,
    default: ""
  },
  dateOfBirth: {
    type: String,
    default: ""
  },
  phone: {
    type: String,
    default: ""
  },
  location: {
    type: String,
    default: ""
  },
  parentPhone: {
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
  }
}, { timestamps: true });

module.exports = mongoose.model("StudentProfileDetails", studentProfileDetailsSchema);
