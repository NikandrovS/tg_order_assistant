const db = require("../models");
const Company = db.company;

// Create and Save a new Tutorial
exports.create = async (req, res) => {
    try {
        const order = await new Company({
            company: req.body.company,
            user: req.body.user,
            description: req.body.description
        }).save();

        res.send(order);
    } catch (err) {
        res.status(500).send({
            message: err.message || "Some error occurred while creating the company."
        });
    }
};

exports.findById = async (req, res) => {
    try {
        const companies = await Company.find({ user: req.params.userId }, {
            createdAt: 0,
            updatedAt: 0,
            __v: 0
        }).sort({ createdAt: -1 });
        res.send(companies);
    } catch (err) {
        res.status(500).send({
            message: err.message || "Some error occurred while getting Orders."
        });
    }
};

exports.findAll = async (req, res) => {
    try {
        const companies = await Company.find({}, { createdAt: 0, updatedAt: 0, __v: 0 }).sort({ user: -1 });
        res.send(companies);
    } catch (err) {
        res.status(500).send({
            message: err.message || "Some error occurred while getting Orders."
        });
    }
};

exports.delete = async (req, res) => {
    try {
        const company = await Company.findByIdAndRemove(req.params.id);
        res.send(company);
    } catch (err) {
        res.status(500).send({
            message: err.message || "Some error occurred while deleting."
        });
    }
};

