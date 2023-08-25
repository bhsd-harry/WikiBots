import { env } from 'process';
import { MediaWikiApi } from 'wiki-saikou';
import Parser from 'wikiparser-node';
import config from './utils/config.js';

const site = env.SITE;
const api = new MediaWikiApi(config[site].api, {
	headers: { 'api-user-agent': config.apiuseragent },
});

(async () => {
	console.log(`Start time: ${new Date().toISOString()}`);
	
	await api.login(config[site].main.name, config[site].main.password).then(console.log);

	const pagelist = await (async () => {
		const result = [];
		const eol = Symbol();
		let gcmcontinue = undefined;
		while (gcmcontinue !== eol) {
			const { data } = await api.post({
				rvprop: 'user|content',
				prop: 'revisions',
				generator: 'categorymembers',
				gcmtitle: 'Category:即将删除的页面',
				gcmprop: 'ids|title',
				gcmtype: 'page|subcat|file',
				gcmlimit: 'max',
				...gcmcontinue && { gcmcontinue },
			}, {
				retry: 10,
			});
			gcmcontinue = data.continue ? data.continue.gcmcontinue : eol;
			if (data?.query?.pages) {
				result.push(...Object.values(data.query.pages));
			}
		}
		return result;
	})();
	if (pagelist.length === 0) {
		console.log('No pages need to be deleted.');
		return;
	}

	const { data: { query: { allusers } } } = await api.post({
		list: 'allusers',
		aurights: 'rollback',
		aulimit: 'max',
	}, {
		retry: 10,
	});
	const userlist = allusers.map(({ name }) => name);
		
	await Promise.all(pagelist.map(async ({ pageid, revisions: [{ user: lastEditUser, content }] }) => {
		if (!content || !userlist.includes(lastEditUser)) {
			return;
		}

		const wikitext = Parser.parse(content);
		const templateUser = wikitext.querySelector('template#Template:即将删除').getValue('user');
		if (lastEditUser !== templateUser || !userlist.includes(templateUser)) {
			return;
		}
		const reason = wikitext.querySelector('template#Template:即将删除').getValue('1')?.trim() || '';
		if (!reason) {
			return;
		}

		await api.postWithToken('csrf', {
			action: 'delete',
			reason: `批量删除[[Cat:即将删除的页面]]（[[User_talk:${lastEditUser}|${lastEditUser}]]的挂删理由：${reason} ）`,
			pageid,
			tags: 'Automation tool',
		}, {
			retry: 20,
			noCache: true,
		}).then(({ data }) => console.log(JSON.stringify(data)));
	}));

	console.log(`End time: ${new Date().toISOString()}`);
})();
