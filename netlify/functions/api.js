// File: netlify/functions/api.js
const serverless = require('serverless-http');
// Penting: Kita perlu mengimpor 'app' atau 'server' dari server.js
// Pastikan server.js mengekspor instance app atau server
// dan TIDAK memanggil listen() saat di-require di sini.
// Lihat modifikasi server.js di bawah.
const { app } = require('../../server'); // Sesuaikan path jika perlu

// Bungkus app Express dengan serverless-http
module.exports.handler = serverless(app);

// Catatan: Jika Socket.IO Anda sangat terikat dengan instance `server`
// dan serverless-http tidak menanganinya dengan baik, ini mungkin
// memerlukan pendekatan yang lebih kompleks atau library berbeda.
// serverless(server) mungkin bisa dicoba, tapi seringkali app lebih umum.