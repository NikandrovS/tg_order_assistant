module.exports = app => {
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

    // Get user companies
    router.get("/company/:userId", company.findAll);

    // Delete company
    router.delete("/company/:id", company.delete);

    app.use('/api', router);
};
