const { Queue, BOTOMATION_TASKS } = require("../../queues");
const { deleteFile } = require("../../utils/deleteFile");
const { uploadFileGC } = require("../../utils/googleBucketUtils");
const logger = require("../../utils/logger");
const apEcDownloader = require("../automations/apEcDownloader");
const tgEcDownloader = require("../automations/tgEcDownloader");
const { createAttachement } = require("../services/nirnai.service");
const cluster = require("cluster");
const totalCPUs = require("os").cpus().length;
const processJob = async (job) => {
  const { queue, data, id } = job;
  const { state, caseId, filePath: fileDestination, encumbranceType } = data;
  logger.info(`Worker with id ${process.pid} started`);

  logger.info(
    `Received job for queue: ${queue.name} and Job ID:${id} encumbranceType::${encumbranceType}`
  );

  try {
    if (queue.name !== BOTOMATION_TASKS) {
      throw new Error(
        `Invalid queue. Expected: ${BOTOMATION_TASKS}, but got: ${queue.name}`
      );
    }

    logger.info(`Worker listening to '${queue.name}' queue`);
    switch (state) {
      case "ANDHRA PRADESH":
        try {
          const { filePath, sros } = await apEcDownloader(data);
          if (filePath) {
            const file = await uploadFileGC(fileDestination, filePath);
            await createAttachement(caseId, file, sros, encumbranceType, data);
            await deleteFile(filePath);
            logger.info(
              `Successfully processed ANDHRA PRADESH with Job ID:${id}`
            );
          }
        } catch (error) {
          logger.error(`Error processing ANDHRA PRADESH: ${error.message}`);
        }
        break;

      case "TELANGANA":
        try {
          const { filePath, sros } = await tgEcDownloader(data);
          if (filePath) {
            const file = await uploadFileGC(fileDestination, filePath);
            await createAttachement(caseId, file, sros, encumbranceType, data);
            await deleteFile(filePath);
            logger.info(`Successfully processed TEL-EC with Job ID:${id}`);
          }
        } catch (error) {
          logger.error(`Error processing TELANGANA: ${error.message}`);
        }
        break;

      case "TAMILNADU":
        try {
          // @TODO: few checks pending
          // await tamilNaduEcDownloader();
          logger.info(`Successfully processed TEL-EC with Job ID:${id}`);
        } catch (error) {
          logger.error(`Error processing TAMILNADU: ${error.message}`);
        }
        break;

      default:
        throw new Error(`Unsupported State: ${state}`);
    }
  } catch (error) {
    logger.info(error.message);
  }
};

// Initialize queue processing with concurrency
if (cluster.isMaster) {
  logger.info(`Number of CPUs is ${totalCPUs}`);
  logger.info(`Master ${process.pid} is running`);
  for (let i = 0; i < totalCPUs; i++) {
    cluster.fork(); // Spawn worker processes
  }

  cluster.on("exit", (worker) => {
    logger.info(`worker ${worker.process.pid} died`);
    logger.info("Let's fork another worker!");
    cluster.fork();
  });
} else {
  // Each worker will process jobs with a concurrency limit
  Queue.process(totalCPUs, async (job) => {
    await processJob(job);
  });
}

logger.info(
  `Master process ${process.pid} is running with ${totalCPUs} concurrent workers.`
);
