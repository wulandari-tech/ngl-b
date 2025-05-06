const cloudinary = require('cloudinary').v2;
require('dotenv').config(); // Ensure environment variables are loaded

if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
) {
    console.error('Error: Cloudinary environment variables (CLOUD_NAME, API_KEY, API_SECRET) are missing!');
    // Optionally exit or throw an error to prevent the app from running without config
    // process.exit(1);
}

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true // Use https URLs
});

module.exports = cloudinary;