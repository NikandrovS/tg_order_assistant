const express = require('express');
require('dotenv').config();
const cors = require("cors");
const app = express();
const port = 3000;
require('./telegraf.js');

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const db = require("./models/index");
db.mongoose
    .connect(db.url, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })
    .then(() => {
        console.log("Connected to the database!");
    })
    .catch(err => {
        console.log("Cannot connect to the database!", err);
        process.exit();
    });

app.get('/', (req, res) => {
    res.send('Its works!');
});

require("./routes/orders.routes")(app);

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${ port }`);
});
