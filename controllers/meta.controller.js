const db = require("../models");
const Meta = db.meta;

exports.deleteMainRecord = async (req, res) => {
  try {
    const meta = await Meta.findOne().sort({ created_at: 1 });
    await Meta.findByIdAndRemove(meta._id);
    res.send(meta);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while deleting.",
    });
  }
};

exports.getData = async (req, res) => {
  try {
    const companies = await Meta.find({}, { _id: 0, createdAt: 0, updatedAt: 0, __v: 0 });
    res.send(companies[0]);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while getting meta info.",
    });
  }
};

exports.updateStockSheet = async (req, res) => {
  const sheetId = req.query.sheetId;
  try {
    await Meta.findOneAndUpdate({}, { $set: { stockSheet: sheetId } }, { upsert: true });
    res.send({ status: "ok" });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while setting meta info.",
    });
  }
};
