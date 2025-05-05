// File: server.js (Bersih tanpa komentar, modifikasi untuk Netlify)

require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const path = require('path');
const socketIo = require('socket.io');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const User = require('./models/User');
const Message = require('./models/Message');
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {});

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

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
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        // secure: true, // Aktifkan jika di HTTPS
        // httpOnly: true,
        // sameSite: 'lax'
    }
});
app.use(sessionMiddleware);

io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).redirect('/');
    }
    next();
}

function requireSocketLogin(socket, next) {
    if (!socket.request.session || !socket.request.session.userId) {
        console.log('Socket authentication failed');
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
        console.error("Register error:", error);
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
        console.error("Login error:", error);
        res.status(500).json({ message: 'Terjadi kesalahan server.' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Logout error:", err);
            return res.status(500).json({ message: 'Gagal logout.' });
        }
        res.clearCookie('connect.sid');
        res.status(200).json({ message: 'Logout berhasil.' });
    });
});

app.get('/ngl/:username', async (req, res) => {
    const username = req.params.username.toLowerCase();
    try {
        const userExists = await User.exists({ username: username });
        if (!userExists) {
            return res.status(404).send('Pengguna tidak ditemukan');
        }
        res.sendFile(path.resolve(__dirname, 'public', 'profile.html'));
    } catch (error) {
        console.error("Error finding user profile:", error);
        res.status(500).send('Terjadi kesalahan server.');
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
        if (!recipient) {
            return res.status(404).json({ message: 'Pengguna penerima tidak ditemukan.' });
        }

        const message = new Message({
            recipientUsername: recipient.username,
            content: content.trim()
        });
        await message.save();

        io.to(recipient.username).emit('new_message', {
            _id: message._id,
            content: message.content,
            createdAt: message.createdAt
        });

        res.status(201).json({ message: 'Pesan anonim berhasil dikirim!' });

    } catch (error) {
        console.error("Error sending message:", error);
        res.status(500).json({ message: 'Gagal mengirim pesan.' });
    }
});

app.get('/inbox', requireLogin, (req, res) => {
    res.sendFile(path.resolve(__dirname, 'public', 'inbox.html'));
});

app.get('/api/my-messages', requireLogin, async (req, res) => {
    try {
        const messages = await Message.find({ recipientUsername: req.session.username })
                                      .sort({ createdAt: -1 });
        res.status(200).json(messages);
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ message: 'Gagal mengambil pesan.' });
    }
});

app.get('/api/me', requireLogin, (req, res) => {
    if (req.session.username) {
        res.json({ username: req.session.username });
    } else {
        res.status(404).json({ message: 'User info not found in session' });
    }
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    requireSocketLogin(socket, (err) => {
        if (err) {
            console.log(`Socket ${socket.id} disconnected due to auth error.`);
            socket.disconnect(true);
            return;
        }

        const username = socket.request.session.username;
        if (username) {
            socket.join(username);
            console.log(`User ${username} (${socket.id}) joined room ${username}`);
        } else {
            console.log(`Socket ${socket.id} connected but no username in session.`);
        }
    });


    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

module.exports = { app, server, io };

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running locally on http://localhost:${PORT}`);
  });
}