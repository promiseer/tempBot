const { Queue, BOTOMATION_TASKS } = require("../../queues");
const { uploadFileGC } = require("../../utils/googleBucketUtils");
const logger = require("../../utils/logger");
const apEcDownloader = require("../automations/apEcDownloader");
const telEcDownloader = require("../automations/telEcDownloader");
const { createAttachement } = require("../services/nirnai.service");

Queue.process(async (job) => {
  const { queue, data, id } = job;
  const { state, caseId, filePath: fileDestination } = data;

  logger.info(`Received job for queue: ${queue.name} and Job ID:${id}`);

  try {
    if (queue.name !== BOTOMATION_TASKS) {
      throw new Error(
        `Invalid queue. Expected: ${BOTOMATION_TASKS}, but got: ${queue.name}`
      );
    }
    logger.info(`Worker listening to '${queue.name}' queue`);
    switch (state) {
      case "ANDHRA_PRADESH":
        try {
          const { filePath } = await apEcDownloader(data);
          if (filePath) {
            const file = await uploadFileGC(fileDestination, filePath);
            await createAttachement(caseId, file);
            logger.info(
              `Successfully processed ANDHRA_PRADESH with Job ID:${id} `
            );
          }
        } catch (error) {
          logger.error(`Error processing ANDHRA_PRADESH: ${error.message}`);
        }
        break;

      case "TELANGANA":
        try {
          // @TODO: few checks pending
          // await telEcDownloader();
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
