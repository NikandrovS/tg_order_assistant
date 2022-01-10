module.exports = (mongoose) => {
  const Meta = mongoose.model(
    "meta",
    mongoose.Schema(
      {
        stockSheet: String,
      },
      { timestamps: true }
    )
  );

  return Meta;
};
