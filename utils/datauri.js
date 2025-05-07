// utils/datauri.js (Contoh umum)
const DatauriParser = require('datauri/parser');
const path = require('path');
const parser = new DatauriParser();

const formatBufferToDataURI = (file) => {
    // Tambahkan pengecekan yang lebih baik
    if (!file || !file.buffer || !file.mimetype || !file.originalname) {
         console.error("Objek file tidak valid diterima di datauri:", file);
         throw new Error("Invalid file object provided for DataURI conversion.");
    }
    try {
        // Gunakan originalname untuk mendapatkan ekstensi file
        return parser.format(path.extname(file.originalname).toString(), file.buffer);
    } catch (parseError){
        console.error("DataURI parsing error:", parseError);
        throw new Error("Gagal mengonversi buffer file ke Data URI.");
    }
};

module.exports = formatBufferToDataURI; // Pastikan ini diekspor