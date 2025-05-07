// routes/api.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const User = require('../models/user');
const Message = require('../models/message');
const Poll = require('../models/poll');
const { sendPasswordResetEmail } = require('../utils/mailer');
const upload = require('../middleware/multer');
const cloudinaryBase = require('../config/cloudinary'); // Impor base object
const cloudinary = cloudinaryBase.v2; // Akses v2 API
const dataUri = require('../utils/datauri');
const storyRoutes = require('./storyRoutes');

const userSockets = new Map();

const addUserSocket = (userId, socketId) => {
    userSockets.set(userId, socketId);
};
const removeUserSocket = (userId) => {
    if (userSockets.has(userId)) {
        userSockets.delete(userId);
    }
};
const findSocketIdByUserId = (userId) => {
    return userSockets.get(userId);
};
const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Autentikasi diperlukan' });
};

const messageLimiter = rateLimit({
	windowMs: 2 * 60 * 60 * 1000,
	max: 10,
	message: { message: 'Terlalu banyak percobaan mengirim pesan dari IP ini, silakan coba lagi setelah 2 jam.' },
	standardHeaders: true,
	legacyHeaders: false,
    handler: (req, res, next, options) => {
        res.status(options.statusCode).json(options.message);
    }
});

router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Username, email, dan password diperlukan.' });
    }
    try {
        const existingUser = await User.findOne({ $or: [ { username: username.toLowerCase() }, { email: email.toLowerCase() }] });
        if (existingUser) {
            let message = (existingUser.username === username.toLowerCase()) ? 'Username sudah digunakan.' : 'Email sudah terdaftar.';
            return res.status(400).json({ message: message });
        }
        const newUser = new User({ username: username.toLowerCase(), email: email.toLowerCase(), password: password });
        await newUser.save();
        req.logIn(newUser, (err) => {
            if (err) {
                console.error("Login setelah registrasi error:", err);
                return res.status(500).json({ message: 'Registrasi berhasil, tetapi login otomatis gagal.' });
            }
            return res.status(201).json({ message: 'Registrasi berhasil!', user: { id: newUser.id, username: newUser.username }, newUser: true });
        });
    } catch (error) {
        console.error("Register error:", error);
        if (error.name === 'ValidationError') {
            const firstError = Object.values(error.errors)[0].message;
            return res.status(400).json({ message: firstError });
        }
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Username atau Email sudah digunakan.' });
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
        if (err) {
            return next(err);
        }
        req.session.destroy((err) => {
            // Handle error, but proceed
            if (userId) {
                removeUserSocket(userId);
            }
            res.clearCookie('connect.sid');
            res.json({ message: 'Logout berhasil!' });
        });
    });
});

router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: 'Masukkan alamat email Anda.' });
    }
    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.json({ message: 'Jika email terdaftar, link reset password telah dikirim.' });
        }
        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000;
        await user.save();
        const emailSent = await sendPasswordResetEmail(user.email, token);
        if (emailSent) {
            res.json({ message: 'Jika email terdaftar, link reset password telah dikirim.' });
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
            email: req.user.email,
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
    // Pastikan cloudinary sudah terdefinisi sebelum blok try
    if (!cloudinary || !cloudinary.uploader) {
         console.error("Cloudinary object or uploader is undefined before avatar upload.");
         return res.status(500).json({ message: 'Konfigurasi Cloudinary bermasalah.' });
    }
    try {
        const fileStr = dataUri(req.file).content;
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'User tidak ditemukan.' });
        }
        if (user.profilePicturePublicId) {
            try {
                await cloudinary.uploader.destroy(user.profilePicturePublicId);
            } catch (deleteError) {
                console.warn("Gagal menghapus avatar lama:", deleteError.message);
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
         if (error.message && error.message.includes("Invalid file object")) {
             return res.status(400).json({ message: 'Terjadi masalah saat memproses file gambar.' });
        }
        res.status(500).json({ message: 'Gagal mengupload avatar.' });
    }
});

