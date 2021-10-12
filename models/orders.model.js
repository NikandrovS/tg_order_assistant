module.exports = mongoose => {
    const Order = mongoose.model(
        "order",
        mongoose.Schema(
            {
                user: {type: String, required: true},
                store: {type: String, required: true},
                product: {type: String, required: true},
                count: {type: Number, required: true}
            },
            { timestamps: true }
        )
    );

    return Order;
};
