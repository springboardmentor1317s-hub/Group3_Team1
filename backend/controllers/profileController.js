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

    const updateData = req.body || {};

    // Email uniqueness check (if provided)
    if (updateData.email !== undefined) {
      const existing = await User.findOne({ email: updateData.email, _id: { $ne: userId } });
      if (existing) {
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    // Supported fields for update
    const allowedFields = [
      'name', 'college', 'phone', 
      'currentAddress', 'permanentAddress', 
      'department', 'course', 'year', 'semester', 'heardFrom'
    ];

    const update = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        update[field] = updateData[field];
      }
    });

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
