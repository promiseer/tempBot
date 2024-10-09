const { Queue, BOTOMATION_TASKS } = require("../../queues");
const { uploadFileGC } = require("../../utils/googleBucketUtils");
const logger = require("../../utils/logger");
const apEcDownloader = require("../automations/apEcDownloader");
const telEcDownloader = require("../automations/telEcDownloader");
const { createAttachement } = require("../services/nirnai.service");

Queue.process(async (job) => {
  const { queue, data, id } = job;
  const { EC_TYPE, OPTIONS } = data;

  logger.info(`Received job for queue: ${queue.name} and Job ID:${id}`);

  try {
    if (queue.name !== BOTOMATION_TASKS) {
      throw new Error(
        `Invalid queue. Expected: ${BOTOMATION_TASKS}, but got: ${queue.name}`
      );
    }
    logger.info(`Worker listening to '${queue.name}' queue`);
    switch (EC_TYPE) {
      case "AP_EC":
        try {
          const { filePath } = await apEcDownloader(OPTIONS);
          if (filePath) {
            const file = await uploadFileGC(filePath);
            await createAttachement(OPTIONS, file);
            logger.info(`Successfully processed AP-EC with Job ID:${id} `);
          }
        } catch (error) {
          logger.error(`Error processing AP-EC: ${error.message}`);
        }
        break;

      case "TEL_EC":
        try {
          // @TODO: few checks pending
          // await telEcDownloader(OPTIONS);
          logger.info(`Successfully processed TEL-EC with Job ID:${id} `);
        } catch (error) {
          logger.error(`Error processing AP-EC: ${error.message}`);
        }
        break;

      default:
        throw new Error(`Unsupported EC_TYPE: ${EC_TYPE}`);
    }
  } catch (error) {
    logger.info(error.message);
  }
});
