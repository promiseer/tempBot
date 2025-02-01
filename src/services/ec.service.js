const { Queue } = require("../../queues");
const logger = require("../../utils/logger");

const getSplitJobs = async (items, field, jobData) => {
  const jobs = await Promise.all(
    items.map((item) => Queue.add({ ...jobData, [field]: item }))
  );
  return jobs.map((job) => job.id);
};

const extractDelimiters = (inputString, delimiter) => {
  return inputString.match(delimiter) || [];
};

const generateCombinations = (inputString, delimiter) => {
  const regex = new RegExp(`[${delimiter}]`, "g");
  let combinations = [];
  let currentCombination = "";

  const parts = inputString.split(regex);
  const delimiterSequence = extractDelimiters(inputString, regex);
  for (let i = 0; i < parts.length; i++) {
    currentCombination += (i > 0 ? delimiterSequence[i - 1] : "") + parts[i];
    combinations.push(currentCombination);
  }

  return combinations.slice(delimiterSequence.length > 2 ? 1 : 0, -1);
};

const encumbranceMapping = {
  houseNo: {
    types: ["ENCUMBRANCE_TYPE.SHNOS", "ENCUMBRANCE_TYPE.SHNMS"],
    splitter: "-/",
  },
  surveyNo: {
    types: [
      "ENCUMBRANCE_TYPE.SSNOS",
      "ENCUMBRANCE_TYPE.SSNMS",
      "ENCUMBRANCE_TYPE.SASNMS",
      "ENCUMBRANCE_TYPE.SASNOS",
    ],
    splitter: "-/",
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
  const { encumbranceTypes, otherZones } = body;

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

  if (
    body.state === "TAMIL NADU" &&
    Array.isArray(otherZones) &&
    otherZones.length > 0
  ) {
    const baseDistrict = body.district;
    const baseSroName = body.sroName;
    const baseVillage = body.village;

    // Exclude any zone whose district/sroName/village match the base values
    const additionalZones = otherZones.filter(
      (zoneObj) =>
        !(
          zoneObj.district === baseDistrict &&
          zoneObj.sroName === baseSroName &&
          zoneObj.village === baseVillage
        )
    );

    if (additionalZones.length > 0) {
      const extraJobIds = await Promise.all(
        additionalZones.map(async (zoneObj) => {
          // Clone the base body and override with the other zone details.
          const extraJobData = { ...body };
          extraJobData.district = zoneObj.district;
          extraJobData.sroName = zoneObj.sroName;
          extraJobData.village = zoneObj.village;
          // Optionally include the "zone" property if required downstream.
          extraJobData.zone = zoneObj.zone;
          // Remove any otherZones array so that the extra logic is not repeated.
          extraJobData.otherZones = [];
          // Force the encumbranceType to ENCUMBRANCE_TYPE.SNOS.
          extraJobData.encumbranceType = "ENCUMBRANCE_TYPE.SNOS";
          // Remove the original encumbranceTypes if present.
          delete extraJobData.encumbranceTypes;

          const job = await Queue.add(extraJobData);
          return job.id;
        })
      );
      jobIds.push(...extraJobIds);
    }
  }

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
