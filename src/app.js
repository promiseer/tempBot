const express = require("express");
const morgan = require("morgan");
const routes = require("./routes");
const { PORT } = require("../config/config");
const bullBoard = require("./bullBoard"); // Import your Bull Board setup
const logger = require("../utils/logger");
const app = express();

app.use(express.json());
app.use(morgan("dev"));

//routes
app.use("/api/v1/", routes);
app.use("/admin/queues", bullBoard);

app.listen(PORT, () => {
  return logger.info(`Express is listening at http://localhost:${PORT}`);
});