router.get('/my-messages', ensureAuthenticated, async (req, res) => {
    try {
        const messages = await Message.find({ recipient: req.user._id }).sort({ createdAt: -1 });
        res.json(messages);
    } catch (error) {
        console.error("Fetch messages error:", error);
        res.status(500).json({ message: 'Gagal mengambil pesan.' });
    }
});

router.post('/messages/:username', messageLimiter, async (req, res) => {
    const { username } = req.params;
    const { content } = req.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ message: 'Konten pesan tidak boleh kosong.' });
    }
    if (content.length > 1000) {
        return res.status(400).json({ message: 'Pesan terlalu panjang.' });
    }
    try {
        const recipientUser = await User.findOne({ username: username.toLowerCase() });
        if (!recipientUser) {
            return res.status(404).json({ message: 'User penerima tidak ditemukan.' });
        }
        const newMessage = new Message({ recipient: recipientUser._id, content: content.trim(), isRead: false });
        const savedMessage = await newMessage.save();
        const io = req.app.get('socketio');
        const recipientSocketId = findSocketIdByUserId(recipientUser._id.toString());
        if (io && recipientSocketId) {
            try {
                const unreadCount = await Message.countDocuments({ recipient: recipientUser._id, isRead: false });
                io.to(recipientSocketId).emit('new_message', savedMessage.toObject ? savedMessage.toObject() : savedMessage);
                io.to(recipientSocketId).emit('update_unread_count', { unreadCount });
            } catch (socketError) {
                console.error("Error emitting socket for new message:", socketError);
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
                console.error("Error emitting socket for unread count update:", socketError);
            }
        }
        res.status(204).send();
    } catch (error) {
        console.error("Mark read error:", error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ message: 'Format ID pesan tidak valid.' });
        }
        res.status(500).json({ message: 'Gagal menandai pesan dibaca.' });
    }
});

router.delete('/my-messages/all', ensureAuthenticated, async (req, res) => {
    try {
        const userId = req.user._id;
        const deleteResult = await Message.deleteMany({ recipient: userId });
        const io = req.app.get('socketio');
        const userSocketId = findSocketIdByUserId(req.user._id.toString());
        if (io && userSocketId) {
            try {
                io.to(userSocketId).emit('update_unread_count', { unreadCount: 0 });
                io.to(userSocketId).emit('messages_cleared');
            } catch(socketError) {
                console.error("Error emitting socket for messages cleared:", socketError);
            }
        }
        res.status(200).json({ message: `Berhasil menghapus ${deleteResult.deletedCount} pesan.` });
    } catch (error) {
        console.error("Delete all messages error:", error);
        res.status(500).json({ message: 'Gagal menghapus semua pesan.' });
    }
});

router.post('/polls', ensureAuthenticated, async (req, res) => {
    const { question, options } = req.body;
    if (!question || !options || !Array.isArray(options) || options.length < 2) {
        return res.status(400).json({ message: 'Pertanyaan dan minimal 2 opsi diperlukan.' });
    }
    const sanitizedOptions = options
        .map(opt => ({ text: String(opt || '').trim().substring(0, 100) }))
        .filter(opt => opt.text.length > 0);
    if (sanitizedOptions.length < 2) {
        return res.status(400).json({ message: 'Minimal 2 opsi yang valid diperlukan.' });
    }
    try {
        const newPoll = new Poll({
            creator: req.user._id,
            question: question.trim().substring(0, 280),
            options: sanitizedOptions
        });
        await newPoll.save();
        res.status(201).json(newPoll);
    } catch (error) {
        console.error("Create poll error:", error);
        if (error.name === 'ValidationError') {
            const firstError = Object.values(error.errors)[0].message;
            return res.status(400).json({ message: firstError });
        }
        res.status(500).json({ message: 'Gagal membuat polling.' });
    }
});

