const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    recipientUsername: { // Menyimpan username penerima
        type: String,
        required: true,
        lowercase: true,
        index: true // Penting untuk query inbox
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    // Tidak ada 'sender' field untuk menjaga anonimitas
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);