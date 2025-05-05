require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const path = require('path');
const socketIo = require('socket.io');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const fs = require('fs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const DatauriParser = require('datauri/parser');

const User = require('./models/user');
const Message = require('./models/message');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {});

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const parser = new DatauriParser();

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const sessionMiddleware = session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24, /* secure: true, httpOnly: true, sameSite: 'lax' */ }
});
app.use(sessionMiddleware);

io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

function requireLogin(req, res, next) {
    if (!req.session.userId) {
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
             return res.status(401).json({ message: 'Authentication required.' });
        } else {
             return res.status(401).redirect('/');
        }
    }
    next();
}

function requireSocketLogin(socket, next) {
    if (!socket.request.session || !socket.request.session.userId) {
        return next(new Error('Authentication required'));
    }
    next();
}

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username dan password diperlukan.' });
    }
    try {
        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({ message: 'Username sudah digunakan.' });
        }
        const user = new User({ username, password });
        await user.save();
        req.session.userId = user._id;
        req.session.username = user.username;
        res.status(201).json({ message: 'Registrasi berhasil!', username: user.username });
    } catch (error) {
        res.status(500).json({ message: 'Terjadi kesalahan server.' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username dan password diperlukan.' });
    }
    try {
        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user) {
            return res.status(401).json({ message: 'Username tidak ditemukan.' });
        }
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Password salah.' });
        }
        req.session.userId = user._id;
        req.session.username = user.username;
        res.status(200).json({ message: 'Login berhasil!', username: user.username });
    } catch (error) {
        res.status(500).json({ message: 'Terjadi kesalahan server.' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) { return res.status(500).json({ message: 'Gagal logout.' }); }
        res.clearCookie('connect.sid');
        res.status(200).json({ message: 'Logout berhasil.' });
    });
});

app.get('/api/me', requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).select('username prompt profilePictureUrl');
        if (!user) {
            req.session.destroy();
            return res.status(401).json({ message: 'User not found, session cleared.' });
        }
        res.json({
            username: user.username,
            prompt: user.prompt,
            profilePictureUrl: user.profilePictureUrl
        });
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengambil data user.' });
    }
});

app.put('/api/me/prompt', requireLogin, async (req, res) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return res.status(400).json({ message: 'Prompt tidak boleh kosong.' });
    }
    const maxPromptLength = 100;
     if (prompt.trim().length > maxPromptLength) {
        return res.status(400).json({ message: `Prompt tidak boleh lebih dari ${maxPromptLength} karakter.` });
     }
    try {
        const user = await User.findByIdAndUpdate(
            req.session.userId,
            { prompt: prompt.trim() },
            { new: true } // Mengembalikan dokumen yang sudah diupdate
        ).select('prompt');

        if (!user) { return res.status(404).json({ message: 'User tidak ditemukan.' }); }
        res.status(200).json({ message: 'Prompt berhasil diperbarui.', newPrompt: user.prompt });
    } catch (error) {
        res.status(500).json({ message: 'Gagal memperbarui prompt.' });
    }
});

app.post('/api/me/avatar', requireLogin, upload.single('avatar'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Tidak ada file yang diupload.' });
    }
    try {
        const fileFormat = path.extname(req.file.originalname).toString();
        const { content } = parser.format(fileFormat, req.file.buffer);

        const result = await cloudinary.uploader.upload(content, {
            folder: "ngl_clone_avatars", // Opsional: folder di Cloudinary
            // Tambahkan transformasi jika perlu (misal resize, crop)
             transformation: [{ width: 150, height: 150, crop: "fill", gravity: "face" }]
        });

        const user = await User.findByIdAndUpdate(
            req.session.userId,
            { profilePictureUrl: result.secure_url },
            { new: true }
        ).select('profilePictureUrl');

        if (!user) { return res.status(404).json({ message: 'User tidak ditemukan.' }); }

        res.json({ message: 'Avatar berhasil diperbarui.', newAvatarUrl: user.profilePictureUrl });

    } catch (error) {
        console.error("Avatar upload error:", error);
        res.status(500).json({ message: 'Gagal mengupload avatar.' });
    }
});


app.post('/api/messages/:username', async (req, res) => {
    const recipientUsername = req.params.username.toLowerCase();
    const { content } = req.body;
    if (!content || content.trim() === '') {
        return res.status(400).json({ message: 'Pesan tidak boleh kosong.' });
    }
    try {
        const recipient = await User.findOne({ username: recipientUsername });
        if (!recipient) { return res.status(404).json({ message: 'Pengguna penerima tidak ditemukan.' }); }
        const message = new Message({ recipientUsername: recipient.username, content: content.trim() });
        await message.save();
        io.to(recipient.username).emit('new_message', {
            _id: message._id, content: message.content, createdAt: message.createdAt
        });
        res.status(201).json({ message: 'Pesan anonim berhasil dikirim!' });
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengirim pesan.' });
    }
});

app.get('/inbox', requireLogin, (req, res) => {
    res.sendFile(path.resolve(__dirname, 'public', 'inbox.html'));
});

app.get('/ngl/:username', async (req, res) => {
    const reqUsername = req.params.username.toLowerCase();
    const profileHtmlPath = path.resolve(__dirname, 'public', 'profile.html');
    try {
        const user = await User.findOne({ username: reqUsername }).select('username prompt profilePictureUrl');
        if (!user) { return res.status(404).send('Pengguna tidak ditemukan'); }

        fs.readFile(profileHtmlPath, 'utf8', (err, htmlData) => {
            if (err) { return res.status(500).send('Terjadi kesalahan server saat membaca file.'); }

            let modifiedHtml = htmlData
                .replace(/{{USERNAME}}/g, user.username)
                .replace(/{{PROMPT_TEXT}}/g, user.prompt || "kirimi saya pesan gabut anda")
                .replace(/{{AVATAR_URL}}/g, user.profilePictureUrl || "https://via.placeholder.com/40");

             // Mengganti title secara dinamis tetap diperlukan untuk tab browser
             const pageTitle = `Kirimkan pesan anonim ke ${user.username}`;
             modifiedHtml = modifiedHtml.replace(/<title>.*?<\/title>/, `<title>${pageTitle}</title>`);

            res.setHeader('Content-Type', 'text/html');
            res.send(modifiedHtml);
        });
    } catch (error) {
        res.status(500).send('Terjadi kesalahan server.');
    }
});

app.get('/api/my-messages', requireLogin, async (req, res) => {
    try {
        const messages = await Message.find({ recipientUsername: req.session.username }).sort({ createdAt: -1 });
        res.status(200).json(messages);
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengambil pesan.' });
    }
});

io.on('connection', (socket) => {
    requireSocketLogin(socket, (err) => {
        if (err) { socket.disconnect(true); return; }
        const username = socket.request.session.username;
        if (username) { socket.join(username); }
    });
    socket.on('disconnect', () => {});
});

module.exports = { app, server, io };

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running locally on http://localhost:${PORT}`);
  });
}