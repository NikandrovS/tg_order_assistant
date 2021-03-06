module.exports = mongoose => {
    const Order = mongoose.model(
        "order",
        mongoose.Schema(
            {
                user: { type: String, required: true },
                store: { type: Object, required: true },
                product: { type: Array, required: true },
                comment: { type: String },
            },
            { timestamps: true }
        )
    );

    return Order;
};
