
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated && req.isAuthenticated()) { // Periksa apakah fungsi ada sebelum memanggil
        return next();
    }
    // Jika tidak terautentikasi, kirim respons 401 Unauthorized
    res.status(401).json({ message: 'Autentikasi diperlukan untuk mengakses sumber daya ini.' });
};

// Middleware untuk autentikasi opsional
// Ini akan menandai req.user jika terautentikasi, tetapi akan tetap melanjutkan jika tidak.
const optionalAuth = (req, res, next) => {
    // Passport biasanya akan mengisi req.user jika sesi valid.
    // Jika tidak ada req.user, berarti tidak terautentikasi, tetapi kita tetap next().
    // Anda bisa menambahkan logika Passport di sini jika ingin secara eksplisit mencoba autentikasi opsional.
    // Untuk kesederhanaan, kita asumsikan Passport sudah menangani pengisian req.user dari sesi.
    next();
};

module.exports = {
    isAuthenticated,
    optionalAuth
};

