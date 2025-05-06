const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const mongoose = require('mongoose');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
require('dotenv').config();
require('./config/passport'); // Sesuaikan path jika perlu

const api = require('./routes/api'); // Sesuaikan path jika perlu
const apiRouter = api.router;
const { addUserSocket, removeUserSocket } = api;
const User = require('./models/user'); // Sesuaikan path jika perlu
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 hari
        // secure: process.env.NODE_ENV === 'production', // Aktifkan di production
    }
});
app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());

io.use((socket, next) => {
    sessionMiddleware(socket.request, socket.request.res || {}, next);
});

app.use((req, res, next) => {
    req.app.set('socketio', io);
    next();
});

app.use('/api', apiRouter);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/inbox', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'inbox.html'));
});

app.get('/ngl/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) {
            return res.status(404).type('text/plain').send('User tidak ditemukan');
        }

        const profileHtmlPath = path.join(__dirname, 'public', 'profile.html');
        fs.readFile(profileHtmlPath, 'utf8', (err, htmlContent) => {
            if (err) {
                console.error("Error reading profile.html:", err);
                return res.status(500).type('text/plain').send('Internal Server Error');
            }

            let finalHtml = htmlContent
                .replace(/{{USERNAME}}/g, user.username)
                .replace(/{{PROMPT_TEXT}}/g, user.prompt || 'Kirimkan aku pesan anonim!')
                .replace(/{{AVATAR_URL}}/g, user.profilePictureUrl || 'https://via.placeholder.com/40');

            res.type('html').send(finalHtml);
        });
    } catch (error) {
        console.error("Error serving profile page:", error);
        res.status(500).type('text/plain').send('Internal Server Error');
    }
});

app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

io.on('connection', (socket) => {
    const session = socket.request.session;
    const userId = session?.passport?.user;
    console.log(`Socket terhubung: ${socket.id}, SessionID: ${session?.id}, UserID: ${userId || 'N/A'}`);

    if (userId) {
        addUserSocket(userId.toString(), socket.id);
    }

    socket.on('disconnect', (reason) => {
        console.log(`Socket terputus: ${socket.id}, Alasan: ${reason}`);
        if (userId) {
            removeUserSocket(userId.toString());
        }
    });
});

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB Terhubung'))
    .catch(err => console.error('Error Koneksi MongoDB:', err));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));