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
    ownerName,
    houseNo,
    surveyNo,
    village,
    wardBlock,
    district,
    filePath,
  } = req.body;

  if (!state || !caseId) {
    return res.status(400).send({ message: "requestparameter not found" });
  }

  if (!filePath || typeof filePath !== "string" || filePath.trim() === "") {
    throw new Error(
      "Invalid file path: fileDestination is either empty or not provided."
    );
  }

  const job = await Queue.add(
    {
      state,
      caseId,
      docNo,
      docYear,
      sroName,
      ownerName,
      houseNo,
      surveyNo,
      village,
      wardBlock,
      district,
      filePath,
    },
    {
      attempts: 3, // Retry job 3 times on failure
      removeOnComplete: true, // Automatically remove job after completion
      removeOnFail: 1000, // Keep 1000 failed jobs before deleting old ones
    }
  );

  res.status(201).json({ ok: 1, data: { jobId: job.id } });
});

// API endpoint to check job status
router.get("/JobStatus/:jobId", async (req, res) => {
  const { jobId } = req.params;
  if (!jobId) return res.send({ message: "params not found" });
  const job = await Queue.getJob(jobId);
  logger.info(job);
  if (!job) {
    return res.status(404).json({ error: "Job not found." });
  }

  const state = await job.getState();
  res.status(200).send({
    ok: 1,
    data: {
      id: job.id,
      state,
      progress: job._progress,
      attempts: job.attemptsMade,
      timestamp: job.timestamp,
      data: job.data,
    },
  });
});

module.exports = router;
