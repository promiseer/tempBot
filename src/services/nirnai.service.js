const axios = require("axios"); // You can use axios for HTTP requests
const logger = require("../../utils/logger");
const {
  backendUrl,
  adminEmail,
  adminPassword,
} = require("../../config/config");

const getToken = async () => {
  if (!adminEmail || !adminPassword) {
    logger.error(
      "Login API URL, Admin email, or Admin password not set in environment variables"
    );
    throw new Error(
      "Login API URL, Admin email, or Admin password not set in environment variables"
    );
  }

  try {
    const response = await axios.post(`${backendUrl}/auth/login`, {
      email: adminEmail,
      password: adminPassword,
    });

    if (response.status !== 200) {
      logger.error(`Failed to login: ${response.status} ${response.data}`);
      throw new Error(`Failed to login: ${response.data}`);
    }

    const token = response.data.accessToken;
    return token;
  } catch (error) {
    logger.error(`Error during login: ${error}`);
    throw error;
  }
};

const createAttachement = async (caseId, file) => {
  if (!caseId || !file) {
    logger.error("requested parameters not found");
    throw new Error("requested parameters not found");
  }

  try {
    const token = await getToken();
    const response = await axios.post(
      `${backendUrl}/request/create/attachments`,
      {
        request: caseId,
        attachments: [
          {
            id: null,
            docCategory: null,
            docType: "DOCUMENT_TYPE.ENCUMBRANCE_S",
            docNumber: "ECS" + file,
            docDate: null,
            docLink: file,
            docSource: null,
            notify: true,
            inReport: false,
          },
        ],
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (response.status !== 201) {
      logger.error(`Failed to login: ${response.status} ${response.data}`);
      throw new Error(`Failed to login: ${response.data}`);
    }

    return true;
  } catch (error) {
    logger.error(`Error during login: ${error}`);
    throw error;
  }
};
module.exports = { getToken, createAttachement };
