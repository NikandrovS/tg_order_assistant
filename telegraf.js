const { google } = require("googleapis");
const axios = require('axios');
const { Telegraf, session, Scenes: { BaseScene, Stage }, Markup } = require('telegraf');
const helpers = require('./helpers/index')
const productCells = require('./config/productCells.config');
const localProducts = require('./config/product.config');

const company_keyboard = Markup.inlineKeyboard([
    [
        Markup.button.callback('Присвоить организацию', 'add'),
        Markup.button.callback('Удалить организацию', 'edit')
    ],
    [
        Markup.button.callback('Сравнение с остатками', 'stockBalance')
    ]
]);
const new_company_keyboard = Markup.inlineKeyboard([
    [
        Markup.button.callback('Добавить', 'add')
    ],
    [
        Markup.button.callback('Сравнение с остатками', 'stockBalance')
    ]
]);
const turn_on_keyboard = Markup.inlineKeyboard([
    [
        Markup.button.callback('Включить', 'turnOnStockBalance')
    ],
    [
        Markup.button.callback('Отмена', 'cancel')
    ]
]);
const turn_off_keyboard = Markup.inlineKeyboard([
    [
        Markup.button.callback('Выключить', 'turnOffStockBalance')
    ],
    [
        Markup.button.callback('Отмена', 'cancel')
    ]
]);
const delete_keyboard = (id) => Markup.inlineKeyboard([
    Markup.button.callback('Удалить', 'delete:' + id)
]);
const product_count_keyboard = (productId) => Markup.inlineKeyboard([
    [
        Markup.button.callback('-', 'decrease:' + productId),
        Markup.button.callback('+', 'increase:' + productId)
    ],
    [
        Markup.button.callback('<< В меню', 'back'),
        Markup.button.callback('Далее >>', 'return:' + productId)
    ]
]);
const return_product_count_keyboard = (productId) => Markup.inlineKeyboard([
    [
        Markup.button.callback('-', 'decreasePiece:' + productId),
        Markup.button.callback('+', 'increasePiece:' + productId)
    ],
    [
        Markup.button.callback('✓ Ok', 'cancel')
    ]
]);
const company_confirm_keyboard = Markup.inlineKeyboard([
    Markup.button.callback('Пропустить', 'skip'),
    Markup.button.callback('Продолжить', 'continue')
]);
const order_confirm_keyboard = Markup.inlineKeyboard([
    Markup.button.callback('Назад', 'back'),
    Markup.button.callback('Заказать', 'confirm')
]);
const cancel_keyboard = Markup.inlineKeyboard([
    Markup.button.callback('Отмена', 'cancel')
]);

function product_keyboard(products) {
    return Markup.inlineKeyboard(
        products
            .reduce((acc, item, idx) => {
                const isAvailable = item.stockRemains >= item.package;
                return [...acc, Markup.button.callback(isAvailable ? item.name : '❌ ' + item.name, isAvailable ? 'choose:' + idx : 'return:' + idx)];
            }, [])
            .reduce((resultArray, item, index, array) => {
                const chunkIndex = Math.floor(index / 2);

                if (!resultArray[chunkIndex]) {
                    resultArray[chunkIndex] = []; // start a new chunk
                }

                resultArray[chunkIndex].push(item);

                if (index === array.length - 1) {
                    resultArray.push([
                        Markup.button.callback('Отмена', 'cancel'),
                        Markup.button.callback('Продолжить', 'continue')
                    ]);
                }

                return resultArray;
            }, [])
    );
}

// Оформление заказа
const orderScene = new BaseScene('orderScene');
orderScene.enter(async ctx => {
    if (!ctx.session.companyList.length) {
        await ctx.reply('У вас нет доступных организаций');
        return ctx.scene.leave();
    }
    const { message_id } = await ctx.reply(`Выбор организации.`);
    ctx.scene.state.welcomeMessage = message_id;
    return ctx.reply(`Организация: ${ ctx.session.companyList[0].company }. Желаете продолжить?`, company_confirm_keyboard);
});
orderScene.action('continue', async ctx => {
    ctx.deleteMessage();
    ctx.deleteMessage(ctx.scene.state.welcomeMessage);
    ctx.session.store = ctx.session.companyList[0].company;
    await ctx.reply(`Выбрана организация: ${ ctx.session.store }.`);
    setTimeout(() => {
        return ctx.scene.enter('itemScene');
    }, 500);
});
orderScene.action('skip', ctx => {
    ctx.deleteMessage();
    ctx.deleteMessage(ctx.scene.state.welcomeMessage);
    ctx.session.companyList.shift();
    if (ctx.session.companyList.length) {
        return ctx.scene.enter('orderScene');
    }
    return ctx.scene.leave();
});
orderScene.leave(async ctx => ctx.session.cart = []);

