const multer = require('multer');

// Configure Multer to store files in memory
const storage = multer.memoryStorage();

// Optional: File filter to accept only images
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true); // Accept the file
    } else {
        // Reject the file with a specific error message
        cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only image files are allowed!'), false);
    }
};

// Configure Multer upload instance
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 5 // Limit file size to 5MB (adjust as needed)
    },
    fileFilter: fileFilter
});

module.exports = upload;