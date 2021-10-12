const axios = require('axios');
const { Telegraf, session, Scenes: { BaseScene, WizardScene, Stage }, Markup } = require('telegraf');

const menu_keyboard = Markup.keyboard(['📦 Заказ', '‍🔧 Настройки']);
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
const count_keyboard = Markup.inlineKeyboard([
    Markup.button.callback('-', 'decrease'),
    Markup.button.callback('ok', 'done'),
    Markup.button.callback('+', 'increase')
]);
const company_confirm_keyboard = Markup.inlineKeyboard([
    Markup.button.callback('Пропустить', 'skip'),
    Markup.button.callback('Продолжить', 'continue')
]);
const cancel_keyboard = Markup.inlineKeyboard([
    Markup.button.callback('Отмена', 'cancel')
]);

const items_keyboard = Markup.keyboard([['Колбаса', 'Сыр', 'Хлеб'], ['Ветчина', 'Молоко', 'Кефир', 'Мука'], ['Макароны', 'Курица', 'Вода']]);

const exit_keyboard = Markup.keyboard(['Отмена']);
const remove_keyboard = Markup.removeKeyboard();

// Оформление заказа
const orderScene = new BaseScene('orderScene');
orderScene.enter(async ctx => {
    if (!ctx.session.companyList.length) {
        return ctx.reply('Укажите название магазина', exit_keyboard);
    }
    ctx.reply('Выбор организации', exit_keyboard);
    return ctx.reply(`Организация: ${ ctx.session.companyList[0].company }. Желаете продолжить?`, company_confirm_keyboard);
});
orderScene.action('continue', async ctx => {
    ctx.deleteMessage();
    ctx.session.store = ctx.session.companyList[0].company;
    await ctx.reply(`Выбран магазин: ${ ctx.session.store }.`);
    setTimeout(() => {
        ctx.reply(`Какой продукт необходимо доставить в магазин ${ ctx.session.store }?`, items_keyboard);
    }, 500);
    return ctx.scene.enter('itemScene', { store: ctx.session.store }, true);
});
orderScene.action('skip', ctx => {
    ctx.deleteMessage();
    ctx.session.companyList.shift();
    return ctx.scene.enter('orderScene');
});
orderScene.on('text', ctx => {
    ctx.session.store = ctx.message.text;
    ctx.reply(`Выбран магазин: ${ ctx.message.text }.`);
    setTimeout(() => {
        ctx.reply(`Какой продукт необходимо доставить в магазин ${ ctx.message.text }?`, items_keyboard);
    }, 500);
    return ctx.scene.enter('itemScene', { store: ctx.message.text }, true);
});
orderScene.leave();

const itemScene = new BaseScene('itemScene');
// itemScene.enter(ctx => ctx.reply('Укажите название продукта', exit_keyboard));
itemScene.on('text', async ctx => {
    ctx.session.product = ctx.message.text;
    ctx.session.user = ctx.message.from.id;
    await ctx.reply(`В каком количестве необходим продукт ${ ctx.message.text }?`, exit_keyboard);
    return ctx.scene.enter('countScene', { store: ctx.message.text });
});
itemScene.leave();

const countScene = new BaseScene('countScene');
countScene.enter(ctx => {
    ctx.session.weight = 0;
    return ctx.reply(`Укажите в килограммах: ${ ctx.session.weight } кг.`, count_keyboard);
});
countScene.action('decrease', ctx => {
    if (!ctx.session.weight) return;
    ctx.session.weight -= 0.5;
    ctx.editMessageText(`Укажите в килограммах: ${ ctx.session.weight } кг.`, count_keyboard);
});
countScene.action('increase', ctx => {
    ctx.session.weight += 0.5;
    ctx.editMessageText(`Укажите в килограммах: ${ ctx.session.weight } кг.`, count_keyboard);
});
countScene.action('done', ctx => {
    if (!ctx.session.weight) {
        return ctx.reply('Необходимо указать вес!');
    } else {
        return ctx.scene.leave();
    }
});

countScene.leave(async (ctx) => {
    const data = {
        user: ctx.session.user,
        store: ctx.session.store,
        product: ctx.session.product,
        count: ctx.session.weight
    };
    for (const value of Object.values(data)) {
        if (!value) return;
    }
    try {
        const res = await axios.post(process.env.BACKEND_HOST + '/api', data);
        await ctx.reply(`Ваш заказ в магазин ${ ctx.session.store } оформлен.`);

        if (res.status === 200) {
            // setTimeout(() => {
            await ctx.reply(`В заказе: ${ ctx.session.product }, в количестве ${ ctx.session.weight }кг.`, menu_keyboard);
            // }, 500);
        }
    } catch (err) {
        console.log(err.message || err);
        ctx.reply(`Заказ не оформлен. При оформлении возникла ошибка.`, menu_keyboard);
    }
    if (ctx.session.companyList.length > 1) {
        ctx.session.companyList.shift();
        setTimeout(() => {
            return ctx.scene.enter('orderScene');
        }, 1500);
    } else {
        return ctx.reply('Спасибо!');
    }
});

// Добавление компании
const newCompanyScene = new BaseScene('newCompanyScene');
newCompanyScene.enter(ctx => ctx.reply('Введите название организации', cancel_keyboard));
newCompanyScene.on('text', async ctx => {
    const res = await axios.post(process.env.BACKEND_HOST + '/api/company', {
        user: ctx.update.message.from.id,
        company: ctx.message.text
    });
    if (res.status === 200) {
        ctx.reply(`Добавлена организация: "${ ctx.message.text }"`, menu_keyboard);
        return ctx.scene.leave();
    }
    return ctx.reply('Ошибка при добавлении.', menu_keyboard);
});
newCompanyScene.action('cancel', ctx => {
    ctx.reply('Отменено', menu_keyboard);
    return ctx.scene.leave();
});
newCompanyScene.leave();

// Настройки
const settingScene = new BaseScene('settingScene');
settingScene.enter(async ctx => {
    const res = await axios.get(process.env.BACKEND_HOST + '/api/company/' + ctx.update.message.from.id);
    ctx.session.company = res.data;
    await ctx.reply(`Вами добавлено ${ res.data.length } ${ textHelper(res.data.length) }`, exit_keyboard);
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
        ctx.reply('Организация удалена', menu_keyboard);
    } else {
        ctx.reply('Произошла ошибка', menu_keyboard);
    }
    return ctx.scene.leave();
});

const stage = new Stage([orderScene, itemScene, countScene, settingScene, newCompanyScene]);
stage.hears('Отмена', async ctx => {
    await ctx.reply('Отменено', menu_keyboard);
    return ctx.scene.leave();
});

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session(), stage.middleware());
bot.command('/start', ctx => ctx.reply('Добро пожаловать', menu_keyboard));

bot.hears('📦 Заказ', async ctx => {
    const res = await axios.get(process.env.BACKEND_HOST + '/api/company/' + ctx.update.message.from.id);
    ctx.session.companyList = res.data;
    return ctx.scene.enter('orderScene', exit_keyboard);
});
bot.hears('‍🔧 Настройки', ctx => ctx.scene.enter('settingScene'));
bot.launch();

function textHelper(count) {
    switch (count) {
        case 1:
            return 'организация';
        case 2:
            return 'организации';
        case 3:
            return 'организации';
        case 4:
            return 'организации';
        default:
            return 'организаций';
    }
}
