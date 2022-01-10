module.exports = app => {
    const meta = require("../controllers/meta.controller.js");
    const orders = require("../controllers/order.controller.js");
    const company = require("../controllers/company.controller.js");

    const router = require("express").Router();

    // Create a new order
    router.post("/", orders.create);

    // Retrieve all orders
    router.get("/", orders.findAll);

    // Download xlsx document
    router.get("/download", orders.downloadReport);

    // Create a new company
    router.post("/company", company.create);

    // Get all companies
    router.get("/company/all", company.findAll);

    // Get user companies
    router.get("/company/:userId", company.findById);

    // Delete company
    router.delete("/company/:id", company.delete);

    // Meta data
    router.get("/meta", meta.getData);
    router.get("/meta/updateStockSheet", meta.updateStockSheet);
    router.delete("/meta/deleteConfig", meta.deleteMainRecord);

    app.use('/api', router);
};
