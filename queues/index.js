const Queue = require("bull");
const logger = require("../utils/logger");
const { redisUrl } = require("../config/config");
const BOTOMATION_TASKS = process.env.BOTOMATION_TASKS || "botomation_tasks";
let botomationQueue;
try {
  botomationQueue = new Queue(BOTOMATION_TASKS, {
    redis: redisUrl
  });
} catch (error) {
  logger.error(error.message);
}

module.exports = { Queue: botomationQueue, BOTOMATION_TASKS };
