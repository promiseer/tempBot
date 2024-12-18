const axios = require("axios"); // You can use axios for HTTP requests
const logger = require("../../utils/logger");
const moment = require("moment");

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
    throw error;
  }
};

const createAttachement = async (
  caseId,
  file,
  sros,
  encumbranceType,
  caseData
) => {
  if (!caseId || !file) {
    logger.error("requested parameters not found");
    throw new Error("requested parameters not found");
  }

  try {
    const token = await getToken();
    const { params, notUsedParams } = getParams(
      encumbranceType,
      sros,
      caseData
    );    
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
            docSource: "DOCUMENT_SOURCE.GOVERNMENT_ISSUED",
            subType: "DOCUMENT_SUB_TYPE.ONLINE",
            notify: true,
            inReport: false,
            isBot: true,
            encumbranceType,
            params,
            notUsedParams,
            botRun:caseData.botRun+1,
            identifier: caseData.identifier,
            propertyType: caseData.propertyType,
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

const getParams = (
  EcType,
  sros,
  { docNo, docYear, houseNo, surveyNo, plotNo, flatNo, aliasName, startDate }
) => {
  const endDate = moment().subtract(1, "days").format("DD/MM/YYYY");

  let params = "";
  let notUsedParams = "";
  switch (EcType) {
    case "ENCUMBRANCE_TYPE.DNOS":
    case "ENCUMBRANCE_TYPE.DNMS":
      params = `Doc: ${docNo} Year: ${docYear} SRO: ${sros} EC Search: ${startDate} - ${endDate}`;
      notUsedParams = `H.No: ${houseNo} Sy.No: ${surveyNo} P.NO:${plotNo} F.NO:${flatNo} Alias:${aliasName}`;
      break;

    case "ENCUMBRANCE_TYPE.HNOS":
    case "ENCUMBRANCE_TYPE.HNMS":
    case "ENCUMBRANCE_TYPE.SHNOS":
    case "ENCUMBRANCE_TYPE.SHNMS":
      params = `H.No: ${houseNo} Alias:${aliasName} SRO: ${sros} EC Search: ${startDate} - ${endDate}`;
      notUsedParams = `Doc: ${docNo} Year: ${docYear} Sy.No: ${surveyNo} P.NO: ${plotNo} F.NO: ${flatNo}`;
      break;

    case "ENCUMBRANCE_TYPE.SNOS":
    case "ENCUMBRANCE_TYPE.SNMS":
    case "ENCUMBRANCE_TYPE.SSNOS":
    case "ENCUMBRANCE_TYPE.SSNMS":
    case "ENCUMBRANCE_TYPE.ASNOS":
    case "ENCUMBRANCE_TYPE.ASNMS":
    case "ENCUMBRANCE_TYPE.SASNOS":
    case "ENCUMBRANCE_TYPE.SASNMS":
      params = `Sy.No: ${surveyNo} Alias:${aliasName} SRO: ${sros} EC Search: ${startDate} - ${endDate}`;
      notUsedParams = `Doc: ${docNo} Year: ${docYear} H.No: ${houseNo} P.NO:${plotNo} F.NO: ${flatNo}`;
      break;

    case "ENCUMBRANCE_TYPE.PNOS":
    case "ENCUMBRANCE_TYPE.PNMS":
      params = `P.NO: ${plotNo} H.No: ${houseNo} Sy.No: ${surveyNo} Alias:${aliasName} SRO: ${sros} EC Search: ${startDate} - ${endDate}`;
      notUsedParams = `Doc: ${docNo} Year: ${docYear} F.NO: ${flatNo}`;
      break;

    case "ENCUMBRANCE_TYPE.FNOS":
    case "ENCUMBRANCE_TYPE.FNMS":
      params = `F.NO: ${flatNo}  H.No: ${houseNo} Sy.No: ${surveyNo} Alias:${aliasName} SRO: ${sros} EC Search: ${startDate} - ${endDate}`;
      notUsedParams = `Doc: ${docNo} Year: ${docYear} P.NO: ${plotNo}`;
      break;

    default:
      break;
  }
  return { params, notUsedParams };
};
module.exports = { getToken, createAttachement };
