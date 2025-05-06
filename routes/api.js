const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const User = require('../models/user');
const Message = require('../models/message');
const { sendPasswordResetEmail } = require('../utils/mailer');
const upload = require('../middleware/multer');
const cloudinary = require('../config/cloudinary');
const dataUri = require('../utils/datauri');

const userSockets = new Map();

const addUserSocket = (userId, socketId) => {
    userSockets.set(userId, socketId);
    console.log(`Peta Soket Diperbarui: User ${userId} -> Soket ${socketId}`);
};

const removeUserSocket = (userId) => {
    if (userSockets.has(userId)) {
        userSockets.delete(userId);
        console.log(`Peta Soket Diperbarui: User ${userId} dihapus.`);
    }
};

const findSocketIdByUserId = (userId) => {
    return userSockets.get(userId);
};

const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Autentikasi diperlukan' });
};

router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username dan password diperlukan.' });
    }
    if (password.length < 6) {
         return res.status(400).json({ message: 'Password minimal 6 karakter.' });
    }
    try {
        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ message: 'Username sudah digunakan.' });
        }
        const newUser = new User({ username: username.toLowerCase(), password });
        await newUser.save();
        req.logIn(newUser, (err) => {
            if (err) {
                console.error("Login setelah registrasi error:", err);
                return res.status(500).json({ message: 'Registrasi berhasil, tetapi login otomatis gagal.' });
            }
            return res.status(201).json({ message: 'Registrasi berhasil!', user: { id: newUser.id, username: newUser.username } });
        });
    } catch (error) {
        console.error("Register error:", error);
        if (error.code === 11000) {
             return res.status(400).json({ message: 'Username sudah digunakan.' });
        }
        res.status(500).json({ message: 'Terjadi kesalahan server saat registrasi.' });
    }
});

router.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error("Login authentication error:", err);
            return next(err);
        }
        if (!user) {
            return res.status(401).json({ message: info?.message || 'Username atau password salah.' });
        }
        req.logIn(user, (err) => {
            if (err) {
                console.error("Login session error:", err);
                return next(err);
            }
            return res.json({ message: 'Login berhasil!', user: { id: user.id, username: user.username } });
        });
    })(req, res, next);
});

router.post('/logout', (req, res, next) => {
    const userId = req.user?._id?.toString();
    req.logout(function(err) {
        if (err) { return next(err); }
        req.session.destroy((err) => {
            if (err) {
                console.error("Session destruction error:", err);
            }
            if (userId) {
                 removeUserSocket(userId);
            }
            res.clearCookie('connect.sid'); // Sesuaikan nama cookie jika berbeda
            res.json({ message: 'Logout berhasil!' });
        });
    });
});

router.post('/forgot-password', async (req, res) => {
    const { emailOrUsername } = req.body;
    if (!emailOrUsername) {
        return res.status(400).json({ message: 'Masukkan username.' });
    }
    try {
        const user = await User.findOne({ username: emailOrUsername.toLowerCase() });
        if (!user) {
            console.log(`Percobaan reset password untuk user tidak ada: ${emailOrUsername}`);
            return res.json({ message: 'Jika akun terdaftar dengan email yang valid, link reset akan dikirim.' });
        }

        const userEmailToSendTo = user.email || user.username; // Sesuaikan logika ini jika perlu
        if (!userEmailToSendTo || !/\S+@\S+\.\S+/.test(userEmailToSendTo)) {
             console.log(`Percobaan reset password untuk user ${user.username} tanpa email valid.`);
             return res.json({ message: 'Jika akun terdaftar dengan email yang valid, link reset akan dikirim.' });
        }

        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000;
        await user.save();

        const emailSent = await sendPasswordResetEmail(userEmailToSendTo, token);

        if (emailSent) {
            res.json({ message: 'Jika akun terdaftar dengan email yang valid, link reset akan dikirim.' });
        } else {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save();
            res.status(500).json({ message: 'Gagal mengirim email reset. Coba lagi nanti.' });
        }
    } catch (error) {
        console.error("Forgot Password Error:", error);
        res.status(500).json({ message: 'Terjadi kesalahan server.' });
    }
});

router.post('/reset/:token', async (req, res) => {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword || password !== confirmPassword) {
        return res.status(400).json({ message: 'Password baru dan konfirmasi harus diisi dan cocok.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: 'Password minimal harus 6 karakter.' });
    }

    try {
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Token reset password tidak valid atau sudah kedaluwarsa.' });
        }

        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ message: 'Password berhasil direset. Silakan login.' });
    } catch (error) {
        console.error("Reset Password Error:", error);
        res.status(500).json({ message: 'Terjadi kesalahan saat mereset password.' });
    }
});

