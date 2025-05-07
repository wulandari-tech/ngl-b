// routes/storyRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const StoryItem = require('../models/storyItem');
const User = require('../models/user');
const { isAuthenticated, optionalAuth } = require('../middleware/auth');
const mongoose = require('mongoose');

const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Hanya file gambar atau video yang diizinkan!'), false);
        }
    }
});

router.post('/', isAuthenticated, upload.single('mediaFile'), async (req, res) => {
    try {
        const {
            type, textContent, backgroundColor, fontColor, fontFamily, textAlign,
            originalMessageContent, userReplyContent, durationSeconds, replyImageMediaUrl
        } = req.body;
        const userId = req.user.id;

        if (!type) return res.status(400).json({ message: 'Tipe cerita diperlukan.' });

        let storyData = { userId, type, durationSeconds: parseInt(durationSeconds) || (type === 'video_upload' ? 0 : 7) };

        if (type === 'text_story') {
            if (!textContent || textContent.trim() === '') return res.status(400).json({ message: 'Teks cerita tidak boleh kosong.' });
            storyData.textContent = textContent;
            if (backgroundColor) storyData.backgroundColor = backgroundColor;
            if (fontColor) storyData.fontColor = fontColor;
            if (fontFamily) storyData.fontFamily = fontFamily;
            if (textAlign) storyData.textAlign = textAlign;
        } else if (type === 'image_upload' || type === 'video_upload') {
            if (!req.file) return res.status(400).json({ message: 'File media tidak ditemukan.' });
            const resourceType = type === 'video_upload' ? 'video' : 'image';
            const result = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { resource_type: resourceType, folder: `ngl_stories/${userId}`, ...(resourceType === 'video' && { eager: [{ format: 'jpg', fetch_format: 'auto', quality: 'auto' }] }) },
                    (error, result) => error ? reject(error) : resolve(result)
                );
                uploadStream.end(req.file.buffer);
            });
            storyData.mediaUrl = result.secure_url;
            storyData.mediaType = resourceType;
            storyData.cloudinaryPublicId = result.public_id;
            if (resourceType === 'video') {
                storyData.durationSeconds = Math.round(result.duration) || 7;
                if (result.eager && result.eager.length > 0 && result.eager[0].format === 'jpg') storyData.thumbnailUrl = result.eager[0].secure_url;
            }
        } else if (type === 'image_reply') {
            if (!replyImageMediaUrl) return res.status(400).json({ message: 'URL gambar balasan diperlukan.' });
            storyData.mediaUrl = replyImageMediaUrl;
            storyData.mediaType = 'image';
            storyData.originalMessageContent = originalMessageContent;
            storyData.userReplyContent = userReplyContent;
            // Consider storing cloudinaryPublicId for replyImageMediaUrl if it's from Cloudinary and managed by this system
        } else {
            return res.status(400).json({ message: 'Tipe cerita tidak valid.' });
        }
        const newStory = new StoryItem(storyData);
        await newStory.save();
        res.status(201).json(newStory);
    } catch (error) {
        console.error("Error creating story:", error);
        if (error.message && error.message.includes('File size too large')) return res.status(400).json({ message: 'Ukuran file terlalu besar. Maksimal 25MB.' });
        if (error.message && error.message.includes('Hanya file gambar atau video yang diizinkan!')) return res.status(400).json({ message: 'Format file tidak didukung. Hanya gambar atau video.'});
        res.status(500).json({ message: 'Gagal membuat cerita.', error: error.message });
    }
});

router.post('/upload-reply-image', isAuthenticated, async (req, res) => {
    try {
        const { imageDataUrl, filename } = req.body;
        if (!imageDataUrl) return res.status(400).json({ message: 'imageDataUrl diperlukan.' });
        const result = await cloudinary.uploader.upload(imageDataUrl, {
            public_id: filename || `reply_image_${Date.now()}`,
            folder: `ngl_stories/${req.user.id}/reply_images`,
            resource_type: 'image'
        });
        res.status(200).json({ secure_url: result.secure_url, public_id: result.public_id });
    } catch (error) {
        console.error("Error uploading reply image to Cloudinary:", error);
        res.status(500).json({ message: 'Gagal mengupload gambar balasan.', error: error.message });
    }
});

