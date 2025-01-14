const { Queue, BOTOMATION_TASKS } = require("../../queues");
const { deleteFile } = require("../../utils/deleteFile");
const { uploadFileGC } = require("../../utils/googleBucketUtils");
const logger = require("../../utils/logger");
const apEcDownloader = require("../automations/apEcDownloader");
const tgEcDownloader = require("../automations/tgEcDownloader");
const tnEcDowloader = require("../automations/tnEcDownloader");
const kaEcDownloader = require("../automations/kaEcDownloader");
const {
  createAttachement,
  convertTamilEC,
} = require("../services/nirnai.service");
const cluster = require("cluster");
const totalCPUs = require("os").cpus().length;
const processJob = async (job) => {
  const { queue, data, id } = job;
  const { state, caseId, filePath: fileDestination, encumbranceType } = data;

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
            logger.info(`Successfully processed TG-EC with Job ID:${id}`);
          }
        } catch (error) {
          logger.error(`Error processing TELANGANA: ${error.message}`);
        }
        break;
      case "KARNATAKA":
        try {
          const { filePath } = await kaEcDownloader(data);
          if (filePath) {
            const file = await uploadFileGC(fileDestination, filePath);
            await createAttachement(caseId, file, sros, encumbranceType, data);
            await deleteFile(filePath);
            logger.info(`Successfully processed TG-EC with Job ID:${id}`);
          }
        } catch (error) {
          logger.error(`Error processing TAMILNADU: ${error.message}`);
        }
        break;

      case "TAMIL NADU":
        try {
          const filePath = await tnEcDowloader(data);
          if (filePath) {
            const file = await uploadFileGC(fileDestination, filePath);
            logger.info(`Saving Internal Document`);
            await createAttachement(
              caseId,
              file,
              data.sroName,
              "DOCUMENT_TYPE.INTERNAL_DOCUMENTS",
              data,
              "DOCUMENT_CATEGORY.INTERNAL_DOCUMENTS"
            );
            await deleteFile(filePath);
            logger.info(`Converting tamil ec`);
            const convertedPath = await convertTamilEC(file, fileDestination);
            await createAttachement(
              caseId,
              convertedPath,
              data.sroName,
              encumbranceType,
              data
            );
            logger.info(`Successfully processed TN-EC with Job ID:${id}`);
          }
        } catch (error) {
          logger.error(`Error processing TAMIL NADU: ${error.message}`);
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
  for (let i = 0; i < totalCPUs; i++) {
    cluster.fork(); // Spawn worker processes
  }

  cluster.on("exit", (worker, code, signal) => {
    logger.info(
      `Worker ${worker.process.pid} died with code ${code} and signal ${signal}`
    );
    logger.info("Forking another worker...");
    cluster.fork();
  });
  logger.info(
    `Master process ${process.pid} is running with ${totalCPUs} concurrent workers.`
  );
} else {
  // Each worker will process jobs with a concurrency limit
  Queue.process(totalCPUs, async (job) => {
    logger.info(`Worker ${process.pid} is processing job ${job.id}`);
    await processJob(job);
    logger.info(`Worker ${process.pid} finished job ${job.id}`);
  });
}
