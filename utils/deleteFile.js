const logger = require("./logger");
const fs = require("fs").promises;

/**
 * Function to delete a file by its path
 * @param {string} filePath - The full path of the file to delete
 */

const deleteFile = async (filePath) => {
  try {
    if (filePath.includes("dummy")) {
      logger.info(`skipped dummy file : ${filePath}`);
    } else {
      await fs.unlink(filePath);

      logger.info(`File deleted successfully: ${filePath}`);
    }
  } catch (error) {
    logger.error(`Error deleting file: ${error.message}`);
  }
};

module.exports = { deleteFile };