router.get('/public/:username', optionalAuth, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username.toLowerCase() }).select('_id username');
        if (!user) return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
        const stories = await StoryItem.find({ userId: user._id, expiresAt: { $gt: new Date() }, isArchived: false }).sort({ createdAt: 'asc' });
        res.status(200).json(stories);
    } catch (error) {
        console.error("Error fetching public stories:", error);
        res.status(500).json({ message: 'Gagal mengambil cerita publik.' });
    }
});

router.get('/me', isAuthenticated, async (req, res) => {
    try {
        const stories = await StoryItem.find({ userId: req.user.id, isArchived: false }).sort({ createdAt: 'desc' });
        const archivedStories = await StoryItem.find({ userId: req.user.id, isArchived: true}).sort({ createdAt: 'desc' });
        res.status(200).json({ active: stories, archived: archivedStories });
    } catch (error) {
        console.error("Error fetching user's stories:", error);
        res.status(500).json({ message: "Gagal mengambil cerita Anda." });
    }
});

router.delete('/:storyId', isAuthenticated, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.storyId)) return res.status(400).json({ message: 'ID Cerita tidak valid.' });
        const story = await StoryItem.findOne({ _id: req.params.storyId, userId: req.user.id });
        if (!story) return res.status(404).json({ message: 'Cerita tidak ditemukan atau Anda tidak berhak menghapusnya.' });
        if (story.cloudinaryPublicId) {
            const resourceType = story.mediaType === 'video' ? 'video' : 'image';
            await cloudinary.uploader.destroy(story.cloudinaryPublicId, { resource_type: resourceType });
        }
        await StoryItem.deleteOne({ _id: req.params.storyId });
        res.status(200).json({ message: 'Cerita berhasil dihapus.' });
    } catch (error) {
        console.error("Error deleting story:", error);
        res.status(500).json({ message: 'Gagal menghapus cerita.' });
    }
});

router.put('/:storyId/archive', isAuthenticated, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.storyId)) return res.status(400).json({ message: 'ID Cerita tidak valid.' });
        const story = await StoryItem.findOneAndUpdate(
            { _id: req.params.storyId, userId: req.user.id },
            { $set: { isArchived: true, expiresAt: null } }, { new: true }
        );
        if (!story) return res.status(404).json({ message: 'Cerita tidak ditemukan atau Anda tidak berhak mengubahnya.' });
        res.status(200).json({ message: 'Cerita berhasil diarsipkan.', story });
    } catch (error) {
        console.error("Error archiving story:", error);
        res.status(500).json({ message: 'Gagal mengarsipkan cerita.' });
    }
});

router.put('/:storyId/unarchive', isAuthenticated, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.storyId)) return res.status(400).json({ message: 'ID Cerita tidak valid.' });
        const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const story = await StoryItem.findOneAndUpdate(
            { _id: req.params.storyId, userId: req.user.id, isArchived: true },
            { $set: { isArchived: false, expiresAt: newExpiresAt } }, { new: true }
        );
        if (!story) return res.status(404).json({ message: 'Cerita tidak ditemukan atau belum diarsipkan.' });
        res.status(200).json({ message: 'Cerita berhasil dikembalikan dari arsip.', story });
    } catch (error) {
        console.error("Error unarchiving story:", error);
        res.status(500).json({ message: 'Gagal mengembalikan cerita dari arsip.' });
    }
});

router.post('/:storyId/view', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.storyId)) return res.status(400).json({ message: 'ID Cerita tidak valid.' });
        const story = await StoryItem.findByIdAndUpdate(req.params.storyId, { $inc: { viewCount: 1 } });
        if (!story) return res.status(404).json({ message: 'Cerita tidak ditemukan.' });
        res.status(200).json({ message: 'View dicatat.' });
    } catch (error) {
        console.error("Error recording view:", error);
        res.status(500).json({ message: 'Gagal mencatat view.' });
    }
});

module.exports = router;