const Queue = require("bull");
const BOTOMATION_TASKS = process.env.BOTOMATION_TASKS || "botomation_tasks";

const botomationQueue = new Queue(BOTOMATION_TASKS);

module.exports = { Queue: botomationQueue, BOTOMATION_TASKS };