router.get('/my-polls', ensureAuthenticated, async (req, res) => {
    try {
        const polls = await Poll.find({ creator: req.user._id }).sort({ createdAt: -1 });
        res.json(polls);
    } catch (error) {
        console.error("Fetch my polls error:", error);
        res.status(500).json({ message: 'Gagal mengambil data polling.' });
    }
});

router.get('/polls/active/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username.toLowerCase() });
        if (!user) {
            return res.status(404).json({ message: 'User tidak ditemukan.' });
        }
        const activePolls = await Poll.find({ creator: user._id, isActive: true })
            .sort({ createdAt: -1 })
            .select('question options._id options.text _id createdAt isActive');
        res.json(activePolls);
    } catch (error) {
        console.error("Fetch active polls error:", error);
        res.status(500).json({ message: 'Gagal mengambil polling aktif.' });
    }
});

router.post('/polls/:pollId/vote', async (req, res) => {
    const { pollId } = req.params;
    const { optionIndex } = req.body;
    const ip = req.ip || req.connection?.remoteAddress;
    const voterIdentifier = ip ? crypto.createHash('sha256').update(ip + (process.env.VOTE_SALT || 'default_salt')).digest('hex') : null;
    if (optionIndex === undefined || optionIndex === null || !voterIdentifier) {
        return res.status(400).json({ message: 'Opsi tidak valid atau identifier pemilih tidak ditemukan.' });
    }
    try {
        const poll = await Poll.findById(pollId);
        if (!poll || !poll.isActive) {
            return res.status(404).json({ message: 'Polling tidak ditemukan atau tidak aktif.' });
        }
        if (optionIndex < 0 || optionIndex >= poll.options.length) {
            return res.status(400).json({ message: 'Opsi yang dipilih tidak valid.' });
        }
        const alreadyVoted = poll.voters.some(voter => voter.identifier === voterIdentifier);
        if (alreadyVoted) {
            return res.status(403).json({ message: 'Anda sudah memberikan suara untuk polling ini.' });
        }
        poll.options[optionIndex].votes += 1;
        poll.voters.push({ identifier: voterIdentifier });
        await poll.save();
        res.json({ message: 'Suara berhasil direkam!' });
    } catch (error) {
        console.error("Vote poll error:", error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ message: 'Format ID polling tidak valid.' });
        }
        res.status(500).json({ message: 'Gagal merekam suara.' });
    }
});

router.delete('/polls/:pollId', ensureAuthenticated, async (req, res) => {
    try {
        const poll = await Poll.findOneAndDelete({ _id: req.params.pollId, creator: req.user._id });
        if (!poll) {
            return res.status(404).json({ message: 'Polling tidak ditemukan atau Anda tidak berhak menghapusnya.' });
        }
        res.status(200).json({ message: 'Polling berhasil dihapus.' });
    } catch (error) {
        console.error("Delete poll error:", error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ message: 'Format ID polling tidak valid.' });
        }
        res.status(500).json({ message: 'Gagal menghapus polling.' });
    }
});

router.put('/polls/:pollId/toggle', ensureAuthenticated, async (req, res) => {
    try {
        const poll = await Poll.findOne({ _id: req.params.pollId, creator: req.user._id });
        if (!poll) {
            return res.status(404).json({ message: 'Polling tidak ditemukan atau Anda tidak berhak mengubahnya.' });
        }
        poll.isActive = !poll.isActive;
        await poll.save();
        res.json({ message: `Polling ${poll.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`, poll });
    } catch (error) {
        console.error("Toggle poll error:", error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ message: 'Format ID polling tidak valid.' });
        }
        res.status(500).json({ message: 'Gagal mengubah status polling.' });
    }
});

router.use('/stories', storyRoutes);

module.exports = {
    router,
    addUserSocket,
    removeUserSocket,
    findSocketIdByUserId
};