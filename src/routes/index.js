const router = require("express").Router();
const { Queue } = require("../../queues");

router.post("/generate-ec", async (req, res) => {
  const { EC_TYPE, OPTIONS } = req.body;
  const job = await Queue.add(
    { EC_TYPE, OPTIONS },
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
