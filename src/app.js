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

// 404 handler 
app.use("*", (req, res) => {
  res.status(404).json({ message: "Route not found" });
});
app.listen(PORT, () => {
  return logger.info(`Express is listening at http://localhost:${PORT}`);
});
