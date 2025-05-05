require('dotenv').config(); // Muat variabel dari .env
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const path = require('path');
const socketIo = require('socket.io');
const session = require('express-session');
const MongoStore = require('connect-mongo');

// Models
const User = require('./models/User');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = socketIo(server); // Integrasi Socket.IO dengan server HTTP

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

// --- Koneksi Database ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// --- Middleware ---
app.use(express.json()); // Untuk parsing JSON body
app.use(express.urlencoded({ extended: true })); // Untuk parsing URL-encoded body
app.use(express.static(path.join(__dirname, 'public'))); // Sajikan file statis

// --- Session Middleware ---
const sessionMiddleware = session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URI }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // 1 hari
        // secure: process.env.NODE_ENV === 'production', // Aktifkan di production (HTTPS)
        // httpOnly: true
    }
});
app.use(sessionMiddleware);

// Middleware untuk membuat session tersedia di Socket.IO
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// Middleware untuk cek otentikasi di route biasa
function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).redirect('/'); // Redirect ke login jika belum login
    }
    next();
}

// Middleware untuk cek otentikasi di Socket.IO
function requireSocketLogin(socket, next) {
    if (!socket.request.session || !socket.request.session.userId) {
        console.log('Socket authentication failed');
        return next(new Error('Authentication required'));
    }
    next();
}

// --- Routes ---

// Halaman Utama (Login/Register) - disajikan oleh express.static
// app.get('/', (req, res) => { ... }); // Tidak perlu jika index.html ada di public

// API Registrasi
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
        // Otomatis login setelah register
        req.session.userId = user._id;
        req.session.username = user.username;
        res.status(201).json({ message: 'Registrasi berhasil!', username: user.username });
    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({ message: 'Terjadi kesalahan server.' });
    }
});

// API Login
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

// API Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Logout error:", err);
            return res.status(500).json({ message: 'Gagal logout.' });
        }
        res.clearCookie('connect.sid'); // Hapus cookie session
        res.status(200).json({ message: 'Logout berhasil.' });
    });
});

// Halaman NGL Publik Pengguna
app.get('/ngl/:username', async (req, res) => {
    const username = req.params.username.toLowerCase();
    try {
        const userExists = await User.exists({ username: username });
        if (!userExists) {
            return res.status(404).send('Pengguna tidak ditemukan');
        }
        // Sajikan file HTML, nanti JS di frontend akan ambil username dari URL
        res.sendFile(path.join(__dirname, 'public', 'profile.html'));
    } catch (error) {
        console.error("Error finding user profile:", error);
        res.status(500).send('Terjadi kesalahan server.');
    }
});

// API Kirim Pesan Anonim
app.post('/api/messages/:username', async (req, res) => {
    const recipientUsername = req.params.username.toLowerCase();
    const { content } = req.body;

    if (!content || content.trim() === '') {
        return res.status(400).json({ message: 'Pesan tidak boleh kosong.' });
    }

    try {
        // Pastikan penerima ada
        const recipient = await User.findOne({ username: recipientUsername });
        if (!recipient) {
            return res.status(404).json({ message: 'Pengguna penerima tidak ditemukan.' });
        }

        const message = new Message({
            recipientUsername: recipient.username, // Simpan username penerima
            content: content.trim()
            // Tidak ada informasi pengirim!
        });
        await message.save();

        // Kirim notifikasi real-time ke penerima JIKA dia sedang online
        // Nama room = username penerima
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

// Halaman Inbox (membutuhkan login)
app.get('/inbox', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'inbox.html'));
});

// API Get My Messages (membutuhkan login)
app.get('/api/my-messages', requireLogin, async (req, res) => {
    try {
        const messages = await Message.find({ recipientUsername: req.session.username })
                                      .sort({ createdAt: -1 }); // Urutkan terbaru dulu
        res.status(200).json(messages);
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ message: 'Gagal mengambil pesan.' });
    }
});

// API Get My Profile Info (username)
app.get('/api/me', requireLogin, (req, res) => {
    res.json({ username: req.session.username });
});


// --- Socket.IO Logic ---
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Gunakan middleware untuk memastikan user login sebelum join room
    requireSocketLogin(socket, (err) => {
        if (err) {
            console.log(`Socket ${socket.id} disconnected due to auth error.`);
            socket.disconnect(true); // Putuskan koneksi jika tidak terautentikasi
            return;
        }

        const username = socket.request.session.username;
        if (username) {
            // Bergabung ke room pribadi berdasarkan username
            socket.join(username);
            console.log(`User ${username} (${socket.id}) joined room ${username}`);
        } else {
            console.log(`Socket ${socket.id} connected but no username in session.`);
            // Mungkin perlu penanganan lebih lanjut atau biarkan saja
        }
    });


    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Tidak perlu leave room secara eksplisit, Socket.IO menangani ini
    });

    // Bisa tambahkan event lain jika perlu
});


// --- Start Server ---
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});