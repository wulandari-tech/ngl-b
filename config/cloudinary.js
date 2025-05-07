// config/cloudinary.js (Contoh)
const cloudinary = require('cloudinary'); // Impor library Cloudinary
require('dotenv').config(); // Pastikan variabel environment dimuat

// Konfigurasi Cloudinary menggunakan environment variables
cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true // Optional: Selalu gunakan HTTPS untuk URL
});

// --- PENTING: Ekspor objek cloudinary ---
module.exports = cloudinary;