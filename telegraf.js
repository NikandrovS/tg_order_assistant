const axios = require('axios');
const { Telegraf, session, Scenes: { BaseScene, Stage }, Markup } = require('telegraf');
const products = require('./config/product.config');

const company_keyboard = Markup.inlineKeyboard([
    Markup.button.callback('Изменить', 'edit'),
    Markup.button.callback('Добавить', 'add')
]);
const new_company_keyboard = Markup.inlineKeyboard([
    Markup.button.callback('Добавить', 'add')
]);
const delete_keyboard = (id) => Markup.inlineKeyboard([
    Markup.button.callback('Удалить', 'delete:' + id)
]);
const product_keyboard = Markup.inlineKeyboard(
    products
        .reduce((acc, item, idx) => {
            return [...acc, Markup.button.callback(item.name, 'choose:' + idx)];
        }, [])
        .reduce((resultArray, item, index) => {
            const chunkIndex = Math.floor(index / 2);

            if (!resultArray[chunkIndex]) {
                resultArray[chunkIndex] = []; // start a new chunk
            }

            resultArray[chunkIndex].push(item);

            if (index === products.length - 1) {
                resultArray.push([
                    Markup.button.callback('Отмена', 'cancel'),
                    Markup.button.callback('Продолжить', 'continue')
                ]);
            }

            return resultArray;
        }, [])
);
const product_action_keyboard = (productId) => Markup.inlineKeyboard([
    [
        Markup.button.callback('Возврат', 'return:' + productId),
        Markup.button.callback('Заказ', 'order:' + productId)
    ],
    [
        Markup.button.callback('⇦ Назад', 'back')
    ]
]);
const product_count_keyboard = (productId) => Markup.inlineKeyboard([
    [
        Markup.button.callback('-', 'decrease:' + productId),
        Markup.button.callback('+', 'increase:' + productId)
    ],
    [
        Markup.button.callback('❮❮ Ok', 'back'),
        Markup.button.callback('Далее ❯❯', 'return:' + productId)
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
orderScene.leave(ctx => ctx.session.cart = []);

// Выбор продукта
const itemScene = new BaseScene('itemScene');
itemScene.enter(ctx => ctx.reply(ctx.session.cart.length ? cartPreviewGenerator(ctx.session.cart) : `Какой продукт необходимо доставить в ${ ctx.session.store }?`, product_keyboard));

// Выбор продукта
itemScene.action(/choose:[0-9]{1,2}/, ctx => {
    const id = ctx.callbackQuery.data.split(':')[1];
    const itemInCart = ctx.session.cart.findIndex(product => product.id === id);
    if (itemInCart === -1) return ctx.editMessageText('Заказ: ' + products[id].name, product_count_keyboard(id));
    return ctx.editMessageText('Заказ: ' + products[id].name, product_count_keyboard(id));
});
itemScene.action('cancel', ctx => {
    ctx.deleteMessage();
    ctx.reply('Отменено');
    return ctx.scene.leave();
});

// Действия с продуктом
itemScene.action(/order:[0-9]{1,2}/, ctx => {
    const id = ctx.callbackQuery.data.split(':')[1];
    const itemInCart = ctx.session.cart.findIndex(product => product.id === id);
    if (!ctx.session.cart[itemInCart] || !ctx.session.cart[itemInCart].order) {
        return ctx.editMessageText('Заказ: ' + products[id].name, product_count_keyboard(id));
    }
    return ctx.editMessageText(`${ products[id].name }: ${ ctx.session.cart[itemInCart].order } кг.`, product_count_keyboard(id));
});
itemScene.action(/return:[0-9]{1,2}/, ctx => {
    ctx.deleteMessage();
    const id = ctx.callbackQuery.data.split(':')[1];
    return ctx.scene.enter('returnScene', { product: id });
});

itemScene.action('back', ctx => {
    return ctx.editMessageText(ctx.session.cart.length ? cartPreviewGenerator(ctx.session.cart) : `Какой продукт необходимо доставить в ${ ctx.session.store }?`, product_keyboard);
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
            totalString += `заказ ${ product.order } кг. `;
        }
        if (product.order && product.return) {
            totalString += `/ `;
        }
        if (product.return) {
            totalString += `возврат ${ product.return } г.`;
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
itemScene.action(/increase:[0-9]{1,2}/, ctx => {
    const id = ctx.callbackQuery.data.split(':')[1];
    let itemInCart = ctx.session.cart.findIndex(product => product.id === id);

    if (itemInCart === -1) {
        itemInCart = (ctx.session.cart.push({ id, name: products[id].name, order: 0, return: 0 })) - 1;
    }

    const weight = ctx.session.cart[itemInCart].order + products[id].package;
    ctx.session.cart[itemInCart].order = +weight.toFixed(2);

    return ctx.editMessageText(`${ products[id].name }: ${ ctx.session.cart[itemInCart].order } кг.`, product_count_keyboard(id));
});
itemScene.action(/decrease:[0-9]{1,2}/, ctx => {
    const id = ctx.callbackQuery.data.split(':')[1];
    const itemInCart = ctx.session.cart.findIndex(product => product.id === id);
    if (itemInCart === -1) return;

    if (ctx.session.cart[itemInCart].order >= products[id].package) {
        const weight = ctx.session.cart[itemInCart].order - products[id].package;
        ctx.session.cart[itemInCart].order = +weight.toFixed(2);
    } else {
        return;
    }

    return ctx.editMessageText(`${ products[id].name }: ${ ctx.session.cart[itemInCart] ? ctx.session.cart[itemInCart].order : 0 } кг.`, product_count_keyboard(id));
});

itemScene.leave();

const returnScene = new BaseScene('returnScene');
returnScene.enter(async ctx => {
    const { message_id } = await ctx.reply('Возврат: введите вес в граммах.', cancel_keyboard);
    ctx.scene.state.welcomeMessage = message_id;
});
returnScene.on('text', ctx => {
    const id = ctx.scene.state.product;
    if (!isNaN(parseInt(ctx.message.text))) {
        ctx.deleteMessage(ctx.message.message_id);

        let itemInCart = ctx.session.cart.findIndex(product => product.id === id);

        if (itemInCart === -1) {
            itemInCart = (ctx.session.cart.push({ id, name: products[id].name, order: 0, return: 0 })) - 1;
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
            totalString += `заказ ${ product.order } кг. `;
        }
        if (product.order && product.return) {
            totalString += `/ `;
        }
        if (product.return) {
            totalString += `возврат ${ product.return } г.`;
        }
    });

    ctx.scene.state.orderProducts = totalString;

    return ctx.replyWithHTML(totalString, order_confirm_keyboard);
});

confirmScene.action('back', ctx => {
    ctx.deleteMessage();
    return ctx.scene.enter('itemScene');
});
confirmScene.action('confirm', ctx => {
    ctx.deleteMessage();
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
    const { message_id } = await ctx.reply('Отправьте шаблон. Укажите заказ в кг., а вес в гр.', cancel_keyboard);
    ctx.scene.state.welcomeMessage = message_id;
});
templateScene.on('text', async ctx => {
    const cart = [];

    const templateData = ctx.message.text.split(/\n/);
    if (templateData.length < 2) return errorHandler('Сообщение должно содержать не менее двух строк.');

    const store = templateData[0];
    ctx.scene.state.store = store;

    for (let i = 1; i < templateData.length; i++) {
        const item = templateData[i].match(/(?<name>[а-яА-Я]*)\s+(?<order>[0-9][\.\,]?[0-9]*)\s+(?<return>[0-9]*)/);
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
            totalString += `заказ ${ product.order } кг. `;
        }
        if (product.order && product.return) {
            totalString += `/ `;
        }
        if (product.return) {
            totalString += `возврат ${ product.return } г.`;
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
newCompanyScene.enter(ctx => ctx.reply('Введите название организации', cancel_keyboard));
newCompanyScene.on('text', async ctx => {
    const res = await axios.post(process.env.BACKEND_HOST + '/api/company', {
        user: ctx.update.message.from.id,
        company: ctx.message.text
    });
    if (res.status === 200) {
        ctx.reply(`Добавлена организация: "${ ctx.message.text }"`);
        return ctx.scene.leave();
    }
    return ctx.reply('Ошибка при добавлении.');
});
newCompanyScene.action('cancel', ctx => {
    ctx.reply('Отменено');
    return ctx.scene.leave();
});
newCompanyScene.leave();

// Настройки
const settingScene = new BaseScene('settingScene');
settingScene.enter(async ctx => {
    const res = await axios.get(process.env.BACKEND_HOST + '/api/company/' + ctx.update.message.from.id);
    ctx.session.company = res.data;
    await ctx.reply(`Вами добавлено ${ res.data.length } ${ textHelper(res.data.length) }`);
    if (!res.data.length) {
        return ctx.reply('Выберите действие', new_company_keyboard);
    } else {
        return ctx.reply('Выберите действие', company_keyboard);
    }
});
settingScene.action('edit', ctx => {
    ctx.session.company.forEach(record => {
        ctx.reply(record.company, delete_keyboard(record._id));
    });
});
settingScene.action('add', ctx => {
    ctx.deleteMessage();
    ctx.scene.leave();
    return ctx.scene.enter('newCompanyScene');
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

const stage = new Stage([templateScene, orderScene, itemScene, confirmScene, returnScene, uploadScene, settingScene, newCompanyScene]);
stage.hears('Отмена', async ctx => {
    await ctx.reply('Отменено');
    return ctx.scene.leave();
});

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session(), stage.middleware());
bot.command('/start', ctx => ctx.reply('Добро пожаловать'));
bot.command('/order', async ctx => {
    const res = await axios.get(process.env.BACKEND_HOST + '/api/company/' + ctx.update.message.from.id);
    ctx.session.companyList = res.data;
    return ctx.scene.enter('orderScene');
});
bot.command('/template', async ctx => ctx.scene.enter('templateScene'));
bot.command('/settings', ctx => ctx.scene.enter('settingScene'));
bot.command('/id', ctx => {
    const userId = ctx.message.from.id;
    ctx.reply('Ваш идентификатор: ' + userId);
});
bot.launch();

function textHelper(count) {
    switch (count) {
        case 1:
            return 'организация';
        case 2:
        case 3:
        case 4:
            return 'организации';
        default:
            return 'организаций';
    }
}
