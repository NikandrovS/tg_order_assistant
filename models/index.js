const dbConfig = require("../config/db.config.js");

const mongoose = require("mongoose");
mongoose.Promise = global.Promise;

const db = {};
db.mongoose = mongoose;
db.url = dbConfig.url;
db.orders = require("./orders.model")(mongoose);
db.company = require("./company.model")(mongoose);

module.exports = db;
