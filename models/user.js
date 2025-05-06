const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: { type: String, required: [true, 'Username wajib diisi'], unique: true, trim: true, lowercase: true, index: true },
    email: { type: String, required: [true, 'Email wajib diisi'], unique: true, trim: true, lowercase: true, match: [/\S+@\S+\.\S+/, 'Format email tidak valid'], index: true },
    password: { type: String, required: [true, 'Password wajib diisi'], minlength: [6, 'Password minimal 6 karakter'] },
    prompt: { type: String, default: 'Kirimkan aku pesan anonim!', trim: true, maxlength: 100 },
    profilePictureUrl: { type: String, default: null },
    profilePicturePublicId: { type: String, default: null },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) { if (!this.isModified('password')) { return next(); } try { const salt = await bcrypt.genSalt(10); this.password = await bcrypt.hash(this.password, salt); next(); } catch (err) { next(err); } });
userSchema.methods.comparePassword = async function(candidatePassword) { try { return await bcrypt.compare(candidatePassword, this.password); } catch (err) { console.error("Error comparing password for user:", this.username, err); return false; } };

module.exports = mongoose.models.User || mongoose.model('User', userSchema);