const User = require("../models/User");

exports.getMyProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Not authorized" });

    const user = await User.findById(userId).select("-password -__v");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.updateMyProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Not authorized" });

    const { name, email, phone, location, department, profileImageUrl } = req.body || {};

    if (email) {
      const existing = await User.findOne({ email, _id: { $ne: userId } });
      if (existing) {
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    const update = {
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(location !== undefined ? { location } : {}),
      ...(department !== undefined ? { department } : {}),
      ...(profileImageUrl !== undefined ? { profileImageUrl } : {})
    };

    const user = await User.findByIdAndUpdate(userId, update, {
      new: true,
      runValidators: true
    }).select("-password -__v");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};
