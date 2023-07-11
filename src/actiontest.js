import { MediaWikiApi } from 'wiki-saikou';
import config from './utils/config.js';

const api = new MediaWikiApi(config.api.zh, {
    headers: {
        'api-user-agent': config.apiuseragent || '',
    },
});

console.log(`Start time: ${new Date().toISOString()}`);

api.login(config.bot.zh.name, config.bot.zh.password)
    .then(console.log, console.error)
    .then(() => {
        return api.postWithToken('csrf', {
            action: 'edit',
            title: 'User:星海子/test/001',
            text: `${new Date().toISOString()}`,
            summary: 'Github Actions Test - Cron',
            bot: true,
            tags: 'Bot',
        });
    });
