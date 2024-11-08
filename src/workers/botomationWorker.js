const { Queue, BOTOMATION_TASKS } = require("../../queues");
const { deleteFile } = require("../../utils/deleteFile");
const { uploadFileGC } = require("../../utils/googleBucketUtils");
const logger = require("../../utils/logger");
const apEcDownloader = require("../automations/apEcDownloader");
const telEcDownloader = require("../automations/telEcDownloader");
const { createAttachement } = require("../services/nirnai.service");

Queue.on("ready", () => {
  logger.info("Queue is running and ready to process jobs.");
});

Queue.on("error", (error) => {
  logger.error(`Queue encountered an error: ${error.message}`);
  throw new Error("Queue is not running or cannot connect to Redis.");
});

Queue.on("stalled", (job) => {
  logger.warn(`Job ${job.id} stalled and will be retried.`);
});

Queue.process(async (job) => {
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
          const { filePath } = await apEcDownloader(data);
          if (filePath) {
            const file = await uploadFileGC(fileDestination, filePath);
            await createAttachement(caseId, file, encumbranceType);
            await deleteFile(filePath);
            logger.info(
              `Successfully processed ANDHRA PRADESH with Job ID:${id} `
            );
          }
        } catch (error) {
          logger.error(`Error processing ANDHRA PRADESH: ${error.message}`);
        }
        break;

      case "TELANGANA":
        try {
          const { filePath } = await telEcDownloader(data);
          // const file = await uploadFileGC(fileDestination, filePath);
          // await createAttachement(caseId, file, encumbranceType);
          // await deleteFile(filePath);
          logger.info(`Successfully processed TEL-EC with Job ID:${id} `);
        } catch (error) {
          logger.error(`Error processing TELANGANA: ${error.message}`);
        }
        break;

      case "TAMILNADU":
        try {
          // @TODO: few checks pending
          // await tamilNaduEcDownloader();
          logger.info(`Successfully processed TEL-EC with Job ID:${id} `);
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
});
