const { Queue } = require("../../queues");
const logger = require("../../utils/logger");

const getSplitJobs = async (items, field, jobData) => {
  const jobs = await Promise.all(
    items.map((item) => Queue.add({ ...jobData, [field]: item }))
  );
  return jobs.map((job) => job.id);
};

const generateCombinations = (inputString, delimiter) => {
  let parts = inputString.split(delimiter);
  return parts
    .slice(0, parts.length - 1)
    .map((_, i) => parts.slice(0, i + 1).join(delimiter)); //@TODO: update delimeter
};

const encumbranceMapping = {
  houseNo: {
    types: ["ENCUMBRANCE_TYPE.SHNOS", "ENCUMBRANCE_TYPE.SHNMS"],
    splitter: "/",
  },
  surveyNo: {
    types: [
      "ENCUMBRANCE_TYPE.SSNOS",
      "ENCUMBRANCE_TYPE.SSNMS",
      "ENCUMBRANCE_TYPE.SASNMS",
    ],
    splitter: "/",
  },
};

const encumbranceLookup = Object.entries(encumbranceMapping).reduce(
  (acc, [field, { types, splitter }]) => {
    types.forEach((type) => {
      acc[type] = { field, splitter };
    });
    return acc;
  },
  {}
);

const generateEncumbranceJobs = async (body) => {
  const { encumbranceTypes } = body;

  let jobIds = await Promise.all(
    encumbranceTypes.map(async (encumbranceType) => {
      const jobData = { ...body, encumbranceType };
      delete jobData.encumbranceTypes;

      const mapping = encumbranceLookup[encumbranceType];
      if (mapping) {
        const { field, splitter } = mapping;
        const splitItems = generateCombinations(jobData[field], splitter) || [];

        return await getSplitJobs(splitItems, field, jobData);
      }

      const job = await Queue.add(jobData);
      return job.id;
    })
  );

  jobIds = jobIds.flat(); // Ensure job IDs are flattened

  if (!jobIds.length) {
    throw new Error(
      "Failed to add job to the queue: Queue might not be running."
    );
  }

  return jobIds;
};

const getJobStatus = async (jobIds) => {
  const jobs = await Promise.all(
    jobIds.map(async (jobId) => {
      const job = await Queue.getJob(jobId);
      logger.info(`${job}`);

      if (!job) {
        return { jobId, error: "Job not found" };
      }

      const state = await job.getState();
      return { jobId, state, jobDetails: job }; // Return jobId, state, and job details
    })
  );

  return jobs;
};

module.exports = {
  generateEncumbranceJobs,
  getJobStatus,
};
