const db = require("../models");
const Order = db.orders;

// Create and Save a new Tutorial
exports.create = async (req, res) => {
    try {
        const order = await new Order({
            user: req.body.user,
            store: {
                name: req.body.store.name,
                code: req.body.store.code || null,
            },
            product: req.body.product,
        }).save();

        res.send(order);
    } catch (err) {
        res.status(500).send({
            message: err.message || "Some error occurred while creating the Order."
        });
    }
};

// Retrieve all Tutorials from the database.
exports.findAll = async (req, res) => {
    try {
        const orders = await Order.find({}, { _id: 0, updatedAt: 0, __v: 0 }).sort({ createdAt: -1 });
        res.send(orders);
    } catch (err) {
        res.status(500).send({
            message: err.message || "Some error occurred while getting Orders."
        });
    }
};

// Find a single Tutorial with an id
exports.downloadReport = async (req, res) => {
    try {
        const orders = await Order.find({}, { _id: 0, updatedAt: 0, __v: 0 }).sort({ createdAt: -1 });
        const contentDisposition = require('content-disposition');

        async function CreateXLSX() {
            const Excel = require('exceljs');
            const temp = require('temp');
            const fs = require('fs');
            const workbook = new Excel.Workbook();
            let columns = [
                { header: `Клиент`, key: 'user', width: 20 },
                { header: `Точка заказа`, key: 'store', width: 20 },
                { header: `Продукт`, key: 'product', width: 20 },
                { header: `Количество, кг.`, key: 'count', width: 20 },
                { header: `Дата заказа`, key: 'createdAt', width: 20 }

            ];

            const worksheet = workbook.addWorksheet('Выгрузка базы');

            worksheet.columns = columns;

            orders.forEach(order => {
                worksheet.addRow(order);
            });

            const path = temp.path({ suffix: '.xlsx' });
            await workbook.xlsx.writeFile(path);

            const stream = fs.createReadStream(path);
            stream.on('end', () => {
                stream.close();
                fs.unlink(path, () => {
                });
            });

            return stream;
        }

        const stream = await CreateXLSX();
        const uploadedFileName = `report.xlsx`;
        res.setHeader('Content-Disposition', contentDisposition(uploadedFileName));
        stream.pipe(res);
    } catch (err) {
        res.status(500).send({
            message: err.message || "Some error occurred while download report."
        });
    }

};

// Update a Tutorial by the id in the request
exports.update = (req, res) => {

};

// Delete a Tutorial with the specified id in the request
exports.delete = (req, res) => {

};

// Delete all Tutorials from the database.
exports.deleteAll = (req, res) => {

};

// Find all published Tutorials
exports.findAllPublished = (req, res) => {

};
