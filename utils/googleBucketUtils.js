const { Storage } = require("@google-cloud/storage");
const { googleApiKey, bucketName } = require("../config/config");
const fs = require("fs");
const path = require("path");
const mime = require("mime-types");

const logger = require("./logger");

const getContentType = (filePath) => {
  const ext = path.extname(filePath); // Get file extension
  return mime.lookup(ext) || "application/octet-stream"; // Fallback to a generic type if unknown
};

async function uploadFileGC(fileDestination, filePath) {
  return new Promise(async (resolve, reject) => {
    try {
      const contentType = getContentType(filePath);
      const fileKey = Date.now().toString();
      const storage = new Storage({
        credentials: googleApiKey,
      });

      const bucket = storage.bucket(bucketName);
      const fileGC = bucket.file(fileDestination + "/" + fileKey);
      const readStream = fs.createReadStream(filePath);

      readStream
        .pipe(
          fileGC.createWriteStream({
            contentType,
          })
        )
        .on("error", (error) => {
          logger.error("File upload failed:", error);
          reject(new Error("Upload failed"));
        })
        .on("finish", () => {
          logger.info("File uploaded successfully");
          resolve(fileKey); // Resolve with the file key or path
        });
    } catch (error) {
      logger.error(error);
      throw new Error(`Upload failed`);
    }
  });
}

function getSignedUrlGC(fileKey, expirationTime) {
  return new Promise(async (resolve, reject) => {
    try {
      const storage = new Storage({
        credentials: googleApiKey,
      });

      const [file] = await storage
        .bucket(bucketName)
        .file(fileKey)
        .getSignedUrl({
          version: "v4",
          action: "read",
          expires: Date.now() + expirationTime * 1000,
        });

      resolve(file);
    } catch (error) {
      logger.error("Error generating signed URL:", error);
      reject(error);
    }
  });
}

module.exports = {
  uploadFileGC,
  getSignedUrlGC,
};
