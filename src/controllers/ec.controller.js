const logger = require("../../utils/logger");
const {
  generateEncumbranceJobs,
  getJobStatus,
} = require("../services/ec.service");

const generateEcJobs = async (req, res) => {
  try {
    const {
      state,
      caseId,
      docNo,
      docYear,
      sroName,
      multipleSros,
      ownerName,
      houseNo,
      surveyNo,
      village,
      block,
      district,
      filePath,
      encumbranceTypes,
      startDate,
      identifier,
      propertyType,
      botRun
    } = req.body;

    const requiredParams = {
      state,
      caseId,
      district,
      village,
      sroName,
      encumbranceTypes,
      identifier,
      propertyType,
    };
    const missingParams = Object.keys(requiredParams).filter(
      (param) =>
        !requiredParams[param] ||
        (Array.isArray(requiredParams[param]) && !requiredParams[param].length)
    );

    if (missingParams.length) {
      return res
        .status(400)
        .send({ message: `Missing parameters: ${missingParams.join(", ")}` });
    }
    if (!filePath || typeof filePath !== "string" || filePath.trim() === "") {
      throw new Error(
        "Invalid file path: fileDestination is either empty or not provided."
      );
    }

    const jobIds = await generateEncumbranceJobs(req.body);
    return res.status(201).json({ ok: 1, data: { jobIds } });
  } catch (error) {
    logger.error(`Error generating jobs: ${error.message}`);
    res.status(error.status || 500).send({ message: error.message });
  }
};

const jobStatus = async (req, res) => {
  try {
    const { jobIds } = req.body;
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: "No job IDs found" });
    }
    const jobs = await getJobStatus(jobIds);
    res.status(200).send({ ok: 1, data: { jobs } });
  } catch (error) {
    logger.error(`Error retrieving job status: ${error.message}`);
    res.status(error.status || 500).send({ message: error.message });
  }
};
module.exports = {
  generateEcJobs,
  jobStatus,
};
