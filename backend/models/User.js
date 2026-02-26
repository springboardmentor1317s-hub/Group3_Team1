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
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ["admin", "student"],
    default: "student"
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