// Выбор продукта
const itemScene = new BaseScene('itemScene');
itemScene.enter(async ctx => {
    ctx.session.products = await helpers.getProductList() || localProducts;

    ctx.reply(ctx.session.cart.length ? cartPreviewGenerator(ctx.session.cart) : `Какой продукт необходимо доставить в ${ ctx.session.store }?`, product_keyboard(ctx.session.products));
});

// Выбор продукта
itemScene.action(/choose:[0-9]{1,2}/, ctx => {
    const id = ctx.callbackQuery.data.split(':')[1];
    const name = ctx.session.products[id].name;
    const itemInCart = ctx.session.cart.findIndex(product => product.id === id);
    let text = `Заказ - ${ name }`;

    if (itemInCart === -1) return ctx.editMessageText(text, product_count_keyboard(id));

    text += `: ${ ctx.session.cart[itemInCart].order } ${ helpers.measuringType(name) }`
    return ctx.editMessageText(text, product_count_keyboard(id));
});
itemScene.action('cancel', ctx => {
    ctx.deleteMessage();
    ctx.reply('Отменено');
    return ctx.scene.leave();
});

// Действия с продуктом
itemScene.action(/return:[0-9]{1,2}/, ctx => {
    ctx.deleteMessage();
    const id = ctx.callbackQuery.data.split(':')[1];
    return ctx.scene.enter('returnScene', { product: id });
});
itemScene.action('back', ctx => {
    return ctx.editMessageText(ctx.session.cart.length ? cartPreviewGenerator(ctx.session.cart) : `Какой продукт необходимо доставить в ${ ctx.session.store }?`, product_keyboard(ctx.session.products));
});

function cartPreviewGenerator(cart) {
    let totalString = 'В вашем заказе:';
    let index = 0;

    cart.forEach(product => {
        index++;
        if (product.order || product.return) {
            totalString += `\n${ index }) ${ product.name } - `;
        } else {
            index--;
        }
        if (product.order) {
            totalString += `заказ ${ product.order } ${ helpers.measuringType(product.name) }`;
        }
        if (product.order && product.return) {
            totalString += `/ `;
        }
        if (product.return) {
            totalString += `возврат ${ product.return } ${ helpers.returnMeasuringType(product.name) }`;
        }
    });
    return totalString;
}

itemScene.action('continue', ctx => {
    if (!ctx.session.cart.length) return;
    ctx.deleteMessage();
    return ctx.scene.enter('confirmScene');
});

// Действие с весом
itemScene.action(/increase:[0-9]{1,2}/, async ctx => {
    const id = ctx.callbackQuery.data.split(':')[1];
    const name = ctx.session.products[id].name
    let itemInCart = ctx.session.cart.findIndex(product => product.id === id);

    if (itemInCart === -1) {
        itemInCart = (ctx.session.cart.push({ id, name, order: 0, return: 0 })) - 1;
    }

    const weight = ctx.session.cart[itemInCart].order + ctx.session.products[id].package;
    if (ctx.session.stockBalance && weight > ctx.session.products[id].stockRemains) {
        const { message_id } = await ctx.reply('Такого количества нет в наличии! ' + +weight.toFixed(2) + helpers.measuringType(name))
        setTimeout(() => {
            ctx.deleteMessage(message_id);
        }, 1500);
        return
    } 

    ctx.session.cart[itemInCart].order = +weight.toFixed(2);

    const text = `Заказ - ${ ctx.session.products[id].name }: ${ ctx.session.cart[itemInCart].order } ${ helpers.measuringType(name) }`

    return ctx.editMessageText(text, product_count_keyboard(id));
});
itemScene.action(/decrease:[0-9]{1,2}/, ctx => {
    const id = ctx.callbackQuery.data.split(':')[1];
    const name = ctx.session.products[id].name;
    const itemInCart = ctx.session.cart.findIndex(product => product.id === id);
    if (itemInCart === -1) return;

    if (ctx.session.cart[itemInCart].order >= ctx.session.products[id].package) {
        const weight = ctx.session.cart[itemInCart].order - ctx.session.products[id].package;
        ctx.session.cart[itemInCart].order = +weight.toFixed(2);
    } else {
        return;
    }

    const text = `Заказ - ${ name }: ${ ctx.session.cart[itemInCart] ? ctx.session.cart[itemInCart].order : 0 } ${ helpers.measuringType(name) }`;

    return ctx.editMessageText(text, product_count_keyboard(id));
});

