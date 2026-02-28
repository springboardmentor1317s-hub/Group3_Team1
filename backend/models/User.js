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
    enum: ["student", "college_admin", "super_admin"],
    default: "student"
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
