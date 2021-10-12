module.exports = mongoose => {
    const Company = mongoose.model(
        "company",
        mongoose.Schema(
            {
                company: {type: String, required: true},
                user: {type: String, required: true},
            },
            { timestamps: true }
        )
    );

    return Company;
};