itemScene.leave();

const returnScene = new BaseScene('returnScene');
returnScene.enter(async ctx => {
    // Проверяем регуляркой наличие тега (шт) в названии товара
    const id = ctx.scene.state.product
    const productName = ctx.session.products[id].name
    const isPieceReturn = productName.match(/\(шт\)/gm);
    if (isPieceReturn) {
        const { message_id } = await ctx.reply('Возврат: укажите количество упаковок.', return_product_count_keyboard(id));
        ctx.scene.state.welcomeMessage = message_id;
    } else {
        const { message_id } = await ctx.reply('Возврат: введите вес в граммах.', cancel_keyboard);
        ctx.scene.state.welcomeMessage = message_id;
    }
});
returnScene.action(/increasePiece:[0-9]{1,2}/, ctx => {
    const id = ctx.callbackQuery.data.split(':')[1];
    const name = ctx.session.products[id].name;
    let itemInCart = ctx.session.cart.findIndex(product => product.id === id);

    if (itemInCart === -1) {
        itemInCart = (ctx.session.cart.push({ id, name: ctx.session.products[id].name, order: 0, return: 0 })) - 1;
    }

    const weight = ctx.session.cart[itemInCart].return + ctx.session.products[id].package;
    ctx.session.cart[itemInCart].return = +weight.toFixed(2);

    return ctx.editMessageText(`Возврат - ${ name }: ${ ctx.session.cart[itemInCart].return } ${ helpers.measuringType(name) }`, return_product_count_keyboard(id));
});
returnScene.action(/decreasePiece:[0-9]{1,2}/, ctx => {
    const id = ctx.callbackQuery.data.split(':')[1];
    const name = ctx.session.products[id].name;
    let itemInCart = ctx.session.cart.findIndex(product => product.id === id);

    if (itemInCart === -1 || !ctx.session.cart[itemInCart].return) return

    const weight = ctx.session.cart[itemInCart].return - ctx.session.products[id].package;
    ctx.session.cart[itemInCart].return = +weight.toFixed(2);

    return ctx.editMessageText(`Возврат - ${ name }: ${ ctx.session.cart[itemInCart].return } ${ helpers.measuringType(name) }`, return_product_count_keyboard(id));
});
returnScene.on('text', ctx => {
    const id = ctx.scene.state.product;
    if (!isNaN(parseInt(ctx.message.text))) {
        ctx.deleteMessage(ctx.message.message_id);

        let itemInCart = ctx.session.cart.findIndex(product => product.id === id);

        if (itemInCart === -1) {
            itemInCart = (ctx.session.cart.push({ id, name: ctx.session.products[id].name, order: 0, return: 0 })) - 1;
        }

        ctx.session.cart[itemInCart].return = parseInt(ctx.message.text);
        return ctx.scene.leave();
    } else {
        return ctx.reply('Введите число');
    }
});
returnScene.action('cancel', ctx => ctx.scene.leave());
returnScene.leave(ctx => {
    ctx.deleteMessage(ctx.scene.state.welcomeMessage);
    setTimeout(() => {
        return ctx.scene.enter('itemScene');
    }, 0);
});

const confirmScene = new BaseScene('confirmScene');
confirmScene.enter(ctx => {
    const notEmptyProduct = (product) => (product.order !== 0 || product.return !== 0);
    ctx.session.cart = ctx.session.cart.filter(notEmptyProduct);

    let totalString = '<b>В вашем заказе:</b>';

    ctx.session.cart.forEach((product, idx) => {
        if (product.order || product.return) {
            totalString += `\n${ idx + 1 }) ${ product.name } - `;
        }
        if (product.order) {
            totalString += `заказ ${ product.order } ${ helpers.measuringType(product.name) }`;
        }
        if (product.order && product.return) {
            totalString += `/ `;
        }
        if (product.return) {
            totalString += `возврат ${ product.return } ${ helpers.returnMeasuringType(product.name) }`;
        }
    });

    ctx.scene.state.orderProducts = totalString;

    return ctx.replyWithHTML(totalString, order_confirm_keyboard);
});