router.get('/me', ensureAuthenticated, async (req, res) => {
     try {
        const unreadCount = await Message.countDocuments({ recipient: req.user._id, isRead: false });
        res.json({
            _id: req.user._id,
            username: req.user.username,
            prompt: req.user.prompt,
            profilePictureUrl: req.user.profilePictureUrl,
            unreadCount: unreadCount
        });
     } catch (error) {
         console.error("Error fetching user /me data:", error);
         res.status(500).json({ message: "Gagal mengambil data pengguna." });
     }
});

router.put('/me/prompt', ensureAuthenticated, async (req, res) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0 || prompt.length > 100) {
        return res.status(400).json({ message: 'Prompt diperlukan (1-100 karakter).' });
    }
    try {
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { $set: { prompt: prompt.trim() } },
            { new: true, runValidators: true }
        );
        if (!updatedUser) {
            return res.status(404).json({ message: 'User tidak ditemukan.' });
        }
        res.json({ message: 'Prompt berhasil diperbarui!', newPrompt: updatedUser.prompt });
    } catch (error) {
        console.error("Prompt update error:", error);
        res.status(500).json({ message: 'Gagal memperbarui prompt.' });
    }
});

router.post('/me/avatar', ensureAuthenticated, upload.single('avatar'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Tidak ada file gambar yang diupload.' });
    }
    try {
        const fileStr = dataUri(req).content;
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'User tidak ditemukan.' });
        }

        if (user.profilePicturePublicId) {
            try {
                await cloudinary.uploader.destroy(user.profilePicturePublicId);
            } catch (deleteError) {
                 console.warn("Gagal menghapus avatar lama dari Cloudinary:", deleteError.message);
            }
        }

        const result = await cloudinary.uploader.upload(fileStr, {
            folder: "ngl_avatars",
            transformation: [{ width: 150, height: 150, crop: "fill", gravity: "face" }]
        });

        user.profilePictureUrl = result.secure_url;
        user.profilePicturePublicId = result.public_id;
        await user.save();

        res.json({ message: 'Avatar berhasil diperbarui!', newAvatarUrl: user.profilePictureUrl });

    } catch (error) {
        console.error("Avatar upload error:", error);
        res.status(500).json({ message: 'Gagal mengupload avatar. Pastikan format dan ukuran file sesuai.' });
    }
});

router.get('/my-messages', ensureAuthenticated, async (req, res) => {
    try {
        const messages = await Message.find({ recipient: req.user._id })
                                     .sort({ createdAt: -1 });
        res.json(messages);
    } catch (error) {
        console.error("Fetch messages error:", error);
        res.status(500).json({ message: 'Gagal mengambil pesan.' });
    }
});

router.post('/messages/:username', async (req, res) => {
    const { username } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ message: 'Konten pesan tidak boleh kosong.' });
    }
    if (content.length > 1000) {
        return res.status(400).json({ message: 'Pesan terlalu panjang (maks 1000 karakter).' });
    }

    try {
        const recipientUser = await User.findOne({ username: username.toLowerCase() });
        if (!recipientUser) {
            return res.status(404).json({ message: 'User penerima tidak ditemukan.' });
        }

        const newMessage = new Message({
            recipient: recipientUser._id,
            content: content.trim(),
            isRead: false
        });
        const savedMessage = await newMessage.save();

        const io = req.app.get('socketio');
        const recipientSocketId = findSocketIdByUserId(recipientUser._id.toString());

        if (io && recipientSocketId) {
             try {
                 const unreadCount = await Message.countDocuments({ recipient: recipientUser._id, isRead: false });
                 io.to(recipientSocketId).emit('new_message', savedMessage.toObject ? savedMessage.toObject() : savedMessage);
                 io.to(recipientSocketId).emit('update_unread_count', { unreadCount });
             } catch (socketError) {
                  console.error("Error emitting socket event for new message:", socketError);
             }
        }

        res.status(201).json({ message: 'Pesan berhasil dikirim!' });
    } catch (error) {
        console.error("Send message error:", error);
        res.status(500).json({ message: 'Gagal mengirim pesan.' });
    }
});

router.put('/messages/:messageId/read', ensureAuthenticated, async (req, res) => {
    try {
        const message = await Message.findOneAndUpdate(
            { _id: req.params.messageId, recipient: req.user._id, isRead: false },
            { $set: { isRead: true } },
            { new: false }
        );

        if (!message) {
            return res.status(204).send();
        }

        const io = req.app.get('socketio');
        const userSocketId = findSocketIdByUserId(req.user._id.toString());

        if (io && userSocketId) {
             try {
                const unreadCount = await Message.countDocuments({ recipient: req.user._id, isRead: false });
                io.to(userSocketId).emit('update_unread_count', { unreadCount });
             } catch(socketError) {
                console.error("Error emitting socket event after mark read:", socketError);
             }
         }

        res.status(204).send();
    } catch (error) {
        console.error("Mark message read error:", error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ message: 'Format ID pesan tidak valid.' });
        }
        res.status(500).json({ message: 'Gagal menandai pesan dibaca.' });
    }
});

module.exports = {
    router,
    addUserSocket,
    removeUserSocket,
    findSocketIdByUserId
};