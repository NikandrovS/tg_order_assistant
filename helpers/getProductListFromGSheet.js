const { google } = require("googleapis");

const productList = async function () {
    const auth = new google.auth.GoogleAuth({
        keyFile: "keys.json",
        scopes: "https://www.googleapis.com/auth/spreadsheets"
    });

    const authClientObject = await auth.getClient();
    const googleSheetsInstance = google.sheets({ version: "v4", auth: authClientObject });
    const spreadsheetId = process.env.GOOGLE_ORDER_SHEET;

    const readData = await googleSheetsInstance.spreadsheets.values.get({
        auth, //auth object
        spreadsheetId, // spreadsheet id
        range: process.env.GOOGLE_PRODUCT_LIST + "!A2:B" //range of cells to read from.
    });
    if (readData.data.values) {
        return readData.data.values.reduce((acc, value) => {
            return [...acc, { name: value[0].trim(), package: parseFloat(value[1].replace(/\,/g, '.')) }];
        }, []);
    } else {
        return false;
    }
};

module.exports = productList;
