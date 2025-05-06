const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, index: true },
    password: { type: String, required: true },
    prompt: { type: String, default: 'Kirimkan aku pesan anonim!', trim: true, maxlength: 100 },
    profilePictureUrl: { type: String, default: null },
    profilePicturePublicId: { type: String, default: null },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (err) {
        throw err;
    }
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);