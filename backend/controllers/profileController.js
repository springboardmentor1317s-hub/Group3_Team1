const User = require("../models/User");
const StudentProfileDetails = require("../models/StudentProfileDetails");
const AdminProfileDetails = require("../models/AdminProfileDetails");
const { buildMergedStudentProfile } = require("../utils/studentProfile");
const { buildMergedAdminProfile, ensureAdminProfileDetails } = require("../utils/adminProfile");
const bcrypt = require("bcryptjs");

function isAdminRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "college_admin" || normalized === "admin";
}

exports.getMyProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Not authorized" });

    const user = await User.findById(userId).select("-password -__v");
    if (!user) return res.status(404).json({ message: "User not found" });

    const details = isAdminRole(user.role)
      ? await ensureAdminProfileDetails(user)
      : await StudentProfileDetails.findOne({ user: userId }).lean();

    res.json(isAdminRole(user.role)
      ? buildMergedAdminProfile(user, details)
      : buildMergedStudentProfile(user, details));
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.updateMyProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Not authorized" });

    const {
      name,
      email,
      college,
      phone,
      gender,
      dateOfBirth,
      parentPhone,
      location,
      department,
      departmentOther,
      currentState,
      currentDistrict,
      currentCity,
      currentClass,
      semester,
      currentCgpa,
      currentPincode,
      currentAddressLine,
      permanentState,
      permanentDistrict,
      permanentCity,
      permanentPincode,
      permanentAddressLine,
      profileImageUrl
    } = req.body || {};

    if (email) {
      const existing = await User.findOne({ email, _id: { $ne: userId } });
      if (existing) {
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    const user = await User.findById(userId).select("-password -__v");

    if (!user) return res.status(404).json({ message: "User not found" });

    if (!isAdminRole(user.role)) {
      if (name !== undefined) user.name = name;
      if (email !== undefined) user.email = email;
      if (college !== undefined) user.college = college;
    }
    if (profileImageUrl !== undefined) user.profileImageUrl = profileImageUrl;

    if (isAdminRole(user.role)) {
      if (phone !== undefined) user.phone = phone;
      if (location !== undefined) user.location = location;
      if (department !== undefined) user.department = department;
      if (departmentOther !== undefined) user.departmentOther = departmentOther;
    }

    await user.save();

    if (isAdminRole(user.role)) {
      let adminDetails = await AdminProfileDetails.findOne({ user: userId });
      if (!adminDetails) {
        adminDetails = new AdminProfileDetails({
          user: user._id,
          userId: user.userId,
          email: user.email
        });
      }

      adminDetails.user = user._id;
      adminDetails.userId = user.userId;
      adminDetails.email = user.email;
      if (phone !== undefined) adminDetails.phone = phone;
      if (dateOfBirth !== undefined) adminDetails.dateOfBirth = dateOfBirth;
      if (gender !== undefined) adminDetails.gender = gender;
      if (location !== undefined) adminDetails.location = location;
      if (currentState !== undefined) adminDetails.currentState = currentState;
      if (currentDistrict !== undefined) adminDetails.currentDistrict = currentDistrict;
      if (currentCity !== undefined) adminDetails.currentCity = currentCity;
      if (department !== undefined) adminDetails.department = department;
      if (departmentOther !== undefined) adminDetails.departmentOther = departmentOther;

      await adminDetails.save();

      const latestAdminDetails = await AdminProfileDetails.findOne({ user: userId }).lean();
      const latestUser = await User.findById(userId).select("-password -__v");
      return res.json(buildMergedAdminProfile(latestUser, latestAdminDetails));
    }

    const detailsUpdate = {
      user: user._id,
      userId: user.userId,
      email: user.email,
      ...(phone !== undefined ? { phone } : {}),
      ...(parentPhone !== undefined ? { parentPhone } : {}),
      ...(gender !== undefined ? { gender } : {}),
      ...(dateOfBirth !== undefined ? { dateOfBirth } : {}),
      ...(location !== undefined ? { location } : {}),
      ...(department !== undefined ? { department } : {}),
      ...(departmentOther !== undefined ? { departmentOther } : {}),
      ...(currentClass !== undefined ? { currentClass } : {}),
      ...(semester !== undefined ? { semester } : {}),
      ...(currentCgpa !== undefined ? { currentCgpa } : {}),
      ...(currentState !== undefined ? { currentState } : {}),
      ...(currentDistrict !== undefined ? { currentDistrict } : {}),
      ...(currentCity !== undefined ? { currentCity } : {}),
      ...(currentPincode !== undefined ? { currentPincode } : {}),
      ...(currentAddressLine !== undefined ? { currentAddressLine } : {}),
      ...(permanentState !== undefined ? { permanentState } : {}),
      ...(permanentDistrict !== undefined ? { permanentDistrict } : {}),
      ...(permanentCity !== undefined ? { permanentCity } : {}),
      ...(permanentPincode !== undefined ? { permanentPincode } : {}),
      ...(permanentAddressLine !== undefined ? { permanentAddressLine } : {})
    };

    const details = await StudentProfileDetails.findOneAndUpdate(
      { user: userId },
      detailsUpdate,
      {
        returnDocument: "after",
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true
      }
    ).lean();

    res.json(buildMergedStudentProfile(user, details));
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.changeMyPassword = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Not authorized" });

    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "All password fields are required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters long." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New password and confirm password must match." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ message: "New password must be different from the current password." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password updated successfully." });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};