confirmScene.action('back', ctx => {
    ctx.deleteMessage();
    return ctx.scene.enter('itemScene');
});
confirmScene.action('confirm', async ctx => {
    ctx.deleteMessage();

    if (ctx.session.stockBalance) {
      // Получаем текущее значение склада
      const stockBalance = await helpers.getStockBalance();
      const unAvailableProducts = [];

      ctx.session.cart.forEach((product) => {
        if (stockBalance[product.id] < product.order) {
          unAvailableProducts.push(product);
        }
      });

      if (unAvailableProducts.length) {
        let text = "Наличие изменилось для следующих товаров:";
        unAvailableProducts.forEach((product) => {
          text += `\n${product.name}`;
          ctx.session.cart = ctx.session.cart.filter(
            (item) => item.id !== product.id
          );
        });

        ctx.reply(text);
        return ctx.scene.enter("itemScene");
      }
    }
    
    ctx.replyWithHTML(ctx.scene.state.orderProducts);
    ctx.session.user = ctx.update.callback_query.from.id;
    return ctx.scene.enter('uploadScene');
});

const uploadScene = new BaseScene('uploadScene');
uploadScene.enter(async ctx => {
    const data = {
        user: ctx.session.user,
        store: ctx.session.store,
        product: ctx.session.cart
    };
    try {
        const res = await axios.post(process.env.BACKEND_HOST + '/api', data);

        if (res.status === 200) {
            await ctx.reply(`Ваш заказ на организацию ${ ctx.session.store } оформлен.`);

            const auth = new google.auth.GoogleAuth({
                keyFile: "keys.json", //the key file
                scopes: "https://www.googleapis.com/auth/spreadsheets" //url to spreadsheets API
            });

            //Auth client Object
            const authClientObject = await auth.getClient();

            //Google sheets instance
            const googleSheetsInstance = google.sheets({ version: "v4", auth: authClientObject });

            const spreadsheetId = process.env.GOOGLE_ORDER_SHEET;

            let renderArray = [];

            // Добавляем строку с пустыми значениями
            const emptyCells = [];
            for (let i = 0; i < 28; i++) {
              if (!i) {
                emptyCells.push(res.data.user);
                emptyCells.push(res.data.store);
                emptyCells.push(new Date(res.data.createdAt).toLocaleDateString());
              }
              emptyCells.push(0);
            }
            // Проходимся по каждому товару, узнаем id ячеек по имени продукта
            for (let i = 0; i < res.data.product.length; i++) {
                const productObj = productCells.find(product => product.name.toLowerCase() === res.data.product[i].name.toLowerCase());
                if (res.data.product[i].order) {
                    emptyCells[productObj.orderCellId] = res.data.product[i].order;
                }
                if (res.data.product[i].return) {
                    emptyCells[productObj.returnCellId] = res.data.product[i].return;
                }
            }
            renderArray.push(emptyCells);

            //write data into the google sheets
            await googleSheetsInstance.spreadsheets.values.append({
                auth, //auth object
                spreadsheetId, //spreadsheet id
                range: process.env.GOOGLE_ORDER_LIST + "!A:AF", //sheet name and range of cells
                valueInputOption: "USER_ENTERED", // The information will be passed according to what the user passes in as date, number or text
                resource: {
                    values: renderArray
                }
            });

            const reeplyChatId = process.env.REPLY_CHAT_ID;
            if (reeplyChatId) {
              ctx.telegram.sendMessage(
                reeplyChatId,
                "Оформлен новый заказ. Организация: " + ctx.session.store
              );
            }
            
            if (ctx.session.stockBalance) {
                // Удаляем айди, дату и оставшиеся четные значения возвратов
                const orderTotal = emptyCells.slice(3).filter((e,i)=>!(i%2));
                // Получаем текущее значение склада
                const stockBalance = await helpers.getStockBalance(true);
                // Суммируем оба массива
                for (let i = 0; i < stockBalance.length; i++) {
                    stockBalance[i] += orderTotal[i];
                }
                // Записываем новые значения
                await helpers.setStockBalance(stockBalance)
            }

        }
    } catch (err) {
        console.log(err.message || err);
        return ctx.reply(`Заказ не оформлен. При оформлении возникла ошибка.`);
    }
    if (ctx.session.companyList.length > 1) {
        ctx.session.companyList.shift();
        setTimeout(() => {
            return ctx.scene.enter('orderScene');
        }, 1000);
    } else {
        return ctx.reply('Спасибо!');
    }
});

