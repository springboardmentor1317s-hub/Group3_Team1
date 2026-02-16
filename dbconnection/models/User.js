const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  college: { type: String },
  role: { type: String, default: 'student' },
  password: { type: String, required: true }
}, {
  timestamps: true
});


userSchema.pre('save', async function() {
  if (!this.isModified('password')) return; // only hash if password changed
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

const User = mongoose.model('User', userSchema);
module.exports = User;
