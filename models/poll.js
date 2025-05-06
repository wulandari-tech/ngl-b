const mongoose = require('mongoose');

const pollOptionSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    votes: {
        type: Number,
        default: 0,
        min: 0
    }
}, { _id: true }); // Pastikan opsi punya _id jika perlu diidentifikasi unik nanti

const pollSchema = new mongoose.Schema({
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    question: {
        type: String,
        required: true,
        trim: true,
        maxlength: 280
    },
    options: {
        type: [pollOptionSchema],
        validate: [
            { validator: (val) => val.length >= 2, msg: 'Polling harus memiliki minimal 2 opsi.' },
            { validator: (val) => val.length <= 10, msg: 'Polling maksimal memiliki 10 opsi.' } // Batas opsional
        ],
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    voters: [{ // Menyimpan identifier unik voter (contoh: IP hash atau fingerprint)
        identifier: { type: String },
        votedAt: { type: Date, default: Date.now }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indeks untuk query voter lebih cepat (jika diperlukan)
// pollSchema.index({ 'voters.identifier': 1 }); // Komentar dulu, bisa jadi besar

module.exports = mongoose.models.Poll || mongoose.model('Poll', pollSchema);