// Оформление по шаблону
const templateScene = new BaseScene('templateScene');
templateScene.enter(async ctx => {
    const { message_id } = await ctx.reply('Отправьте шаблон:\nНазвание организации\nНазвание продукта + заказ в кг. + возврат в гр.', cancel_keyboard);
    ctx.scene.state.welcomeMessage = message_id;
});
templateScene.on('text', async ctx => {
    const cart = [];

    const templateData = ctx.message.text.split(/\n/);
    if (templateData.length < 2) return errorHandler('Сообщение должно содержать не менее двух строк.');

    const store = templateData[0];
    ctx.scene.state.store = store;

    for (let i = 1; i < templateData.length; i++) {
        const item = templateData[i].match(/(?<name>[а-яёА-Я]*\s?[а-яёА-Я]*\s?[а-яёА-Я]*\s?[а-яёА-Я]*)\s+(?<order>[0-9][\.\,]?[0-9]*)\s+(?<return>[0-9]*)/);
        if (!item) return errorHandler('Товары не распознаны. Пример: Паштет 2 100');
        cart.push(item.groups);
    }
    ctx.scene.state.cart = cart;

    let totalString = `Организация: ${ store }\n\nВ заказе:`;
    cart.forEach((product, idx) => {
        if (product.order || product.return) {
            totalString += `\n${ idx + 1 }) ${ product.name } - `;
        }
        if (product.order) {
            totalString += `заказ ${ product.order } ${ helpers.measuringType(product.name) }`;
        }
        if (product.order && product.return) {
            totalString += `/ `;
        }
        if (product.return) {
            totalString += `возврат ${ product.return } ${ helpers.returnMeasuringType(product.name) }`;
        }
    });

    function errorHandler(errorText) {
        ctx.reply(errorText);
    }

    ctx.deleteMessage(ctx.scene.state.welcomeMessage);
    return ctx.replyWithHTML(totalString, order_confirm_keyboard);
});
templateScene.action('back', async ctx => {
    ctx.deleteMessage();
    const { message_id } = await ctx.reply('Отправьте шаблон', cancel_keyboard);
    ctx.scene.state.welcomeMessage = message_id;
});
templateScene.action('confirm', ctx => {
    ctx.deleteMessage();
    ctx.session.user = ctx.update.callback_query.from.id;
    ctx.session.store = ctx.scene.state.store;
    ctx.session.cart = ctx.scene.state.cart;
    ctx.session.companyList = 0;
    return ctx.scene.enter('uploadScene');
});
templateScene.action('cancel', ctx => {
    ctx.deleteMessage();
    ctx.reply('Отменено');
    return ctx.scene.leave();
});
templateScene.leave();

// Добавление компании
const newCompanyScene = new BaseScene('newCompanyScene');
newCompanyScene.enter(async ctx => {
    const { message_id } = await ctx.reply('Введите название организации', cancel_keyboard);
    ctx.scene.state.welcomeMessage = message_id;
});
newCompanyScene.on('text', async ctx => {
    ctx.deleteMessage();
    ctx.deleteMessage(ctx.scene.state.welcomeMessage);
    return ctx.scene.enter('newCompanyUserIdScene', { company: ctx.message.text });
});
newCompanyScene.action('cancel', ctx => {
    ctx.reply('Отменено');
    return ctx.scene.leave();
});
newCompanyScene.leave();

const newCompanyUserIdScene = new BaseScene('newCompanyUserIdScene');
newCompanyUserIdScene.enter(async ctx => {
    const { message_id } = await ctx.reply('Введите идентификатор', cancel_keyboard);
    ctx.scene.state.welcomeMessage = message_id;
});
newCompanyUserIdScene.on('text', ctx => {
    if (!isNaN(parseInt(ctx.message.text))) {
        ctx.deleteMessage();
        ctx.deleteMessage(ctx.scene.state.welcomeMessage);
        return ctx.scene.enter('newCompanyDescriptionScene', {
            id: ctx.message.text,
            company: ctx.scene.state.company
        });
    } else {
        return ctx.reply('Введите число');
    }
});
newCompanyUserIdScene.action('cancel', ctx => {
    ctx.reply('Отменено');
    return ctx.scene.leave();
});

