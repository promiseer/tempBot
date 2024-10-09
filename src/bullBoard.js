const { createBullBoard } = require("@bull-board/api");
const { BullAdapter } = require("@bull-board/api/bullAdapter");
const { ExpressAdapter } = require("@bull-board/express");
const { Queue } = require("../queues");

const serverAdapter = new ExpressAdapter();
createBullBoard({
  queues: [new BullAdapter(Queue)],
  serverAdapter,
});

serverAdapter.setBasePath("/admin/queues");

module.exports = serverAdapter.getRouter(); // Export the serverAdapter to use in your app
