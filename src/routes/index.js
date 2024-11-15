const router = require("express").Router();
const {
  generateEcJobs,
  jobStatus,
} = require("../controllers/ec.controller");

router.post("/generate-ec", generateEcJobs);

router.post("/JobStatus", jobStatus);

module.exports = router;
