// env.js

const logger = require("../utils/logger");

require("dotenv").config(); // Load environment variables from .env file

const requiredEnvVars = [
  "PORT",
  "TEL_EC_USERNAME",
  "TEL_EC_PASSWORD",
  "BACKEND_URL",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "GOOGLE_API_KEY",
  "CLOUD_BUCKET_NAME",
];

try {
  const missingEnvs = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missingEnvs.length > 0) {
    throw new Error(
      `Env Configuration Error:\n${missingEnvs
        .map((err) => `  '${err}' is missing in env`)
        .join("\n")}\n`
    );
  }
} catch (error) {
  logger.error(error.message);
  process.exit(1);
}

// Export the environment variables so they can be used in the app
module.exports = {
  PORT: process.env.PORT,
  username: process.env.TEL_EC_USERNAME,
  password: process.env.TEL_EC_PASSWORD,
  backendUrl: process.env.BACKEND_URL,
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
  googleApiKey: JSON.parse(process.env.GOOGLE_API_KEY),
  bucketName: process.env.CLOUD_BUCKET_NAME,
};
