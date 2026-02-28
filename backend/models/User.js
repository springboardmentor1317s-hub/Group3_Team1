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
<<<<<<< HEAD
    enum: ["student", "college_admin", "super_admin"],
=======
    enum: ["admin", "student", "college_admin"],
>>>>>>> main
    default: "student"
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
