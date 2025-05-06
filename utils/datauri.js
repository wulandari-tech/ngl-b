const DatauriParser = require('datauri/parser');
const path = require('path');

const parser = new DatauriParser();

const formatBufferToDataURI = (file) => {
    if (!file || !file.originalname || !file.buffer) {
        throw new Error('Invalid file object provided for DataURI conversion.');
    }
    const fileExtension = path.extname(file.originalname).toString();
    return parser.format(fileExtension, file.buffer);
};

module.exports = formatBufferToDataURI; // Export the function directly