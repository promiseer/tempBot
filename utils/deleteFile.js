const logger = require("./logger");
const fs = require("fs").promises;
const pathModule = require('path'); // Importing the path module for handling file paths

/**
 * Function to delete a file by its path
 * @param {string} filePath - The full path of the file to delete
 */

const deleteFile = async (filePath) => {
  try {
    const filePathWithoutExt = pathModule.format({
      dir: pathModule.dirname(filePath),  // Get the directory
      name: pathModule.basename(filePath, pathModule.extname(filePath)),  // Remove the extension
    });
    if (filePath.includes("dummy")) {
      logger.info(`skipped dummy file : ${filePath}`);
    } else {
      await fs.unlink(filePathWithoutExt);

      logger.info(`File deleted successfully: ${filePath}`);
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      logger.warn(`File not found, skipping deletion: ${filePath}`);
    } else {
      logger.error(`Error deleting file: ${error.message}`);
    }
    logger.error(`Error deleting file: ${error.message}`);
  }
};

module.exports = { deleteFile };
