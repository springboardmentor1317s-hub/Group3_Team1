const User = require("../models/User");
const StudentProfileDetails = require("../models/StudentProfileDetails");
const { buildMergedStudentProfile } = require("../utils/studentProfile");

exports.getMyProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Not authorized" });

    const user = await User.findById(userId).select("-password -__v");
    if (!user) return res.status(404).json({ message: "User not found" });

    const details = await StudentProfileDetails.findOne({ user: userId }).lean();

    res.json(buildMergedStudentProfile(user, details));
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
      parentPhone,
      gender,
      dateOfBirth,
      location,
      department,
      departmentOther,
      currentClass,
      semester,
      currentCgpa,
      currentState,
      currentDistrict,
      currentCity,
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

    const userUpdate = {
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(college !== undefined ? { college } : {}),
      ...(profileImageUrl !== undefined ? { profileImageUrl } : {})
    };

    const user = await User.findByIdAndUpdate(userId, userUpdate, {
      new: true,
      runValidators: true
    }).select("-password -__v");

    if (!user) return res.status(404).json({ message: "User not found" });

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
        new: true,
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
