const router = require("express").Router();
const { Queue } = require("../../queues");
const logger = require("../../utils/logger");

router.post("/generate-ec", async (req, res) => {
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
    wardBlock,
    district,
    filePath,
    encumbranceTypes,
  } = req.body;

  if (
    !state ||
    !caseId ||
    !docNo ||
    !docYear ||
    !district ||
    !sroName ||
    !multipleSros.length ||
    !encumbranceTypes.length
  ) {
    return res.status(400).send({ message: "requestparameter not found" });
  }

  if (!filePath || typeof filePath !== "string" || filePath.trim() === "") {
    throw new Error(
      "Invalid file path: fileDestination is either empty or not provided."
    );
  }
  try {
    const jobIds = await Promise.all(
      encumbranceTypes.map(async (encumbranceType) => {
        const job = await Queue.add({
          encumbranceType,
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
          wardBlock,
          district,
          filePath,
        });
        return job.id;
      })
    );

    if (!jobIds.length) {
      throw new Error(
        "Failed to add job to the queue: Queue might not be running."
      );
    }

    res.status(201).json({ ok: 1, data: { jobIds } });
  } catch (error) {
    console.error(`Failed to add job to the queue: ${error.message}`);
    res.status(500).send({ message: error.message });
  }
});

// API endpoint to check job status
router.post("/JobStatus/", async (req, res) => {
  const { jobIds } = req.body;
  if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
    return res.status(400).json({ error: "No job IDs found" });
  }
  const jobs = await Promise.all(
    jobIds.map(async (jobId) => {
      const job = await Queue.getJob(jobId);
      logger.info(job);

      if (!job) {
        return { jobId, error: "Job not found" };
      }

      const state = await job.getState();
      return { jobId, state, jobDetails: job }; // Return jobId, state, and job details
    })
  );

  res.status(200).send({
    ok: 1,
    data: {
      jobs,
    },
  });
});

module.exports = router;
