import { MediaWikiApi } from 'wiki-saikou';
import clientLogin from './utils/clientLogin.js';
import config from './utils/config.js';
import jsonToFormData from './utils/jsonToFormData.js';
import { getTimeData, editTimeData } from './utils/lastTime.js';
import splitAndJoin from './utils/splitAndJoin.js';

const abot = new MediaWikiApi(config.cm.api, { headers: { 'api-user-agent': config.apiuseragent } }),
	zhapi = new MediaWikiApi(config.zh.api, { headers: { 'api-user-agent': config.apiuseragent } }),
	cmapi = new MediaWikiApi(config.cm.api, { headers: { 'api-user-agent': config.apiuseragent } });

async function queryLogs(api, leaction, leend, lestart = undefined) {
	const result = [];
	const eol = Symbol();
	let lecontinue = undefined;
	while (lecontinue !== eol) {
		const { data } = await api.post({
			list: 'logevents',
			leprop: leaction === 'avatar/delete' ? 'ids|comment' : 'title',
			leaction,
			...lestart && { lestart },
			leend,
			lelimit: 'max',
			...leaction === 'avatar/delete' && { leuser: '星海-adminbot' },
			...lecontinue && { lecontinue },
		}, { retry: 10 });
		lecontinue = data.continue ? data.continue.lecontinue : eol;
		result.push(...data.query.logevents);
	}
	return leaction === 'avatar/delete'
		? [...new Set(result.filter(({ comment, suppressed }) => !suppressed && comment === '被隐藏的用户').map(({ logid }) => logid))]
		: [...new Set(result.map(({ title }) => title))];
}

async function queryPages(apprefix, apnamespace) {
	const { data: { query: { allpages } } } = await zhapi.post({
		list: 'allpages',
		apprefix,
		apnamespace,
	}, { retry: 10 });
	const prefixRegex = new RegExp(`^User(?: talk)?:(${apprefix}|${apprefix}/.*)$`);
	return allpages
		.map((page) => page.title)
		.filter((title) => prefixRegex.test(title));
}

//TODO: To fix the issue of hiding the page and improve the loop if there is a return.
async function hidePages(user) {
	let retry = 0;
	while (retry < 20) {
		const pagelist = await Promise.all([
			queryPages(user, '2'),
			queryPages(user, '3'),
		]).then((result) => result.flat());

		if (!pagelist.length) {
			break;
		}

		await Promise.all(pagelist.map(async (title) => {
			await zhapi.request.post('/index.php', jsonToFormData({
				title,
				action: 'delete',
				wpDeleteReasonList: 'other',
				wpReason: '被隐藏的用户',
				wpSuppress: '',
				wpConfirmB: '删除页面',
				wpEditToken: await zhapi.token('csrf'),
			}));
		}));

		retry++;
	}
}

async function hideAbuseLog(afluser) {
	let retry = 0;
	while (retry < 20) {
		const ids = await (async () => {
			const result = [];
			const eol = Symbol();
			let aflstart = undefined;
			while (aflstart !== eol) {
				const { data } = await zhapi.post({
					list: 'abuselog',
					afluser,
					afllimit: 'max',
					aflprop: 'ids|hidden',
					...aflstart && { aflstart },
				}, { retry: 10 });
				aflstart = data.continue ? data.continue.aflstart : eol;
				result.push(...data.query.abuselog);
			}
			return result.filter(({ hidden }) => !hidden).map(({ id }) => id);
		})();

		if (!ids.length) {
			break;
		}
		console.log(`Retry: ${retry}, ids: ${ids.length}`);

		await Promise.all(ids.map(async (id) => {
			await zhapi.request.post('/index.php', jsonToFormData({
				title: 'Special:滥用日志',
				hide: id,
				wpdropdownreason: 'other',
				wpreason: '被隐藏的用户',
				wphidden: true,
				wpEditToken: await zhapi.token('csrf'),
			})).then(() => console.log(`Try to hide ${id}`));
		}));

		retry++;
	}
}

async function deleteAvatar(user) {
	let retry = 0;
	while (retry < 10) {
		const { response: { data } } = await abot.request.post('/index.php', jsonToFormData({
			title: 'Special:查看头像',
			'delete': 'true',
			user,
			reason: '被隐藏的用户',
		}));
		if (data.includes('该用户没有头像。')) {
			console.log('Successful deleted the avatar!');
			break;
		}
		retry++;
		if (retry === 10) {
			console.warn('Failed to delete the avatar!');
		}
	}
}

(async () => {
	console.log(`Start time: ${new Date().toISOString()}`);

	await Promise.all([
		clientLogin(abot, config.cm.abot.account, config.password),
		clientLogin(zhapi, config.cm.sbot.account, config.password),
		clientLogin(cmapi, config.cm.sbot.account, config.password),
	]);

	const lastTime = await getTimeData('hide-user-log');
	const leend = lastTime['hide-user-log'],
		lestart = new Date().toISOString();
	
	const userlist = await Promise.all([
		queryLogs(zhapi, 'suppress/block', leend, lestart),
		queryLogs(zhapi, 'suppress/reblock', leend, lestart),
	]).then((result) => result.flat());

	await Promise.all(userlist.map(async (user) => {
		await Promise.all([
			hidePages(user),
			hideAbuseLog(user),
			deleteAvatar(user),
		]);
	}));

	const idlist = await Promise.all([
		Promise.all(userlist.map(async (user) => {
			const result = [];
			const eol = Symbol();
			let lecontinue = undefined;
			while (lecontinue !== eol) {
				const { data } = await cmapi.post({
					list: 'logevents',
					leprop: 'ids',
					leuser: user.replace('User:', ''),
					lelimit: 'max',
					...lecontinue && { lecontinue },
				}, { retry: 10 });
				lecontinue = data.continue ? data.continue.lecontinue : eol;
				result.push(...data.query.logevents);
			}
			return result
				.filter(({ suppressed }) => !suppressed)
				.map(({ logid }) => logid);
		})),
		queryLogs(cmapi, 'avatar/delete', new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
	]).then((result) => result.flat(Infinity));

	const idslist = splitAndJoin(idlist, 500);

	await Promise.all(idslist.map(async (ids) => {
		await cmapi.postWithToken('csrf', {
			action: 'revisiondelete',
			type: 'logging',
			ids,
			hide: 'content|user|comment',
			suppress: 'yes',
			reason: 'test',
			tags: 'Bot',
		}, {
			retry: 10,
			noCache: true,
		}).then(({ data }) => {
			data.revisiondelete.items = data.revisiondelete.items
				.map(({ status, id, action, type }) => ({ status, id, action, type }));
			console.log(JSON.stringify(data));
		});
	}));

	await editTimeData(lastTime, 'hide-user-log', lestart);

	console.log(`End time: ${new Date().toISOString()}`);
})();
