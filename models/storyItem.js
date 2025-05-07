// models/StoryItem.js
const mongoose = require('mongoose');

const StoryItemSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['image_reply', 'image_upload', 'video_upload', 'text_story'], // 'text' jadi 'text_story' agar lebih jelas
        required: true
    },
    // Untuk image_reply, image_upload, video_upload
    mediaUrl: { type: String }, // URL dari Cloudinary
    mediaType: { type: String, enum: ['image', 'video'] }, // Untuk membedakan di frontend
    thumbnailUrl: { type: String }, // Opsional, Cloudinary bisa generate thumbnail untuk video
    cloudinaryPublicId: { type: String }, // Untuk menghapus dari Cloudinary

    // Untuk text_story
    textContent: { type: String, maxlength: 280 },
    backgroundColor: { type: String, default: '#C06C84' }, // Default warna NGL
    fontColor: { type: String, default: '#FFFFFF' },
    fontFamily: { type: String, default: 'sans-serif' },
    textAlign: { type: String, enum: ['left', 'center', 'right'], default: 'center' },

    // Untuk image_reply (konteks tambahan)
    originalMessageContent: { type: String },
    userReplyContent: { type: String },

    viewCount: { type: Number, default: 0 },
    // Siapa saja yang sudah melihat (jika ingin fitur "Dilihat oleh...")
    // viewedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Ini bisa jadi berat jika banyak views

    // Pengaturan Cerita
    durationSeconds: { type: Number, default: 7 }, // Durasi tampil sebelum auto-advance (untuk gambar/teks)
    expiresAt: { type: Date, index: true }, // Otomatis hilang setelah 24 jam (atau periode lain)
    isArchived: { type: Boolean, default: false }, // Jika pengguna ingin menyimpan ke "Sorotan"
    // highlightedIn: { type: String }, // Nama Sorotan (jika ada fitur Sorotan/Highlights)

    createdAt: { type: Date, default: Date.now, index: true }
});

// Indeks untuk query umum
StoryItemSchema.index({ userId: 1, expiresAt: 1, createdAt: -1 }); // Untuk mengambil cerita aktif
StoryItemSchema.index({ userId: 1, isArchived: 1, createdAt: -1 }); // Untuk mengambil cerita arsip/sorotan

// Middleware untuk auto-set expiresAt (contoh 24 jam)
StoryItemSchema.pre('save', function(next) {
    if (!this.expiresAt) {
        this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    next();
});

module.exports = mongoose.model('StoryItem', StoryItemSchema);