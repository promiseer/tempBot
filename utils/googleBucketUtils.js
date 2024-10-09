const { Storage } = require("@google-cloud/storage");
const { googleApiKey, bucketName } = require("../config/config");
const fs = require("fs");
const logger = require("./logger");

async function uploadFileGC(filePath) {
  return new Promise(async (resolve, reject) => {
    try {
      const fileKey = Date.now().toString();
      const storage = new Storage({
        credentials: googleApiKey,
      });

      const bucket = storage.bucket(bucketName);
      const fileGC = bucket.file(fileKey);
      const readStream = fs.createReadStream(filePath);

      readStream
        .pipe(
          fileGC.createWriteStream({
            contentType: "application/pdf",
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