const newCompanyDescriptionScene = new BaseScene('newCompanyDescriptionScene');
newCompanyDescriptionScene.enter(async ctx => {
    const { message_id } = await ctx.reply('Кому принадлежит идентификатор', cancel_keyboard);
    ctx.scene.state.welcomeMessage = message_id;
});
newCompanyDescriptionScene.on("text", async ctx => {
    ctx.deleteMessage();
    ctx.deleteMessage(ctx.scene.state.welcomeMessage);
    try {
        const res = await axios.post(process.env.BACKEND_HOST + '/api/company', {
            user: ctx.scene.state.id,
            company: ctx.scene.state.company,
            description: ctx.message.text
        });
        if (res.status === 200) {
            ctx.reply(`Организация "${ ctx.scene.state.company }" добавлена для пользователя с id ${ ctx.scene.state.id }`);
            return ctx.scene.leave();
        }
    } catch (e) {
        ctx.reply(e.message || e);
        return ctx.reply('Ошибка при добавлении.');
    }
});
newCompanyDescriptionScene.action('cancel', ctx => {
    ctx.reply('Отменено');
    return ctx.scene.leave();
});

// Настройки
const settingScene = new BaseScene('settingScene');
settingScene.enter(async ctx => {
    const res = await axios.get(process.env.BACKEND_HOST + '/api/company/all');
    ctx.scene.state.availableCompnaies = res.data;
    if (!res.data.length) {
        return ctx.reply('Выберите действие', new_company_keyboard);
    } else {
        return ctx.reply('Выберите действие', company_keyboard);
    }
});
settingScene.action('edit', ctx => {
    ctx.editMessageText('Выберите действие', cancel_keyboard);
    ctx.scene.state.availableCompnaies.forEach(record => {
        ctx.reply(`${ record.company }\n${ record.user }\n${ record.description || '' }`, delete_keyboard(record._id));
    });
});
settingScene.action('add', ctx => {
    ctx.deleteMessage();
    ctx.scene.leave();
    return ctx.scene.enter('newCompanyScene');
});
settingScene.action('stockBalance', ctx => {
    ctx.session.stockBalance = ctx.session.stockBalance ?? (ctx.session.stockBalance = true)
    if (ctx.session.stockBalance) {
        return ctx.editMessageText('Выключить сравнение с остатками', turn_off_keyboard);
    }
    return ctx.editMessageText('Включить сравнение с остатками', turn_on_keyboard);
});
settingScene.action(/^delete:.*/, async ctx => {
    const id = ctx.callbackQuery.data.split(':')[1];
    const res = await axios.delete(process.env.BACKEND_HOST + '/api/company/' + id);
    if (res.status === 200) {
        ctx.reply('Организация удалена');
    } else {
        ctx.reply('Произошла ошибка');
    }
    return ctx.scene.leave();
});
settingScene.action('turnOnStockBalance', ctx => {
    ctx.deleteMessage();
    ctx.reply('Сравнение с остатками включено');
    ctx.session.stockBalance = true
    return ctx.scene.leave();
});
settingScene.action('turnOffStockBalance', ctx => {
    ctx.deleteMessage();
    ctx.reply('Сравнение с остатками выключено');
    ctx.session.stockBalance = false
    return ctx.scene.leave();
});
settingScene.action('cancel', ctx => {
    ctx.reply('Отменено');
    return ctx.scene.leave();
});

const stage = new Stage([templateScene, orderScene, itemScene, confirmScene, returnScene, uploadScene, settingScene, newCompanyScene, newCompanyUserIdScene, newCompanyDescriptionScene]);

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session(), stage.middleware());
bot.command('/start', ctx => ctx.reply('Добро пожаловать'));
bot.command('/order', async ctx => {
    const res = await axios.get(process.env.BACKEND_HOST + '/api/company/' + ctx.update.message.from.id);
    ctx.session.companyList = res.data;
    ctx.session.stockBalance = ctx.session.stockBalance ?? (ctx.session.stockBalance = true)

    return ctx.scene.enter('orderScene');
});
bot.command('/template', async ctx => ctx.reply('Раздел находится в доработке.'));
// bot.command('/template', async ctx => ctx.scene.enter('templateScene'));
bot.command('/settings', ctx => {
    const admins = require('./config/admin.config');
    if (admins.includes(ctx.message.from.id.toString())) {
        return ctx.scene.enter('settingScene');
    }
});
bot.command('/id', ctx => {
    const userId = ctx.message.from.id;
    ctx.reply('Ваш идентификатор: ' + userId);
});
bot.command("/groupid", (ctx) => {
  ctx.reply("Идентификатор группы: " + ctx.message.chat.id);
});
bot.launch();
