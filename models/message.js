// models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    // Field ini yang seharusnya ada dan wajib, menyimpan ObjectId dari User
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Mereferensikan model 'User'
        required: true,
        index: true // Index untuk query lebih cepat
    },
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000 // Batasi panjang pesan
    },
    isRead: {
        type: Boolean,
        default: false,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
    // HAPUS field recipientUsername jika ada di sini
    // recipientUsername: { type: String, required: true }, // <- BARIS SEPERTI INI HARUS DIHAPUS
});

// Menerapkan pemeriksaan model sebelum kompilasi
module.exports = mongoose.models.Message || mongoose.model('Message', messageSchema);